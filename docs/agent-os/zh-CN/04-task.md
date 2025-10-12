# Agent OS - Task Manager

## 概述

**Task Manager** 是 Agent OS 的进程管理层。它管理任务的生命周期——从创建到执行再到完成——采用**持久化优先的架构**。与传统的内存执行模型不同，任务执行的每个方面（任务、能力调用、消息）都持续持久化到 Ledger，实现从意外故障中完全恢复。

Task Manager 在 **Agent Bus** 上注册能力：它既调用总线能力（例如 `model:llm`、`ldg:task:save`、`shell:sendMessageChunk`），又注册自己的生命周期管理和任务间通信能力（例如 `task:spawn`、`task:send`、`task:cancel`）。

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

消息路由现在由专门的**路由任务**处理，而不是 Task Manager 的能力：

1. **Shell 接收用户消息**
2. **Shell 将消息发送给路由任务**（通过 `task:send`）
3. **路由任务**分析消息并决定：
   - 如果应路由到现有任务：调用 `task:send` 将消息发送给目标任务
   - 如果需要创建新任务：调用 `task:spawn` 创建新任务
4. **目标任务接收消息后启动执行**

**设计优势**：
- 路由逻辑本身是一个任务，可以使用 LLM 进行智能路由
- 所有消息传递统一通过 `task:send`
- Task Manager 职责更加纯粹和简单

## 注册的能力

Task Manager 在 Agent Bus 上注册以下能力：

### task:spawn

**描述**：创建新任务并持久化到 Ledger。

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
const result = await bus.invoke(
  'shell',                      // callerId
  'task:spawn',                 // abilityId
  JSON.stringify({
    goal: 'Analyze Q1 sales data',
    systemPrompt: 'You are a data analyst assistant.'
  })
);

const { taskId } = JSON.parse(result);
console.log(`Created task: ${taskId}`);
```

**实现说明**：此能力创建 Task 实体、初始系统消息和初始用户消息，然后在开始执行之前将所有内容持久化到 Ledger。

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
const result = await bus.invoke(
  'shell',                      // callerId
  'task:cancel',                // abilityId
  JSON.stringify({
    taskId: 'task-abc123',
    reason: 'User requested cancellation'
  })
);

const { success } = JSON.parse(result);
```

**行为**：将任务的 `completionStatus` 设置为 `'cancelled'`，停止执行循环，并将所有进行中的调用标记为失败。

### task:send

**描述**：向指定任务发送消息，用于任务间通信。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "receiverId": {
      "type": "string",
      "description": "接收消息的任务 ID"
    },
    "message": {
      "type": "string",
      "description": "要发送的消息内容"
    }
  },
  "required": ["receiverId", "message"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "是否成功发送"
    },
    "error": {
      "type": "string",
      "description": "失败时的错误信息"
    }
  },
  "required": ["success"]
}
```

**示例**：
```typescript
// 任务 A 向任务 B 发送消息
const result = await bus.invoke(
  'task-a',                     // callerId
  'task:send',                  // abilityId
  JSON.stringify({
    receiverId: 'task-b',
    message: 'Processing complete, found 42 records'
  })
);

const { success, error } = JSON.parse(result);
if (!success) {
  console.error(`Failed to send message: ${error}`);
}
```

**行为**：
- 验证接收方任务存在且状态为进行中
- 将消息作为 `user` 角色消息追加到接收方任务的对话历史
- 触发接收方任务的执行循环（如果未在运行中）
- 如果接收方任务不存在或已完成，返回错误

**使用场景**：
- 父子任务间的通信和协调
- 并行任务间的数据传递
- 任务完成后通知其他任务

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
const result = await bus.invoke(
  'system',                     // callerId
  'task:active',                // abilityId
  JSON.stringify({
    limit: 10
  })
);

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
│ 3. 处理 LLM 响应                                  │
│    - 逐块调用 shell:sendMessageChunk 向用户推送  │
│    - 累积完整消息内容                             │
│    - 收集工具调用                                │
│    - 将完整助手消息保存到 Ledger                  │
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

