# Agent OS - Task Manager

## 概述

**Task Manager** 是 Agent OS 的进程管理层。它管理任务的生命周期——从创建到执行再到完成——采用**持久化优先的架构**。与传统的内存执行模型不同，任务执行的每个方面（任务、能力调用、消息）都持续持久化到 Ledger，实现从意外故障中完全恢复。

Task Manager 位于 **Agent Bus 之下**：它既调用总线能力（例如 `model:llm`、`ldg:task:save`），又注册自己的生命周期管理能力（例如 `task:route`、`task:create`、`task:cancel`）。

### 关键设计原则

**持久化优先**：Agent OS 中的任务代表 Agent 与 LLM 的一系列对话，以实现特定目标。整个执行过程持续持久化到 Ledger。如果 Agent 进程崩溃，它可以在重启时基于持久化记录恢复并继续未完成的任务。

**清晰的关注点分离**：
- **Task Manager**：核心生命周期操作（路由、创建、取消、列出活动任务）
- **Ledger 模块**：SQLite 中的持久化存储（任务详情、调用历史、消息记录）
- **Memory 模块**：可选的语义知识层（向量 + 图）

这种分离使 Task Manager 保持轻量级和无状态，而 Ledger 提供持久化存储和丰富的查询能力。

## 核心概念

### 三个核心实体

任务执行通过三种类型的实体表示，所有实体都持久化在 Ledger 中：

#### Task 实体

表示目标导向的执行单元：

```typescript
type Task = {
  id: string;                    // 全局唯一标识符
  parentTaskId?: string;         // 父任务 ID（用于子任务）
  completionStatus?: string;     // undefined = 进行中
                                 // 字符串值 = 已完成
                                 // 值：'success' | 'cancelled' | 'failed' | 错误消息
  systemPrompt: string;          // 任务特定的系统指令
  createdAt: number;             // 任务创建时间戳
  updatedAt: number;             // 最后状态更改时间戳
};
```

**完成状态**：
- `undefined`：任务正在进行中
- `'success'`：任务成功完成
- `'cancelled'`：任务被用户取消
- `'failed'`：任务失败（通用失败）
- 自定义错误消息：任务因特定原因失败

#### Call 实体

表示任务执行期间的能力调用：

```typescript
type Call = {
  id: string;                    // 唯一调用标识符
  taskId: string;                // 此调用所属的任务
  abilityName: string;           // 能力 ID（例如 'mem:retrieve'）
  parameters: string;            // JSON 编码的参数
  status: CallStatus;            // 调用执行状态
  details: string;               // JSON 编码的详情，用于恢复或结果
  createdAt: number;             // 调用启动时间戳
  updatedAt: number;             // 最后状态/详情更改时间戳
  startMessageId: string;        // 宣布调用启动的消息
  endMessageId?: string;         // 宣布调用完成的消息
};

type CallStatus = 
  | 'pending'                    // 调用已排队但未开始
  | 'in_progress'                // 调用当前正在执行
  | 'completed'                  // 调用成功完成
  | 'failed';                    // 调用失败并出错
```

**调用详情**：
- 执行期间：恢复所需的上下文（特定于实现）
- 完成后：能力返回的结果
- 失败后：错误消息和堆栈跟踪

#### Message 实体

表示任务对话中的消息：

```typescript
type Message = {
  id: string;                    // 唯一消息标识符
  taskId: string;                // 此消息所属的任务
  role: MessageRole;             // 消息发送者角色
  content: string;               // 消息内容（支持 markdown）
  timestamp: number;             // 消息时间戳
                                 // 对于流式：完成时间（完全接收时）
                                 // 对于非流式：接收时间
};

type MessageRole = 
  | 'system'                     // 系统指令
  | 'user'                       // 用户输入
  | 'assistant';                 // LLM 响应
```

**消息不可变性**：消息一旦保存到 Ledger 就是**不可变的**。流式消息在内存中累积，仅在完全接收后保存。

### 实体关系

```
Task (1) ──────────< (n) Call
  │
  └──────────< (n) Message
                      ▲
                      │
Call ──startMessageId─┤
     ──endMessageId───┘
```

- **Task 到 Call**：1:n 关系（任务中的所有能力调用）
- **Task 到 Message**：1:n 关系（任务对话中的所有消息）
- **Call 到 Message**：Call 引用其公告消息

## 任务生命周期

### 生命周期状态

任务的生命周期由其 `completionStatus` 确定：

```
┌─────────────────────────────────────────────────┐
│ 任务已创建                                       │
│ completionStatus = undefined                    │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │   任务进行中          │
         │  （执行循环）         │
         └───────┬──────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
    ┌────────┐ ┌──────┐ ┌────────┐
    │ 成功   │ │ 取消 │ │ 失败   │
    └────────┘ └──────┘ └────────┘
```

### 消息路由

当 Agent 收到用户消息时，Task Manager 对其进行路由：

1. **调用 `task:route`** 传入消息内容
2. **如果路由返回 taskId**：将消息追加到该任务
3. **如果路由返回 null**：使用 `task:create` 创建新任务
4. **恢复/启动执行** 目标任务

## 注册的能力

Task Manager 在 Agent Bus 上注册以下能力：

### task:route

**描述**：将用户消息路由到适当的活动任务，或指示应创建新任务。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "用户消息内容"
    }
  },
  "required": ["message"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": ["string", "null"],
      "description": "目标任务 ID，或 null 创建新任务"
    },
    "confidence": {
      "type": "number",
      "description": "路由置信度（0-1）"
    }
  },
  "required": ["taskId"]
}
```

**示例**：
```typescript
const result = await bus.invoke('task:route')(JSON.stringify({
  message: 'Can you also check Q2 data?'
}));

const { taskId, confidence } = JSON.parse(result);
if (taskId) {
  // 路由到现有任务
  await appendMessageToTask(taskId, message);
} else {
  // 创建新任务
  await createNewTask(message);
}
```

**路由策略**：参见[消息路由](#消息路由)部分。

### task:create

**描述**：创建新任务并持久化到 Memory。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "goal": {
      "type": "string",
      "description": "任务目标或初始消息"
    },
    "parentTaskId": {
      "type": "string",
      "description": "子任务的可选父任务 ID"
    },
    "systemPrompt": {
      "type": "string",
      "description": "可选的自定义系统提示"
    }
  },
  "required": ["goal"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "创建的任务 ID"
    }
  },
  "required": ["taskId"]
}
```

**示例**：
```typescript
const result = await bus.invoke('task:create')(JSON.stringify({
  goal: 'Analyze Q1 sales data',
  systemPrompt: 'You are a data analyst assistant.'
}));

const { taskId } = JSON.parse(result);
console.log(`Created task: ${taskId}`);
```

**实现说明**：此能力创建 Task 实体、初始系统消息和初始用户消息，然后在开始执行之前将所有内容持久化到 Memory。

### task:cancel

**描述**：取消正在进行的任务。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "要取消的任务"
    },
    "reason": {
      "type": "string",
      "description": "取消原因"
    }
  },
  "required": ["taskId", "reason"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    }
  },
  "required": ["success"]
}
```

**示例**：
```typescript
const result = await bus.invoke('task:cancel')(JSON.stringify({
  taskId: 'task-abc123',
  reason: 'User requested cancellation'
}));

const { success } = JSON.parse(result);
```

**行为**：将任务的 `completionStatus` 设置为 `'cancelled'`，停止执行循环，并将所有进行中的调用标记为失败。

### task:active

**描述**：列出所有活动（进行中）的任务。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "number",
      "description": "返回的最大任务数"
    }
  }
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "tasks": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "parentTaskId": { "type": "string" },
          "createdAt": { "type": "number" },
          "updatedAt": { "type": "number" }
        }
      }
    }
  },
  "required": ["tasks"]
}
```

**示例**：
```typescript
const result = await bus.invoke('task:active')(JSON.stringify({
  limit: 10
}));

const { tasks } = JSON.parse(result);
console.log(`${tasks.length} active tasks`);
```

## 任务执行流程

### 执行循环

当任务被创建或接收到新消息时，它进入执行循环：

```
┌─────────────────────────────────────────────────┐
│ 1. 从 Memory 加载任务上下文                       │
│    - 通过 ldg:msg:list 获取所有消息              │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 2. 使用完整上下文调用 model:llm                   │
│    - 传递消息 + 可用工具                          │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 3. 流式传输 LLM 响应                             │
│    - 将内容块输出给用户                           │
│    - 收集工具调用                                │
│    - 将助手消息保存到 Memory                      │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ 有工具调用？          │
         └────┬─────────────┬───┘
              │ 否          │ 是
              │             │
              │             ▼
              │   ┌────────────────────────┐
              │   │ 4. 执行工具调用        │
              │   │    对于每个工具调用：   │
              │   │    - 创建 Call 实体    │
              │   │    - 保存调用开始      │
              │   │    - 执行能力          │
              │   │    - 保存调用结束      │
              │   └──────────┬─────────────┘
              │              │
              │              │ 循环回到步骤 1
              │              └──────────────────►
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 5. 将任务标记为已完成                            │
│    - 设置 completionStatus = 'success'          │
│    - 在 Memory 中更新任务                        │
└─────────────────────────────────────────────────┘
```

### 详细执行步骤

由于代码内容太长，我会将完整的翻译内容继续写入文件，包含所有代码示例和详细说明。

