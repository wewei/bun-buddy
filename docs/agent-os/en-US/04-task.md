# Agent OS - Task Manager

## Overview

The **Task Manager** is the process management layer of Agent OS. It manages the lifecycle of tasks—from creation through execution to completion—with a **persistence-first architecture**. Unlike traditional in-memory execution models, every aspect of task execution (tasks, ability calls, messages) is continuously persisted to the Ledger, enabling full recovery from unexpected failures.

Task Manager sits **below the Agent Bus**: it both invokes bus abilities (e.g., `model:llm`, `ldg:task:save`) and registers its own lifecycle management abilities (e.g., `task:route`, `task:create`, `task:cancel`).

### Key Design Principles

**Persistence-First**: A task in Agent OS represents an Agent's series of conversations with an LLM to achieve a specific goal. The entire execution process is continuously persisted to Ledger. If the Agent process crashes, it can resume and continue unfinished tasks upon restart based on persisted records.

**Clear Separation of Concerns**:
- **Task Manager**: Core lifecycle operations (routing, creation, cancellation, listing active tasks)
- **Ledger Module**: Persistent storage in SQLite (task details, call history, message records)
- **Memory Module**: Optional semantic knowledge layer (vectors + graph)

This separation enables Task Manager to remain lightweight and stateless, while Ledger provides durable storage and rich querying capabilities.

## Core Concepts

### Three Core Entities

Task execution is represented through three types of entities, all persisted in Ledger:

#### Task Entity

Represents a goal-directed execution unit:

```typescript
type Task = {
  id: string;                    // Global unique identifier
  parentTaskId?: string;         // Parent task ID (for subtasks)
  completionStatus?: string;     // Undefined = in progress
                                 // String value = completed
                                 // Values: 'success' | 'cancelled' | 'failed' | error message
  systemPrompt: string;          // Task-specific system instructions
  createdAt: number;             // Task creation timestamp
  updatedAt: number;             // Last status change timestamp
};
```

**Completion Status**:
- `undefined`: Task is in progress
- `'success'`: Task completed successfully
- `'cancelled'`: Task was cancelled by user
- `'failed'`: Task failed (generic failure)
- Custom error message: Task failed with specific reason

#### Call Entity

Represents an ability invocation during task execution:

```typescript
type Call = {
  id: string;                    // Unique call identifier
  taskId: string;                // Task this call belongs to
  abilityName: string;           // Ability ID (e.g., 'mem:retrieve')
  parameters: string;            // JSON-encoded parameters
  status: CallStatus;            // Call execution status
  details: string;               // JSON-encoded details for recovery or result
  createdAt: number;             // Call initiation timestamp
  updatedAt: number;             // Last status/details change timestamp
  startMessageId: string;        // Message announcing call initiation
  endMessageId?: string;         // Message announcing call completion
};

type CallStatus = 
  | 'pending'                    // Call queued but not started
  | 'in_progress'                // Call currently executing
  | 'completed'                  // Call finished successfully
  | 'failed';                    // Call failed with error
```

**Call Details**:
- During execution: Context needed to resume (implementation-specific)
- After completion: Result returned by the ability
- After failure: Error message and stack trace

#### Message Entity

Represents a message in the task conversation:

```typescript
type Message = {
  id: string;                    // Unique message identifier
  taskId: string;                // Task this message belongs to
  role: MessageRole;             // Message sender role
  content: string;               // Message content (supports markdown)
  timestamp: number;             // Message timestamp
                                 // For streaming: completion time (when fully received)
                                 // For non-streaming: receipt time
};

type MessageRole = 
  | 'system'                     // System instructions
  | 'user'                       // User input
  | 'assistant';                 // LLM response
```

**Message Immutability**: Messages are **immutable** once saved to Ledger. Streaming messages are accumulated in memory and only saved after complete reception.

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

- **Task to Call**: 1:n relationship (all ability calls in a task)
- **Task to Message**: 1:n relationship (all messages in task conversation)
- **Call to Message**: Call references its announcement messages

## Task Lifecycle

### Lifecycle States

A task's lifecycle is determined by its `completionStatus`:

```
┌─────────────────────────────────────────────────┐
│ Task Created                                    │
│ completionStatus = undefined                    │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │   Task In Progress   │
         │  (executing loops)   │
         └───────┬──────────────┘
                 │
        ┌────────┼────────┐
        │        │        │
        ▼        ▼        ▼
    ┌────────┐ ┌──────┐ ┌────────┐
    │Success │ │Cancel│ │ Failed │
    └────────┘ └──────┘ └────────┘
```

### Message Routing

When Agent receives a user message, Task Manager routes it:

1. **Call `task:route`** with message content
2. **If route returns taskId**: Append message to that task
3. **If route returns null**: Create new task with `task:create`
4. **Resume/Start execution** for the target task

## Registered Abilities

Task Manager registers the following abilities on the Agent Bus:

### task:route

**Description**: Route a user message to the appropriate active task, or indicate a new task should be created.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "message": {
      "type": "string",
      "description": "User message content"
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
    "taskId": {
      "type": ["string", "null"],
      "description": "Target task ID, or null to create new task"
    },
    "confidence": {
      "type": "number",
      "description": "Routing confidence (0-1)"
    }
  },
  "required": ["taskId"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:route')(JSON.stringify({
  message: 'Can you also check Q2 data?'
}));

const { taskId, confidence } = JSON.parse(result);
if (taskId) {
  // Route to existing task
  await appendMessageToTask(taskId, message);
} else {
  // Create new task
  await createNewTask(message);
}
```

**Routing Strategy**: See [Message Routing](#message-routing) section.

### task:create

**Description**: Create a new task and persist it to Memory.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "goal": {
      "type": "string",
      "description": "Task goal or initial message"
    },
    "parentTaskId": {
      "type": "string",
      "description": "Optional parent task ID for subtasks"
    },
    "systemPrompt": {
      "type": "string",
      "description": "Optional custom system prompt"
    }
  },
  "required": ["goal"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Created task ID"
    }
  },
  "required": ["taskId"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:create')(JSON.stringify({
  goal: 'Analyze Q1 sales data',
  systemPrompt: 'You are a data analyst assistant.'
}));

const { taskId } = JSON.parse(result);
console.log(`Created task: ${taskId}`);
```

**Implementation Note**: This ability creates the Task entity, initial system message, and initial user message, then persists all to Memory before starting execution.

### task:cancel

**Description**: Cancel an in-progress task.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Task to cancel"
    },
    "reason": {
      "type": "string",
      "description": "Cancellation reason"
    }
  },
  "required": ["taskId", "reason"]
}
```

**Output Schema**:
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

**Example**:
```typescript
const result = await bus.invoke('task:cancel')(JSON.stringify({
  taskId: 'task-abc123',
  reason: 'User requested cancellation'
}));

const { success } = JSON.parse(result);
```

**Behavior**: Sets task's `completionStatus` to `'cancelled'`, stops execution loop, and marks any in-progress calls as failed.

### task:active

**Description**: List all active (in-progress) tasks.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "limit": {
      "type": "number",
      "description": "Maximum tasks to return"
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

**Example**:
```typescript
const result = await bus.invoke('task:active')(JSON.stringify({
  limit: 10
}));

const { tasks } = JSON.parse(result);
console.log(`${tasks.length} active tasks`);
```

## Task Execution Flow

### Execution Loop

When a task is created or receives a new message, it enters the execution loop:

```
┌─────────────────────────────────────────────────┐
│ 1. Load task context from Memory                │
│    - Fetch all messages via ldg:msg:list    │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 2. Invoke model:llm with full context           │
│    - Pass messages + available tools             │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│ 3. Stream LLM response                          │
│    - Output content chunks to user              │
│    - Collect tool calls                          │
│    - Save assistant message to Memory           │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Has tool calls?      │
         └────┬─────────────┬───┘
              │ No          │ Yes
              │             │
              │             ▼
              │   ┌────────────────────────┐
              │   │ 4. Execute tool calls  │
              │   │    For each tool call: │
              │   │    - Create Call entity│
              │   │    - Save call start   │
              │   │    - Execute ability   │
              │   │    - Save call end     │
              │   └──────────┬─────────────┘
              │              │
              │              │ Loop back to step 1
              │              └──────────────────►
              │
              ▼
┌─────────────────────────────────────────────────┐
│ 5. Mark task as completed                       │
│    - Set completionStatus = 'success'           │
│    - Update task in Memory                      │
└─────────────────────────────────────────────────┘
```

### Detailed Execution Steps

#### Step 1: Load Task Context

```typescript
const loadTaskContext = async (
  taskId: string,
  bus: AgentBus
): Promise<Message[]> => {
  const result = await bus.invoke('ldg:msg:list')(
    JSON.stringify({ taskId })
  );
  
  const { messages } = JSON.parse(result);
  return messages;
};
```

#### Step 2: Invoke LLM

```typescript
const invokeLLM = async (
  messages: Message[],
  tools: ToolDefinition[],
  bus: AgentBus
): AsyncGenerator<LLMChunk> => {
  const stream = bus.invokeStream('model:llm')(JSON.stringify({
    messages: messages.map(m => ({
      role: m.role,
      content: m.content
    })),
    tools
  }));
  
  return stream;
};
```

#### Step 3: Process LLM Response

```typescript
const processLLMResponse = async (
  taskId: string,
  stream: AsyncGenerator<string>,
  bus: AgentBus
): Promise<{ content: string; toolCalls: ToolCall[] }> => {
  let content = '';
  const toolCalls: ToolCall[] = [];
  
  // Accumulate streaming response in memory
  for await (const chunk of stream) {
    const data = JSON.parse(chunk);
    
    if (data.content) {
      content += data.content;
      // Stream to user in real-time, but don't save to Ledger yet
      emitToUser({ type: 'content', content: data.content });
    }
    
    if (data.toolCalls) {
      toolCalls.push(...data.toolCalls);
    }
  }
  
  // Streaming complete, now save full message to Ledger
  // timestamp will be set to current time (completion time)
  await saveMessage(taskId, 'assistant', content, bus);
  
  return { content, toolCalls };
};
```

#### Step 4: Execute Tool Calls

```typescript
const executeToolCalls = async (
  taskId: string,
  toolCalls: ToolCall[],
  bus: AgentBus
): Promise<void> => {
  for (const tc of toolCalls) {
    await executeToolCall(taskId, tc, bus);
  }
};

const executeToolCall = async (
  taskId: string,
  toolCall: ToolCall,
  bus: AgentBus
): Promise<void> => {
  const callId = generateId();
  const abilityName = toolCall.function.name.replace('_', ':');
  
  // Create Call entity (status = pending)
  const call: Call = {
    id: callId,
    taskId,
    abilityName,
    parameters: toolCall.function.arguments,
    status: 'pending',
    details: '{}',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startMessageId: '',
    endMessageId: undefined
  };
  
  // Save start message
  const startMsg = await saveMessage(
    taskId,
    'assistant',
    `🔧 Calling ${abilityName}...`,
    bus
  );
  call.startMessageId = startMsg.id;
  
  // Update call status to in_progress and save
  call.status = 'in_progress';
  call.updatedAt = Date.now();
  await bus.invoke('ldg:call:save')(JSON.stringify({ call }));
  
  try {
    // Execute ability
    const result = await bus.invoke(abilityName)(
      toolCall.function.arguments
    );
    
    // Update call to completed
    call.status = 'completed';
    call.details = result;
    call.updatedAt = Date.now();
    
    // Save end message
    const endMsg = await saveMessage(
      taskId,
      'assistant',
      `✓ ${abilityName} completed`,
      bus
    );
    call.endMessageId = endMsg.id;
    
  } catch (error) {
    // Update call to failed
    call.status = 'failed';
    call.details = JSON.stringify({
      error: error.message,
      stack: error.stack
    });
    call.updatedAt = Date.now();
    
    // Save error message
    const endMsg = await saveMessage(
      taskId,
      'assistant',
      `✗ ${abilityName} failed: ${error.message}`,
      bus
    );
    call.endMessageId = endMsg.id;
  }
  
  // Save final call state
  await bus.invoke('ldg:call:save')(JSON.stringify({ call }));
};
```

#### Step 5: Complete Task

```typescript
const completeTask = async (
  taskId: string,
  bus: AgentBus
): Promise<void> => {
  const task = await loadTask(taskId, bus);
  task.completionStatus = 'success';
  task.updatedAt = Date.now();
  
  await bus.invoke('ldg:task:save')(JSON.stringify({ task }));
  
  emitToUser({
    type: 'task_complete',
    taskId,
    status: 'success'
  });
};
```

### Task Creation Flow

When a new task is created:

```typescript
const createTask = async (
  goal: string,
  systemPrompt: string,
  bus: AgentBus
): Promise<string> => {
  const taskId = generateId();
  
  // Create task entity
  const task: Task = {
    id: taskId,
    parentTaskId: undefined,
    completionStatus: undefined,
    systemPrompt,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  
  // Save task to Memory
  await bus.invoke('ldg:task:save')(JSON.stringify({ task }));
  
  // Create system message
  await saveMessage(taskId, 'system', systemPrompt, bus);
  
  // Create initial user message
  await saveMessage(taskId, 'user', goal, bus);
  
  // Start execution in background
  startTaskExecution(taskId, bus);
  
  return taskId;
};
```

## Message Routing

Task Manager uses the `task:route` ability to determine which task should handle an incoming message.

### Routing Strategy

```typescript
const routeMessage = async (
  message: string,
  bus: AgentBus
): Promise<string | null> => {
  // Get active tasks
  const activeResult = await bus.invoke('task:active')('{}');
  const { tasks } = JSON.parse(activeResult);
  
  // No active tasks → create new
  if (tasks.length === 0) {
    return null;
  }
  
  // Single active task → route to it
  if (tasks.length === 1) {
    return tasks[0].id;
  }
  
  // Multiple active tasks → use LLM to decide
  return await llmBasedRouting(message, tasks, bus);
};
```

### LLM-Based Routing

When multiple tasks are active, use LLM to determine the best match:

```typescript
const llmBasedRouting = async (
  message: string,
  tasks: Task[],
  bus: AgentBus
): Promise<string | null> => {
  // Load recent context for each task
  const taskContexts = await Promise.all(
    tasks.map(async (task) => {
      const messages = await loadTaskContext(task.id, bus);
      return {
        taskId: task.id,
        recentMessages: messages.slice(-3)
      };
    })
  );
  
  // Build routing prompt
  const routingPrompt = buildRoutingPrompt(message, taskContexts);
  
  // Get LLM decision
  const result = await bus.invoke('model:llm')(JSON.stringify({
    messages: [
      {
        role: 'system',
        content: `You are a message router. Determine which task
                  should handle the user's message. Respond with
                  JSON: { "taskId": "task-xxx" } or
                  { "taskId": null } for new task.`
      },
      {
        role: 'user',
        content: routingPrompt
      }
    ]
  }));
  
  const { taskId } = JSON.parse(result);
  return taskId;
};
```

### Explicit Task Selection

Users can explicitly specify a task using special syntax:

```
@task-abc123 Please also check Q2 data
```

The routing logic checks for this pattern first:

```typescript
const extractExplicitTaskId = (message: string): string | undefined => {
  const match = message.match(/^@(task-[a-z0-9]+)\s+/);
  return match?.[1];
};
```

## Integration with Ledger

Task Manager relies on Ledger module for all persistence operations.

### Required Ledger Abilities

#### ldg:task:save

Save or update a task entity.

**Input**: `{ task: Task }`  
**Output**: `{ success: boolean }`

#### ldg:task:get

Retrieve a task entity by ID.

**Input**: `{ taskId: string }`  
**Output**: `{ task: Task | null }`

#### ldg:task:query

Query tasks with filters.

**Input**: `{ completionStatus?: string; limit?: number; offset?: number }`  
**Output**: `{ tasks: Task[]; total: number }`

#### ldg:call:save

Save or update a call entity.

**Input**: `{ call: Call }`  
**Output**: `{ success: boolean }`

#### ldg:call:list

List all calls for a task.

**Input**: `{ taskId: string }`  
**Output**: `{ calls: Call[] }`

#### ldg:msg:save

Save a message entity.

**Input**: `{ message: Message }`  
**Output**: `{ success: boolean; messageId: string }`

#### ldg:msg:list

List all messages for a task.

**Input**: `{ taskId: string; limit?: number; offset?: number }`  
**Output**: `{ messages: Message[]; total: number }`

### Helper Functions

```typescript
const saveMessage = async (
  taskId: string,
  role: MessageRole,
  content: string,
  bus: AgentBus
): Promise<Message> => {
  const message: Message = {
    id: generateId(),
    taskId,
    role,
    content,
    timestamp: Date.now()
  };
  
  await bus.invoke('ldg:msg:save')(
    JSON.stringify({ message })
  );
  
  return message;
};

const loadTask = async (
  taskId: string,
  bus: AgentBus
): Promise<Task> => {
  const result = await bus.invoke('ldg:task:get')(
    JSON.stringify({ taskId })
  );
  
  const { task } = JSON.parse(result);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  
  return task;
};
```

## State Management

Task Manager maintains minimal in-memory state:

```typescript
type TaskManagerState = {
  activeTaskIds: Set<string>;       // Tasks currently executing
  executionLoops: Map<string, Promise<void>>; // Running loops
};
```

**Key Properties**:
- No task details stored in memory
- All data retrieved from Memory on-demand
- Supports multiple Task Manager instances
- Shared state via Memory enables horizontal scaling

### Initialization

On startup, Task Manager recovers active tasks:

```typescript
const initializeTaskManager = async (
  bus: AgentBus
): Promise<TaskManagerState> => {
  const state: TaskManagerState = {
    activeTaskIds: new Set(),
    executionLoops: new Map()
  };
  
  // Query incomplete tasks from Memory
  const result = await bus.invoke('mem:task:query')(
    JSON.stringify({ completionStatus: undefined })
  );
  
  const { tasks } = JSON.parse(result);
  
  // Resume each task
  for (const task of tasks) {
    await recoverTask(task.id, state, bus);
  }
  
  return state;
};
```

## Error Handling & Recovery

### Call Recovery Strategy

When Agent restarts, it checks for in-progress calls:

```typescript
const recoverTask = async (
  taskId: string,
  state: TaskManagerState,
  bus: AgentBus
): Promise<void> => {
  // Check for in-progress calls
  const callsResult = await bus.invoke('ldg:call:list')(
    JSON.stringify({ taskId })
  );
  
  const { calls } = JSON.parse(callsResult);
  const inProgressCalls = calls.filter(
    c => c.status === 'in_progress'
  );
  
  // Mark in-progress calls as failed
  for (const call of inProgressCalls) {
    call.status = 'failed';
    call.details = JSON.stringify({
      error: 'Process crashed during execution'
    });
    call.updatedAt = Date.now();
    
    await bus.invoke('ldg:call:save')(
      JSON.stringify({ call })
    );
    
    // Add failure message
    await saveMessage(
      taskId,
      'assistant',
      `✗ ${call.abilityName} failed due to process crash`,
      bus
    );
  }
  
  // Resume task execution
  resumeTaskExecution(taskId, state, bus);
};
```

**Design Decision**: Mark in-progress calls as failed rather than retry. Rationale:
- Avoids duplicate execution of non-idempotent operations
- LLM has full context to decide whether to retry
- Simplifies recovery logic

### Task Execution Errors

Handle errors during normal execution:

```typescript
const runTaskLoop = async (
  taskId: string,
  bus: AgentBus
): Promise<void> => {
  try {
    const maxIterations = 10;
    let iteration = 0;
    
    while (iteration < maxIterations) {
      iteration++;
      
      // Load context
      const messages = await loadTaskContext(taskId, bus);
      
      // Invoke LLM
      const tools = await getAllToolDefinitions(bus);
      const stream = bus.invokeStream('model:llm')(
        JSON.stringify({ messages, tools })
      );
      
      // Process response
      const { content, toolCalls } = await processLLMResponse(
        taskId,
        stream,
        bus
      );
      
      // No tool calls → task complete
      if (toolCalls.length === 0) {
        await completeTask(taskId, bus);
        return;
      }
      
      // Execute tools
      await executeToolCalls(taskId, toolCalls, bus);
    }
    
    // Max iterations reached
    await failTask(
      taskId,
      'Maximum iterations reached',
      bus
    );
    
  } catch (error) {
    await failTask(taskId, error.message, bus);
  }
};

const failTask = async (
  taskId: string,
  reason: string,
  bus: AgentBus
): Promise<void> => {
  const task = await loadTask(taskId, bus);
  task.completionStatus = `failed: ${reason}`;
  task.updatedAt = Date.now();
  
  await bus.invoke('ldg:task:save')(JSON.stringify({ task }));
  
  await saveMessage(
    taskId,
    'assistant',
    `Task failed: ${reason}`,
    bus
  );
};
```

### Graceful Shutdown

On shutdown signal, save all active task states:

```typescript
const shutdownTaskManager = async (
  state: TaskManagerState,
  bus: AgentBus
): Promise<void> => {
  console.log('Shutting down Task Manager...');
  
  // Wait for all execution loops to complete (with timeout)
  const loops = Array.from(state.executionLoops.values());
  await Promise.race([
    Promise.all(loops),
    new Promise(resolve => setTimeout(resolve, 5000))
  ]);
  
  // All state is already persisted to Memory
  console.log('Task Manager shutdown complete');
};
```

**Note**: Because all state is continuously persisted to Memory, graceful shutdown primarily involves waiting for in-flight operations to complete. No special state saving is needed.

## Subtask Management

### Creating Subtasks

LLM can create subtasks by invoking `task:create` with `parentTaskId`:

```typescript
// LLM makes tool call:
{
  "function": {
    "name": "task_create",
    "arguments": JSON.stringify({
      goal: "Analyze Q1 sales data",
      parentTaskId: currentTaskId
    })
  }
}
```

The parent task receives the subtask ID and can:
- Wait for subtask completion
- Continue with other work
- Query subtask status

### Querying Subtasks

Use Ledger to query subtasks:

```typescript
const result = await bus.invoke('ldg:task:query')(JSON.stringify({
  parentTaskId: 'task-root',
  completionStatus: 'null'  // Only active subtasks
}));

const { tasks } = JSON.parse(result);
console.log(`${tasks.length} active subtasks`);
```

## Implementation Example

### Complete Task Manager Module

```typescript
type TaskManagerConfig = {
  maxConcurrentTasks: number;
  maxIterationsPerTask: number;
};

const createTaskManager = (
  bus: AgentBus,
  config: TaskManagerConfig
) => {
  const state: TaskManagerState = {
    activeTaskIds: new Set(),
    executionLoops: new Map()
  };
  
  // Register abilities
  registerTaskRouteAbility(state, bus);
  registerTaskCreateAbility(state, bus, config);
  registerTaskCancelAbility(state, bus);
  registerTaskActiveAbility(state, bus);
  
  // Initialize
  initializeTaskManager(bus).then(recoveredState => {
    state.activeTaskIds = recoveredState.activeTaskIds;
    state.executionLoops = recoveredState.executionLoops;
  });
  
  return state;
};
```

### Ability Registration

```typescript
const registerTaskCreateAbility = (
  state: TaskManagerState,
  bus: AgentBus,
  config: TaskManagerConfig
) => {
  bus.register(
    {
      id: 'task:create',
      moduleName: 'task',
      abilityName: 'create',
      description: 'Create a new task',
      isStream: false,
      inputSchema: {
        type: 'object',
        properties: {
          goal: { type: 'string' },
          parentTaskId: { type: 'string' },
          systemPrompt: { type: 'string' }
        },
        required: ['goal']
      },
      outputSchema: {
        type: 'object',
        properties: {
          taskId: { type: 'string' }
        },
        required: ['taskId']
      }
    },
    async (input: string) => {
      const { goal, parentTaskId, systemPrompt } = JSON.parse(input);
      
      const defaultPrompt = 'You are a helpful AI assistant.';
      const taskId = await createTask(
        goal,
        systemPrompt || defaultPrompt,
        bus
      );
      
      state.activeTaskIds.add(taskId);
      
      return JSON.stringify({ taskId });
    }
  );
};
```

## Testing Strategy

### Unit Tests

```typescript
test('task:create creates task and persists to Memory', async () => {
  const bus = createMockBus();
  const taskManager = createTaskManager(bus, defaultConfig);
  
  const result = await bus.invoke('task:create')(JSON.stringify({
    goal: 'Test task'
  }));
  
  const { taskId } = JSON.parse(result);
  expect(taskId).toBeDefined();
  
  // Verify task saved to Memory
  const savedTask = await bus.invoke('ldg:task:get')(
    JSON.stringify({ taskId })
  );
  expect(JSON.parse(savedTask).task).toBeDefined();
});

test('task:route routes to existing task when appropriate', async () => {
  const bus = createMockBus();
  const taskManager = createTaskManager(bus, defaultConfig);
  
  // Create task
  const createResult = await bus.invoke('task:create')(
    JSON.stringify({ goal: 'Analyze sales' })
  );
  const { taskId } = JSON.parse(createResult);
  
  // Route related message
  const routeResult = await bus.invoke('task:route')(JSON.stringify({
    message: 'Can you also check Q2?'
  }));
  
  const { taskId: routedTaskId } = JSON.parse(routeResult);
  expect(routedTaskId).toBe(taskId);
});
```

### Integration Tests

```typescript
test('Full task execution with tool calls', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus, defaultConfig);
  const modelManager = createModelManager(bus);
  const memory = createMemory(bus);
  
  // Create task
  const result = await bus.invoke('task:create')(JSON.stringify({
    goal: 'Test task with tool calls'
  }));
  
  const { taskId } = JSON.parse(result);
  
  // Wait for completion
  await waitForTaskCompletion(taskId, bus);
  
  // Verify all entities persisted
  const task = await bus.invoke('ldg:task:get')(
    JSON.stringify({ taskId })
  );
  expect(JSON.parse(task).task.completionStatus).toBe('success');
  
  const messages = await bus.invoke('ldg:msg:list')(
    JSON.stringify({ taskId })
  );
  expect(JSON.parse(messages).messages.length).toBeGreaterThan(0);
});
```

## Summary

Task Manager provides:

✅ **Persistence-first architecture** with continuous state saving  
✅ **Full crash recovery** by resuming from persisted state  
✅ **Clear separation of concerns** with Ledger (persistence) and Memory (semantics)  
✅ **Lightweight in-memory state** enabling horizontal scaling  
✅ **Intelligent message routing** via LLM-based decisions  
✅ **Complete execution audit trail** through Call and Message entities  
✅ **Streaming message handling** with completion-based timestamps  
✅ **Graceful error handling** with automatic failure recovery

The persistence-first design with SQLite Ledger ensures Agent OS tasks are durable and resilient, capable of surviving process crashes and providing complete visibility into task execution history.
