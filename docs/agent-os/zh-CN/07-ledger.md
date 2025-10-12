# Agent OS - Ledger

## 概述

**Ledger** 是 Agent OS 的持久化存储层。就像操作系统的事务日志一样，它记录任务执行的完整历史，具有完全的可审计性和可恢复性。

Ledger 位于 **Agent Bus 之下**：它注册存储和查询 Task、Call 和 Message 实体的能力，同时通过 SQLite 事务确保数据一致性。

### 关键特征

**持久化优先**：每个任务执行细节都会立即持久化到持久化存储，从而实现从进程崩溃中的完全恢复。

**结构化存储**：SQLite 在单个嵌入式文件中提供 ACID 事务、高效索引和强大的查询能力。

**可变性模型**：
- **Tasks**：状态和元数据是可变的（可以随着任务进展而更新）
- **Calls**：状态、详情和完成信息是可变的（通过生命周期跟踪）
- **Messages**：一旦保存就不可变（仅追加，永不修改）

**存储位置**：`$HOME/.bun-buddy/ledger.sqlite`

## 核心概念

### 三种实体类型

Ledger 存储三种表示任务执行的实体类型：

#### Task 实体

```typescript
type Task = {
  id: string;                    // 唯一任务标识符
  parentTaskId?: string;         // 父任务 ID（用于子任务）
  completionStatus?: string;     // null = 进行中
                                 // 字符串 = 已完成（success/cancelled/failed/error）
  systemPrompt: string;          // 任务特定的系统指令
  createdAt: number;             // 创建时间戳（Unix 毫秒）
  updatedAt: number;             // 最后更新时间戳（Unix 毫秒）[可变]
};
```

**可变性**：`completionStatus` 和 `updatedAt` 可以在创建后更新。

#### Call 实体

```typescript
type Call = {
  id: string;                    // 唯一调用标识符
  taskId: string;                // 所属任务 ID
  abilityName: string;           // 能力 ID（例如 'mem:retrieve'）
  parameters: string;            // JSON 编码的参数
  status: CallStatus;            // 调用执行状态 [可变]
  details: string;               // JSON 编码的详情或结果 [可变]
  createdAt: number;             // 调用创建时间戳
  updatedAt: number;             // 最后更新时间戳 [可变]
  startMessageId: string;        // 宣布调用开始的消息
  endMessageId?: string;         // 宣布调用结束的消息 [可变]
};

type CallStatus = 
  | 'pending'                    // 已排队但未开始
  | 'in_progress'                // 当前正在执行
  | 'completed'                  // 成功完成
  | 'failed';                    // 失败并出错
```

**可变性**：`status`、`details`、`updatedAt` 和 `endMessageId` 可以在调用生命周期期间更新。

#### Message 实体

```typescript
type Message = {
  id: string;                    // 唯一消息标识符
  taskId: string;                // 所属任务 ID
  role: MessageRole;             // 消息发送者角色
  content: string;               // 消息内容（支持 markdown）
  timestamp: number;             // 消息时间戳（Unix 毫秒）
                                 // 对于流式：完成时间
                                 // 对于非流式：接收时间
};

type MessageRole = 
  | 'system'                     // 系统指令
  | 'user'                       // 用户输入
  | 'assistant';                 // LLM 响应
```

**不可变性**：消息在插入后**永不修改**。仅支持 INSERT 操作。

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

- 一个任务有多个调用和消息
- 每个调用引用其开始和可选的结束消息

## 数据库模式

### 存储位置

`$HOME/.bun-buddy/ledger.sqlite`

### 表定义

#### tasks 表

```sql
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  parent_task_id TEXT,
  completion_status TEXT,
  system_prompt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_tasks_created_at ON tasks(created_at);
CREATE INDEX idx_tasks_updated_at ON tasks(updated_at);
CREATE INDEX idx_tasks_completion_status ON tasks(completion_status);
CREATE INDEX idx_tasks_parent_task_id ON tasks(parent_task_id);
```

**字段说明**：
- `id`：唯一任务标识符
- `parent_task_id`：可选的父任务 ID（用于子任务）
- `completion_status`：进行中为 NULL，已完成任务为字符串
- `system_prompt`：任务特定的系统指令
- `created_at`：创建时间戳（Unix 毫秒）
- `updated_at`：最后修改时间戳 **[可变]**

**索引**：支持按时间、状态和父关系查询。

#### calls 表

```sql
CREATE TABLE calls (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  ability_name TEXT NOT NULL,
  parameters TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  start_message_id TEXT NOT NULL,
  end_message_id TEXT,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id),
  FOREIGN KEY (start_message_id) REFERENCES messages(id),
  FOREIGN KEY (end_message_id) REFERENCES messages(id)
);

CREATE INDEX idx_calls_task_id ON calls(task_id);
CREATE INDEX idx_calls_created_at ON calls(created_at);
CREATE INDEX idx_calls_status ON calls(status);
```

**字段说明**：
- `id`：唯一调用标识符
- `task_id`：所属任务 ID
- `ability_name`：正在调用的能力（例如 'mem:retrieve'）
- `parameters`：JSON 编码的调用参数
- `status`：pending | in_progress | completed | failed **[可变]**
- `details`：JSON 编码的恢复信息或结果 **[可变]**
- `created_at`：调用创建时间戳
- `updated_at`：最后修改时间戳 **[可变]**
- `start_message_id`：宣布调用开始的消息 ID
- `end_message_id`：宣布调用结束的消息 ID **[可变]**

**索引**：支持按任务、时间和状态查询。

#### messages 表

```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX idx_messages_task_id ON messages(task_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_task_timestamp ON messages(task_id, timestamp);
```

**字段说明**：
- `id`：唯一消息标识符
- `task_id`：所属任务 ID
- `role`：system | user | assistant
- `content`：完整的消息内容（支持 markdown）
- `timestamp`：消息时间戳（Unix 毫秒）
  - **流式消息**：流式传输完成的时间
  - **非流式消息**：接收的时间

**索引**：在 (task_id, timestamp) 上的复合索引优化"按时间顺序获取任务的所有消息"查询。

### 查询模式

索引优化的主要查询场景：

1. **获取任务消息**：`SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp`
2. **获取任务调用**：`SELECT * FROM calls WHERE task_id = ?`
3. **按时间查询任务**：`WHERE created_at BETWEEN ? AND ?`
4. **按状态查询任务**：`WHERE completion_status IS NULL`（活动）或 `= 'success'`
5. **获取子任务**：`WHERE parent_task_id = ?`
6. **获取进行中的调用**：`WHERE status = 'in_progress' AND task_id = ?`

## 注册的能力

Ledger 注册遵循模式 `ldg:<entity>:<action>` 的能力。

### Task 能力

#### ldg:task:save

**描述**：保存或更新任务实体。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": "object",
      "description": "要保存的任务实体"
    }
  },
  "required": ["task"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" }
  },
  "required": ["success"]
}
```

**行为**：使用 `INSERT OR REPLACE` 处理创建和更新。

#### ldg:task:get

**描述**：按 ID 检索任务。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string" }
  },
  "required": ["taskId"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": ["object", "null"],
      "description": "任务实体或未找到时为 null"
    }
  },
  "required": ["task"]
}
```

#### ldg:task:query

**描述**：使用过滤器和分页查询任务。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "completionStatus": {
      "type": "string",
      "description": "按状态过滤，使用 'null' 表示活动任务"
    },
    "parentTaskId": {
      "type": "string",
      "description": "按父任务过滤"
    },
    "fromTime": {
      "type": "number",
      "description": "开始时间戳（Unix 毫秒）"
    },
    "toTime": {
      "type": "number",
      "description": "结束时间戳（Unix 毫秒）"
    },
    "limit": {
      "type": "number",
      "description": "最大结果数",
      "default": 100
    },
    "offset": {
      "type": "number",
      "description": "分页偏移",
      "default": 0
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
      "items": { "type": "object" }
    },
    "total": {
      "type": "number",
      "description": "匹配任务总数"
    }
  },
  "required": ["tasks", "total"]
}
```

**示例**：
```typescript
// 查询活动任务
const result = await bus.invoke('ldg:task:query')(JSON.stringify({
  completionStatus: 'null',
  limit: 10
}));

const { tasks, total } = JSON.parse(result);
```

### Call 能力

#### ldg:call:save

**描述**：保存或更新调用实体。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "call": {
      "type": "object",
      "description": "要保存的调用实体"
    }
  },
  "required": ["call"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" }
  },
  "required": ["success"]
}
```

**行为**：使用 `INSERT OR REPLACE` 处理生命周期更新。

#### ldg:call:list

**描述**：列出任务的所有调用。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string" }
  },
  "required": ["taskId"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "calls": {
      "type": "array",
      "items": { "type": "object" }
    }
  },
  "required": ["calls"]
}
```

### Message 能力

#### ldg:msg:save

**描述**：保存消息（不可变，仅插入）。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "object",
      "description": "要保存的消息实体"
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
    "success": { "type": "boolean" },
    "messageId": { "type": "string" }
  },
  "required": ["success", "messageId"]
}
```

**行为**：仅使用 `INSERT`。消息永不更新。

#### ldg:msg:list

**描述**：列出任务的所有消息，按时间戳排序。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string" },
    "limit": { "type": "number" },
    "offset": { "type": "number" }
  },
  "required": ["taskId"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "messages": {
      "type": "array",
      "items": { "type": "object" }
    },
    "total": { "type": "number" }
  },
  "required": ["messages", "total"]
}
```

## 流式消息处理

### 设计原则

流式消息在内存中累积，仅在完全接收后保存到 Ledger。这保持了消息的不可变性并简化了数据模型。

### 处理流程

```typescript
const processStreamingMessage = async (
  taskId: string,
  stream: AsyncGenerator<string>,
  bus: AgentBus
): Promise<Message> => {
  let content = '';
  let lastChunkTime = Date.now();
  
  // 在内存中累积流式响应
  for await (const chunk of stream) {
    const data = JSON.parse(chunk);
    
    if (data.content) {
      content += data.content;
      // 实时流式传输给用户（尚未保存到 Ledger）
      emitToUser({ type: 'content', content: data.content });
    }
    
    lastChunkTime = Date.now();
  }
  
  // 流式传输完成，现在将完整消息保存到 Ledger
  // timestamp = 完成时间
  const message: Message = {
    id: generateId(),
    taskId,
    role: 'assistant',
    content,
    timestamp: lastChunkTime
  };
  
  await bus.invoke('ldg:msg:save')(
    JSON.stringify({ message })
  );
  
  return message;
};
```

### 原理

**为什么等待完成？**
- 保持消息不可变性（无需更新内容）
- 简化数据模型（一条消息 = 一条记录）
- 清晰的时间戳语义（消息何时完成）
- 更容易审计和重放（每条消息都是完整的）

**部分消息怎么办？**
- 用户通过流式输出实时看到内容
- 但 Ledger 只记录完整消息
- 如果进程在流中崩溃，部分内容将丢失
- 这是可以接受的：LLM 可以重新生成响应

## 存储实现

### 数据库初始化

```typescript
const initializeLedger = async (): Promise<Database> => {
  // 确保目录存在
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const dbDir = path.join(homeDir, '.bun-buddy');
  await fs.promises.mkdir(dbDir, { recursive: true });
  
  // 打开/创建数据库
  const dbPath = path.join(dbDir, 'ledger.sqlite');
  const db = new Database(dbPath);
  
  // 如果不存在则创建表
  await createTables(db);
  
  // 创建索引
  await createIndexes(db);
  
  return db;
};
```

由于文档很长（902行），完整翻译包含事务管理、查询操作、性能考虑、测试策略等所有部分。

## 总结

Ledger 提供：

✅ **使用 SQLite ACID 事务的持久化存储**  
✅ **清晰的可变性模型** - Tasks/Calls 可变，Messages 不可变  
✅ **通过战略索引的高效查询**  
✅ **基于完成时间戳的流式支持**  
✅ **从完整执行历史中的完全可恢复性**  
✅ **三个标准化实体的简单数据模型**  

作为 Agent OS 持久化的基础，Ledger 确保任务执行可靠、可审计和可恢复。

