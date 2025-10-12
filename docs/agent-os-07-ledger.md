# Agent OS - Ledger

## Overview

The **Ledger** is the persistent storage layer of Agent OS. Like an operating system's transaction log, it records the complete history of task execution with full auditability and recoverability.

Ledger sits **below the Agent Bus**: it registers abilities for storing and querying Task, Call, and Message entities while ensuring data consistency through SQLite transactions.

### Key Characteristics

**Persistence-First**: Every task execution detail is immediately persisted to durable storage, enabling full recovery from process crashes.

**Structured Storage**: SQLite provides ACID transactions, efficient indexing, and powerful query capabilities in a single embedded file.

**Mutability Model**:
- **Tasks**: Status and metadata are mutable (can be updated as task progresses)
- **Calls**: Status, details, and completion info are mutable (tracked through lifecycle)
- **Messages**: Immutable once saved (append-only, never modified)

**Storage Location**: `$HOME/.bun-buddy/ledger.sqlite`

## Core Concepts

### Three Entity Types

The Ledger stores three types of entities representing task execution:

#### Task Entity

```typescript
type Task = {
  id: string;                    // Unique task identifier
  parentTaskId?: string;         // Parent task ID (for subtasks)
  completionStatus?: string;     // null = in progress
                                 // string = completed (success/cancelled/failed/error)
  systemPrompt: string;          // Task-specific system instructions
  createdAt: number;             // Creation timestamp (Unix ms)
  updatedAt: number;             // Last update timestamp (Unix ms) [MUTABLE]
};
```

**Mutability**: `completionStatus` and `updatedAt` can be updated after creation.

#### Call Entity

```typescript
type Call = {
  id: string;                    // Unique call identifier
  taskId: string;                // Owning task ID
  abilityName: string;           // Ability ID (e.g., 'mem:retrieve')
  parameters: string;            // JSON-encoded parameters
  status: CallStatus;            // Call execution status [MUTABLE]
  details: string;               // JSON-encoded details or result [MUTABLE]
  createdAt: number;             // Call creation timestamp
  updatedAt: number;             // Last update timestamp [MUTABLE]
  startMessageId: string;        // Message announcing call start
  endMessageId?: string;         // Message announcing call end [MUTABLE]
};

type CallStatus = 
  | 'pending'                    // Queued but not started
  | 'in_progress'                // Currently executing
  | 'completed'                  // Finished successfully
  | 'failed';                    // Failed with error
```

**Mutability**: `status`, `details`, `updatedAt`, and `endMessageId` can be updated during call lifecycle.

#### Message Entity

```typescript
type Message = {
  id: string;                    // Unique message identifier
  taskId: string;                // Owning task ID
  role: MessageRole;             // Message sender role
  content: string;               // Message content (supports markdown)
  timestamp: number;             // Message timestamp (Unix ms)
                                 // For streaming: completion time
                                 // For non-streaming: receipt time
};

type MessageRole = 
  | 'system'                     // System instructions
  | 'user'                       // User input
  | 'assistant';                 // LLM response
```

**Immutability**: Messages are **never modified** after insertion. Only INSERT operations are supported.

### Entity Relationships

```
Task (1) ──────────< (n) Call
  │
  └──────────< (n) Message
                      ▲
                      │
Call ──startMessageId─┤
     ──endMessageId───┘
```

- One task has many calls and messages
- Each call references its start and optional end message

## Database Schema

### Storage Location

`$HOME/.bun-buddy/ledger.sqlite`

### Table Definitions

#### tasks Table

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

**Field Descriptions**:
- `id`: Unique task identifier
- `parent_task_id`: Optional parent task ID (for subtasks)
- `completion_status`: NULL for in-progress, string for completed tasks
- `system_prompt`: Task-specific system instructions
- `created_at`: Creation timestamp (Unix milliseconds)
- `updated_at`: Last modification timestamp **[MUTABLE]**

**Indexes**: Support queries by time, status, and parent relationship.

#### calls Table

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

**Field Descriptions**:
- `id`: Unique call identifier
- `task_id`: Owning task ID
- `ability_name`: Ability being invoked (e.g., 'mem:retrieve')
- `parameters`: JSON-encoded call parameters
- `status`: pending | in_progress | completed | failed **[MUTABLE]**
- `details`: JSON-encoded recovery info or result **[MUTABLE]**
- `created_at`: Call creation timestamp
- `updated_at`: Last modification timestamp **[MUTABLE]**
- `start_message_id`: ID of message announcing call start
- `end_message_id`: ID of message announcing call end **[MUTABLE]**

**Indexes**: Support queries by task, time, and status.

#### messages Table

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

**Field Descriptions**:
- `id`: Unique message identifier
- `task_id`: Owning task ID
- `role`: system | user | assistant
- `content`: Full message content (markdown supported)
- `timestamp`: Message timestamp (Unix milliseconds)
  - **Streaming messages**: Time when streaming completed
  - **Non-streaming messages**: Time when received

**Indexes**: Composite index on (task_id, timestamp) optimizes "get all messages for task ordered by time" queries.

### Query Patterns

Primary query scenarios optimized by indexes:

1. **Get task messages**: `SELECT * FROM messages WHERE task_id = ? ORDER BY timestamp`
2. **Get task calls**: `SELECT * FROM calls WHERE task_id = ?`
3. **Query tasks by time**: `WHERE created_at BETWEEN ? AND ?`
4. **Query tasks by status**: `WHERE completion_status IS NULL` (active) or `= 'success'`
5. **Get subtasks**: `WHERE parent_task_id = ?`
6. **Get in-progress calls**: `WHERE status = 'in_progress' AND task_id = ?`

## Registered Abilities

Ledger registers abilities following the pattern `ldg:<entity>:<action>`.

### Task Abilities

#### ldg:task:save

**Description**: Save or update a task entity.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": "object",
      "description": "Task entity to save"
    }
  },
  "required": ["task"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" }
  },
  "required": ["success"]
}
```

**Behavior**: Uses `INSERT OR REPLACE` to handle both creation and updates.

#### ldg:task:get

**Description**: Retrieve a task by ID.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string" }
  },
  "required": ["taskId"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "task": {
      "type": ["object", "null"],
      "description": "Task entity or null if not found"
    }
  },
  "required": ["task"]
}
```

#### ldg:task:query

**Description**: Query tasks with filters and pagination.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "completionStatus": {
      "type": "string",
      "description": "Filter by status, use 'null' for active tasks"
    },
    "parentTaskId": {
      "type": "string",
      "description": "Filter by parent task"
    },
    "fromTime": {
      "type": "number",
      "description": "Start timestamp (Unix ms)"
    },
    "toTime": {
      "type": "number",
      "description": "End timestamp (Unix ms)"
    },
    "limit": {
      "type": "number",
      "description": "Maximum results",
      "default": 100
    },
    "offset": {
      "type": "number",
      "description": "Pagination offset",
      "default": 0
    }
  }
}
```

**Output Schema**:
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
      "description": "Total matching tasks"
    }
  },
  "required": ["tasks", "total"]
}
```

**Example**:
```typescript
// Query active tasks
const result = await bus.invoke('ldg:task:query')(JSON.stringify({
  completionStatus: 'null',
  limit: 10
}));

const { tasks, total } = JSON.parse(result);
```

### Call Abilities

#### ldg:call:save

**Description**: Save or update a call entity.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "call": {
      "type": "object",
      "description": "Call entity to save"
    }
  },
  "required": ["call"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" }
  },
  "required": ["success"]
}
```

**Behavior**: Uses `INSERT OR REPLACE` to handle lifecycle updates.

#### ldg:call:list

**Description**: List all calls for a task.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": { "type": "string" }
  },
  "required": ["taskId"]
}
```

**Output Schema**:
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

### Message Abilities

#### ldg:msg:save

**Description**: Save a message (immutable, insert-only).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "object",
      "description": "Message entity to save"
    }
  },
  "required": ["message"]
}
```

**Output Schema**:
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

**Behavior**: Uses `INSERT` only. Messages are never updated.

#### ldg:msg:list

**Description**: List all messages for a task, ordered by timestamp.

**Input Schema**:
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

**Output Schema**:
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

## Streaming Message Handling

### Design Principle

Streaming messages are accumulated in memory and saved to Ledger only after complete reception. This maintains message immutability and simplifies the data model.

### Processing Flow

```typescript
const processStreamingMessage = async (
  taskId: string,
  stream: AsyncGenerator<string>,
  bus: AgentBus
): Promise<Message> => {
  let content = '';
  let lastChunkTime = Date.now();
  
  // Accumulate streaming response in memory
  for await (const chunk of stream) {
    const data = JSON.parse(chunk);
    
    if (data.content) {
      content += data.content;
      // Stream to user in real-time (not saved to Ledger yet)
      emitToUser({ type: 'content', content: data.content });
    }
    
    lastChunkTime = Date.now();
  }
  
  // Streaming complete, now save full message to Ledger
  // timestamp = completion time
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

### Rationale

**Why wait for completion?**
- Maintains message immutability (no need to update content)
- Simplifies data model (one message = one record)
- Clear timestamp semantics (when message completed)
- Easier auditing and replay (every message is complete)

**What about partial messages?**
- User sees content in real-time via streaming output
- But Ledger only records complete messages
- If process crashes mid-stream, partial content is lost
- This is acceptable: LLM can regenerate response

## Storage Implementation

### Database Initialization

```typescript
const initializeLedger = async (): Promise<Database> => {
  // Ensure directory exists
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const dbDir = path.join(homeDir, '.bun-buddy');
  await fs.promises.mkdir(dbDir, { recursive: true });
  
  // Open/create database
  const dbPath = path.join(dbDir, 'ledger.sqlite');
  const db = new Database(dbPath);
  
  // Create tables if not exist
  await createTables(db);
  
  // Create indexes
  await createIndexes(db);
  
  return db;
};

const createTables = async (db: Database): Promise<void> => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      parent_task_id TEXT,
      completion_status TEXT,
      system_prompt TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (parent_task_id) REFERENCES tasks(id)
    );
    
    CREATE TABLE IF NOT EXISTS calls (
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
    
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );
  `);
};
```

### Transaction Management

```typescript
const saveTaskWithMessages = async (
  task: Task,
  messages: Message[],
  db: Database
): Promise<void> => {
  const transaction = db.transaction(() => {
    // Save task
    db.prepare(`
      INSERT OR REPLACE INTO tasks
      (id, parent_task_id, completion_status, system_prompt, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      task.id,
      task.parentTaskId || null,
      task.completionStatus || null,
      task.systemPrompt,
      task.createdAt,
      task.updatedAt
    );
    
    // Save messages
    const insertMsg = db.prepare(`
      INSERT INTO messages
      (id, task_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const msg of messages) {
      insertMsg.run(
        msg.id,
        msg.taskId,
        msg.role,
        msg.content,
        msg.timestamp
      );
    }
  });
  
  transaction();
};
```

### Update Operations

```typescript
// Update task status
const updateTaskStatus = (
  taskId: string,
  completionStatus: string,
  db: Database
): void => {
  db.prepare(`
    UPDATE tasks
    SET completion_status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(completionStatus, Date.now(), taskId);
};

// Update call status
const updateCallStatus = (
  callId: string,
  status: CallStatus,
  details: string,
  endMessageId: string | undefined,
  db: Database
): void => {
  db.prepare(`
    UPDATE calls
    SET status = ?,
        details = ?,
        end_message_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(
    status,
    details,
    endMessageId || null,
    Date.now(),
    callId
  );
};
```

### Query Operations

```typescript
// Get all messages for task
const getTaskMessages = (
  taskId: string,
  db: Database
): Message[] => {
  const rows = db.prepare(`
    SELECT id, task_id, role, content, timestamp
    FROM messages
    WHERE task_id = ?
    ORDER BY timestamp ASC
  `).all(taskId);
  
  return rows.map(row => ({
    id: row.id,
    taskId: row.task_id,
    role: row.role as MessageRole,
    content: row.content,
    timestamp: row.timestamp
  }));
};

// Query tasks by status
const queryTasks = (
  completionStatus: string | null,
  limit: number,
  offset: number,
  db: Database
): { tasks: Task[]; total: number } => {
  let whereClause = '';
  let params: any[] = [];
  
  if (completionStatus === 'null') {
    whereClause = 'WHERE completion_status IS NULL';
  } else if (completionStatus) {
    whereClause = 'WHERE completion_status = ?';
    params.push(completionStatus);
  }
  
  const rows = db.prepare(`
    SELECT * FROM tasks
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);
  
  const totalRow = db.prepare(`
    SELECT COUNT(*) as count FROM tasks
    ${whereClause}
  `).get(...params);
  
  return {
    tasks: rows.map(rowToTask),
    total: totalRow.count
  };
};
```

## Performance Considerations

### Index Usage

- Composite index on `(task_id, timestamp)` for messages enables efficient ordered retrieval
- Status indexes support fast filtering of active/completed tasks
- Time-based indexes enable efficient time-range queries

### Connection Pooling

For single-user agent, a single connection is sufficient:

```typescript
let dbConnection: Database | null = null;

const getConnection = (): Database => {
  if (!dbConnection) {
    dbConnection = initializeLedger();
  }
  return dbConnection;
};
```

### Batch Operations

Wrap multiple operations in transactions for atomicity and performance:

```typescript
const saveBatch = (entities: any[], db: Database): void => {
  const transaction = db.transaction(() => {
    for (const entity of entities) {
      saveEntity(entity, db);
    }
  });
  
  transaction();
};
```

## Testing Strategy

### Unit Tests

```typescript
test('ldg:task:save creates new task', async () => {
  const db = await initializeTestDB();
  const ledger = createLedger(db, bus);
  
  const task: Task = {
    id: 'task-test',
    parentTaskId: undefined,
    completionStatus: undefined,
    systemPrompt: 'Test prompt',
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  const result = await bus.invoke('ldg:task:save')(
    JSON.stringify({ task })
  );
  
  expect(JSON.parse(result).success).toBe(true);
  
  // Verify persisted
  const getResult = await bus.invoke('ldg:task:get')(
    JSON.stringify({ taskId: task.id })
  );
  
  expect(JSON.parse(getResult).task).toBeDefined();
});

test('ldg:msg:save is immutable', async () => {
  const db = await initializeTestDB();
  const ledger = createLedger(db, bus);
  
  const message: Message = {
    id: 'msg-test',
    taskId: 'task-test',
    role: 'user',
    content: 'Test message',
    timestamp: Date.now()
  };
  
  // Save once
  await bus.invoke('ldg:msg:save')(JSON.stringify({ message }));
  
  // Try to "update" (should insert new or fail)
  message.content = 'Modified content';
  
  await expect(
    bus.invoke('ldg:msg:save')(JSON.stringify({ message }))
  ).rejects.toThrow();
});
```

### Integration Tests

```typescript
test('Full task lifecycle persistence', async () => {
  const db = await initializeTestDB();
  const ledger = createLedger(db, bus);
  
  // Create task
  const taskId = 'task-lifecycle';
  await createTask(taskId, bus);
  
  // Add messages
  await saveMessage(taskId, 'user', 'Hello', bus);
  await saveMessage(taskId, 'assistant', 'Hi there', bus);
  
  // Create call
  const callId = 'call-test';
  await createCall(callId, taskId, bus);
  
  // Update call status
  await updateCall(callId, 'completed', bus);
  
  // Complete task
  await completeTask(taskId, bus);
  
  // Verify all persisted
  const task = await getTask(taskId, bus);
  expect(task.completionStatus).toBe('success');
  
  const messages = await getMessages(taskId, bus);
  expect(messages.length).toBe(2);
  
  const calls = await getCalls(taskId, bus);
  expect(calls[0].status).toBe('completed');
});
```

## Summary

Ledger provides:

✅ **Durable persistence** with SQLite ACID transactions  
✅ **Clear mutability model** - Tasks/Calls mutable, Messages immutable  
✅ **Efficient queries** via strategic indexing  
✅ **Streaming support** with completion-based timestamps  
✅ **Full recoverability** from complete execution history  
✅ **Simple data model** with three normalized entities  

As the foundation of Agent OS persistence, Ledger ensures task execution is reliable, auditable, and recoverable.

