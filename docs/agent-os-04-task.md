# Agent OS - Task Manager

## Overview

The **Task Manager** is the process management layer of Agent OS. Like an operating system's process scheduler, it manages the lifecycle of concurrent tasks, maintains isolated contexts, and routes messages to the appropriate task.

Task Manager sits **below the Agent Bus**: it both invokes bus abilities (e.g., `model:llm`, `mem:retrieve`) and registers its own abilities (e.g., `task:spawn`, `task:send`).

## Core Concepts

### Task

A **Task** represents a goal-directed execution unit with its own isolated context:

```typescript
type Task = {
  id: string;                           // Unique task ID
  goal: string;                         // Original task goal
  status: TaskStatus;
  context: ChatMessage[];               // Complete message history
  parentTaskId?: string;                // Parent task (for subtasks)
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  
  metadata: {
    iterationCount: number;             // Number of LLM iterations
    lastMessageAt?: number;             // Last user message time
    totalTokens?: number;               // Cumulative token usage
  };
};

type TaskStatus = 
  | 'pending'                           // Created, not yet started
  | 'running'                           // Currently executing
  | 'waiting'                           // Waiting for user input
  | 'completed'                         // Successfully completed
  | 'failed'                            // Failed with error
  | 'killed';                           // Manually terminated
```

### Task Context

Each task maintains an isolated context of all messages:

```typescript
type ChatMessage = 
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };
```

The context grows with each iteration:
1. User message → append to context
2. LLM response → append to context
3. Tool calls → execute and append results to context
4. Final response → append to context

### Task Output Stream

Tasks emit structured output events:

```typescript
type TaskOutput = 
  | { type: 'start'; taskId: string; goal: string }
  | { type: 'content'; taskId: string; content: string }
  | { type: 'tool_call'; taskId: string; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; taskId: string; tool: string; result: string; error?: string }
  | { type: 'end'; taskId: string; status: 'completed' | 'failed' }
  | { type: 'error'; taskId: string; error: string };
```

## Registered Abilities

Task Manager registers the following abilities on the Agent Bus:

### task:spawn

**Description**: Create a new task with the given goal.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "goal": {
      "type": "string",
      "description": "The goal or objective of the task"
    },
    "parentTaskId": {
      "type": "string",
      "description": "Optional parent task ID for creating subtasks"
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
      "description": "Unique identifier for the created task"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "running"]
    }
  },
  "required": ["taskId", "status"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:spawn')(JSON.stringify({
  goal: 'Analyze Q1 sales data'
}));

// { "taskId": "task-abc123", "status": "running" }
```

**Key Feature**: LLM can invoke `task:spawn` to create subtasks, enabling recursive task decomposition.

### task:send

**Description**: Send a message to an existing task.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Target task ID"
    },
    "message": {
      "type": "string",
      "description": "Message to send"
    }
  },
  "required": ["taskId", "message"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "status": {
      "type": "string",
      "enum": ["running", "waiting", "completed", "failed"]
    }
  },
  "required": ["success", "status"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:send')(JSON.stringify({
  taskId: 'task-abc123',
  message: 'Focus on regional breakdown'
}));

// { "success": true, "status": "running" }
```

### task:stream

**Description**: Stream output from a task in real-time.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string",
      "description": "Target task ID"
    }
  },
  "required": ["taskId"]
}
```

**Output**: Stream of `TaskOutput` events (JSON strings).

**Example**:
```typescript
const stream = bus.invokeStream('task:stream')(JSON.stringify({
  taskId: 'task-abc123'
}));

for await (const chunk of stream) {
  const output = JSON.parse(chunk);
  switch (output.type) {
    case 'content':
      process.stdout.write(output.content);
      break;
    case 'tool_call':
      console.log(`\nCalling ${output.tool}...`);
      break;
  }
}
```

### task:list

**Description**: List tasks with optional filtering.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "status": {
      "type": "string",
      "enum": ["pending", "running", "waiting", "completed", "failed", "killed"]
    },
    "parentTaskId": {
      "type": "string",
      "description": "Filter by parent task (for listing subtasks)"
    },
    "limit": {
      "type": "number",
      "description": "Maximum number of tasks to return"
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
          "goal": { "type": "string" },
          "status": { "type": "string" },
          "parentTaskId": { "type": "string" },
          "createdAt": { "type": "number" },
          "updatedAt": { "type": "number" }
        }
      }
    },
    "total": {
      "type": "number",
      "description": "Total number of matching tasks"
    }
  },
  "required": ["tasks", "total"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:list')(JSON.stringify({
  status: 'running'
}));

// {
//   "tasks": [
//     { "id": "task-abc", "goal": "...", "status": "running", ... },
//     { "id": "task-xyz", "goal": "...", "status": "running", ... }
//   ],
//   "total": 2
// }
```

### task:get

**Description**: Get detailed information about a specific task.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string"
    },
    "includeContext": {
      "type": "boolean",
      "description": "Whether to include full message history"
    }
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
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "goal": { "type": "string" },
        "status": { "type": "string" },
        "parentTaskId": { "type": "string" },
        "createdAt": { "type": "number" },
        "updatedAt": { "type": "number" },
        "completedAt": { "type": "number" },
        "metadata": { "type": "object" },
        "context": { "type": "array" }
      }
    }
  },
  "required": ["task"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:get')(JSON.stringify({
  taskId: 'task-abc123',
  includeContext: true
}));

// {
//   "task": {
//     "id": "task-abc123",
//     "goal": "Analyze sales data",
//     "status": "running",
//     "context": [ ... ],
//     ...
//   }
// }
```

### task:kill

**Description**: Terminate a running task.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "taskId": {
      "type": "string"
    },
    "reason": {
      "type": "string",
      "description": "Optional reason for termination"
    }
  },
  "required": ["taskId"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean"
    },
    "previousStatus": {
      "type": "string"
    }
  },
  "required": ["success", "previousStatus"]
}
```

**Example**:
```typescript
const result = await bus.invoke('task:kill')(JSON.stringify({
  taskId: 'task-abc123',
  reason: 'User requested cancellation'
}));

// { "success": true, "previousStatus": "running" }
```

## Task Execution Flow

### Task Run Loop

When a task is spawned or receives a message, it enters the run loop:

```
┌─────────────────────────────────────────────────────┐
│ 1. Append user message to context                  │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 2. Invoke model:llm with full context              │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────┐
│ 3. Stream LLM response                             │
│    - Output content chunks                          │
│    - Collect tool calls                             │
└───────────────────┬─────────────────────────────────┘
                    │
                    ▼
         ┌──────────────────────┐
         │ Has tool calls?      │
         └────┬─────────────┬───┘
              │ Yes         │ No
              ▼             ▼
┌──────────────────────┐   ┌──────────────────────┐
│ 4. Execute tools     │   │ 5. Append response   │
│    via bus           │   │    Task complete     │
│    (parallel)        │   │    or waiting        │
└────┬─────────────────┘   └──────────────────────┘
     │
     ▼
┌──────────────────────────────────────────────────┐
│ 6. Append tool results to context               │
└────┬─────────────────────────────────────────────┘
     │
     │ Loop back to step 2
     │ (max iterations: 10)
     └────────────────────────────────────────────►
```

### Pseudo-code Implementation

```typescript
async function* runTaskLoop(task: Task, bus: AgentBus): AsyncGenerator<TaskOutput> {
  const maxIterations = 10;
  let iteration = 0;
  
  yield { type: 'start', taskId: task.id, goal: task.goal };
  
  while (iteration < maxIterations) {
    iteration++;
    
    // Step 1: Call LLM with current context
    const llmInput = {
      messages: task.context,
      tools: await getAllToolDefinitions(bus)
    };
    
    const llmStream = bus.invokeStream('model:llm')(JSON.stringify(llmInput));
    
    let assistantMessage = '';
    let toolCalls: ToolCall[] = [];
    
    // Step 2: Stream LLM output
    for await (const chunk of llmStream) {
      const data = JSON.parse(chunk);
      
      if (data.content) {
        assistantMessage += data.content;
        yield { type: 'content', taskId: task.id, content: data.content };
      }
      
      if (data.toolCalls) {
        toolCalls.push(...data.toolCalls);
      }
    }
    
    // Append assistant message to context
    task.context.push({
      role: 'assistant',
      content: assistantMessage,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    });
    
    // Step 3: Execute tool calls
    if (toolCalls.length === 0) {
      // No tool calls, task is complete or waiting
      task.status = 'completed';
      yield { type: 'end', taskId: task.id, status: 'completed' };
      break;
    }
    
    // Execute tools in parallel
    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        yield {
          type: 'tool_call',
          taskId: task.id,
          tool: tc.function.name,
          args: JSON.parse(tc.function.arguments)
        };
        
        try {
          const abilityId = tc.function.name.replace('_', ':');
          const result = await bus.invoke(abilityId)(tc.function.arguments);
          
          yield {
            type: 'tool_result',
            taskId: task.id,
            tool: tc.function.name,
            result
          };
          
          return {
            role: 'tool',
            content: result,
            tool_call_id: tc.id
          };
        } catch (error) {
          yield {
            type: 'tool_result',
            taskId: task.id,
            tool: tc.function.name,
            result: '',
            error: error.message
          };
          
          return {
            role: 'tool',
            content: `Error: ${error.message}`,
            tool_call_id: tc.id
          };
        }
      })
    );
    
    // Append tool results to context
    task.context.push(...toolResults);
  }
  
  if (iteration >= maxIterations) {
    task.status = 'failed';
    yield {
      type: 'error',
      taskId: task.id,
      error: 'Max iterations reached'
    };
  }
}
```

## Message Routing

When a message is sent without specifying a task ID, the Task Manager uses a **router** to determine which task should handle it:

### Routing Strategy

```typescript
async function routeMessage(
  message: string,
  activeTasks: Task[],
  bus: AgentBus
): Promise<string | null> {
  // If no active tasks, return null (will create new task)
  if (activeTasks.length === 0) {
    return null;
  }
  
  // If only one active task, route to it
  if (activeTasks.length === 1) {
    return activeTasks[0].id;
  }
  
  // Multiple active tasks: use LLM to determine best match
  const routerInput = {
    message,
    tasks: activeTasks.map(t => ({
      id: t.id,
      goal: t.goal,
      status: t.status,
      lastMessage: t.context[t.context.length - 1]
    }))
  };
  
  const result = await bus.invoke('model:llm')(JSON.stringify({
    messages: [
      {
        role: 'system',
        content: `You are a message router. Given a user message and a list of active tasks,
                  determine which task (if any) the message should be routed to.
                  Respond with JSON: { "taskId": "task-xxx" } or { "taskId": null } for new task.`
      },
      {
        role: 'user',
        content: JSON.stringify(routerInput)
      }
    ]
  }));
  
  const { taskId } = JSON.parse(result);
  return taskId;
}
```

## Subtask Management

### Creating Subtasks

LLM can create subtasks by invoking `task:spawn` with `parentTaskId`:

```typescript
// In task's run loop, LLM makes tool call:
{
  "function": {
    "name": "task_spawn",
    "arguments": JSON.stringify({
      goal: "Analyze Q1 data",
      parentTaskId: currentTaskId
    })
  }
}

// Parent task receives subtask ID and can:
// 1. Wait for subtask completion
// 2. Continue with other work
// 3. Monitor subtask progress
```

### Subtask Tree

Tasks form a tree structure:

```
task-root (Analyze annual sales)
├── task-q1 (Analyze Q1 data)
│   ├── task-jan (Analyze January)
│   ├── task-feb (Analyze February)
│   └── task-mar (Analyze March)
├── task-q2 (Analyze Q2 data)
├── task-q3 (Analyze Q3 data)
└── task-q4 (Analyze Q4 data)
```

Query subtasks:

```typescript
const result = await bus.invoke('task:list')(JSON.stringify({
  parentTaskId: 'task-root'
}));

// Returns all direct children of task-root
```

## State Management

### Task Registry

All tasks are stored in an in-memory registry:

```typescript
type TaskRegistry = {
  tasks: Map<string, Task>;
  activeTasks: Set<string>;           // Tasks in 'running' status
  taskOutputStreams: Map<string, Set<OutputListener>>;
};

type OutputListener = (output: TaskOutput) => void;
```

### Concurrent Task Limit

Limit the number of concurrent running tasks:

```typescript
const MAX_CONCURRENT_TASKS = 10;

function canSpawnTask(registry: TaskRegistry): boolean {
  return registry.activeTasks.size < MAX_CONCURRENT_TASKS;
}
```

If limit reached, new tasks start in `pending` status and are queued.

## Error Handling

### Task Failure

If a task encounters an error:

1. Set status to `failed`
2. Emit error output event
3. Optionally save to memory for debugging

```typescript
try {
  // Run task loop
  yield* runTaskLoop(task, bus);
} catch (error) {
  task.status = 'failed';
  yield {
    type: 'error',
    taskId: task.id,
    error: error.message
  };
  
  // Optionally archive failed task
  await bus.invoke('mem:save')(JSON.stringify({
    task: task,
    error: error.message
  }));
}
```

### Graceful Shutdown

On system shutdown, save all active tasks:

```typescript
async function shutdownTaskManager(
  registry: TaskRegistry,
  bus: AgentBus
): Promise<void> {
  for (const taskId of registry.activeTasks) {
    const task = registry.tasks.get(taskId);
    if (task) {
      task.status = 'waiting';
      await bus.invoke('mem:save')(JSON.stringify({ task }));
    }
  }
}
```

## Integration with Memory

### Auto-Archiving

When a task completes, automatically archive to long-term memory:

```typescript
async function onTaskComplete(task: Task, bus: AgentBus): Promise<void> {
  // Save complete task record
  await bus.invoke('mem:save')(JSON.stringify({ task }));
  
  // Extract knowledge and build graph
  await bus.invoke('mem:archive')(JSON.stringify({
    taskId: task.id,
    context: task.context
  }));
}
```

### Context Recall

When starting a task, retrieve relevant context from memory:

```typescript
async function initializeTaskContext(
  goal: string,
  bus: AgentBus
): Promise<ChatMessage[]> {
  // Retrieve relevant past knowledge
  const memResult = await bus.invoke('mem:retrieve')(JSON.stringify({
    query: goal,
    limit: 5
  }));
  
  const { chunks } = JSON.parse(memResult);
  
  // Build system message with recalled context
  const systemMessage = {
    role: 'system',
    content: `You are a helpful AI assistant. Here is relevant context from past tasks:\n\n${
      chunks.map(c => c.content).join('\n\n')
    }`
  };
  
  return [systemMessage];
}
```

## Testing Strategy

### Unit Tests

```typescript
test('task:spawn creates new task', async () => {
  const bus = createMockBus();
  const taskManager = createTaskManager(bus);
  
  const result = await bus.invoke('task:spawn')(JSON.stringify({
    goal: 'Test task'
  }));
  
  const { taskId, status } = JSON.parse(result);
  expect(taskId).toBeDefined();
  expect(status).toBe('running');
});

test('task:list filters by status', async () => {
  const bus = createMockBus();
  const taskManager = createTaskManager(bus);
  
  // Create tasks
  await bus.invoke('task:spawn')('{"goal":"Task 1"}');
  await bus.invoke('task:spawn')('{"goal":"Task 2"}');
  
  const result = await bus.invoke('task:list')(JSON.stringify({
    status: 'running'
  }));
  
  const { tasks, total } = JSON.parse(result);
  expect(total).toBe(2);
});
```

### Integration Tests

```typescript
test('Full task lifecycle', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const modelManager = createModelManager(bus);
  
  // Spawn task
  const spawnResult = await bus.invoke('task:spawn')('{"goal":"Test"}');
  const { taskId } = JSON.parse(spawnResult);
  
  // Stream output
  const outputs = [];
  for await (const chunk of bus.invokeStream('task:stream')(`{"taskId":"${taskId}"}`)) {
    outputs.push(JSON.parse(chunk));
  }
  
  // Verify output structure
  expect(outputs[0].type).toBe('start');
  expect(outputs[outputs.length - 1].type).toBe('end');
});
```

## Summary

Task Manager provides:

✅ **Concurrent task execution** with isolated contexts
✅ **Recursive subtasks** via `task:spawn` ability
✅ **Message routing** to appropriate tasks
✅ **Real-time streaming** of task output
✅ **Task lifecycle management** (create, run, complete, kill)
✅ **Integration with Memory** for context recall and archiving

As a Bus-below module, Task Manager is both a powerful orchestrator and a callable service.

