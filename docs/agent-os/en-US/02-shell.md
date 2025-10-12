# Agent OS - Shell Module

## Overview

The **Shell** is the user-facing HTTP API layer of Agent OS. Like an operating system shell, it provides a command interface for external clients to interact with the system. The Shell sits **above the Agent Bus** and acts as a pure consumer of bus abilities.

## Design Principles

1. **Stateless**: Shell does not maintain any state; all state lives in Task Manager and Memory
2. **Thin Layer**: Shell only translates HTTP requests to bus invocations and responses back to HTTP
3. **Pure Consumer**: Shell only invokes abilities, never registers any
4. **Streaming First**: Designed for real-time streaming responses via SSE

## HTTP API Design

### 1. POST /send - Send Message

**Purpose**: Accept a user message and create or append to a task.

**Request**:
```http
POST /send
Content-Type: application/json

{
  "message": "Help me analyze this data",
  "taskId": "task-123" // optional, creates new task if omitted
}
```

**Response**:
```http
200 OK
Content-Type: application/json

{
  "taskId": "task-123",
  "status": "running"
}
```

**Implementation Flow**:
```typescript
// Pseudo-code
async function handleSend(req: Request): Promise<Response> {
  const { message, taskId } = await req.json();
  
  if (taskId) {
    // Append to existing task
    const result = await bus.invoke('task:send')(JSON.stringify({
      taskId,
      message
    }));
    return Response.json(JSON.parse(result));
  } else {
    // Create new task
    const result = await bus.invoke('task:spawn')(JSON.stringify({
      goal: message
    }));
    return Response.json(JSON.parse(result));
  }
}
```

### 2. GET /stream/:taskId - Stream Task Output

**Purpose**: Establish SSE connection to receive real-time task output.

**Request**:
```http
GET /stream/task-123
Accept: text/event-stream
```

**Response**:
```http
200 OK
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive

event: start
data: {"type":"start","taskId":"task-123","goal":"Help me..."}

event: content
data: {"type":"content","content":"I'll help you analyze..."}

event: tool_call
data: {"type":"tool_call","tool":"mem:retrieve","args":{...}}

event: tool_result
data: {"type":"tool_result","tool":"mem:retrieve","result":"..."}

event: content
data: {"type":"content","content":"Based on the data..."}

event: end
data: {"type":"end","taskId":"task-123","status":"completed"}
```

**Implementation Flow**:
```typescript
// Pseudo-code
async function handleStream(req: Request): Promise<Response> {
  const taskId = req.params.taskId;
  
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Get task output stream from bus
        const outputStream = bus.invokeStream('task:stream')(
          JSON.stringify({ taskId })
        );
        
        for await (const chunk of outputStream) {
          // Parse output and format as SSE
          const output = JSON.parse(chunk);
          const sseData = formatSSE(output);
          controller.enqueue(sseData);
        }
        
        controller.close();
      } catch (error) {
        const errorData = formatSSE({ type: 'error', error: error.message });
        controller.enqueue(errorData);
        controller.close();
      }
    }
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
}

function formatSSE(data: any): Uint8Array {
  const type = data.type || 'message';
  const json = JSON.stringify(data);
  const sse = `event: ${type}\ndata: ${json}\n\n`;
  return new TextEncoder().encode(sse);
}
```

### 3. GET /inspection/* - Inspection APIs (Reserved)

**Purpose**: Provide read-only access to system state for monitoring and debugging.

These endpoints are reserved for future implementation. Proposed routes:

```
GET /inspection/tasks              # List all tasks
GET /inspection/tasks/:taskId      # Get task details
GET /inspection/memory/stats       # Memory statistics
GET /inspection/models             # List available models
GET /inspection/abilities          # List all abilities
```

**Implementation Strategy**:
Each inspection endpoint will invoke the corresponding bus abilities:
- `/inspection/tasks` → `task:list`
- `/inspection/tasks/:taskId` → `task:get`
- `/inspection/memory/stats` → `mem:stats`
- `/inspection/models` → `model:list`
- `/inspection/abilities` → `bus:list` + `bus:abilities`

## Error Handling

### Standard Error Response

All errors follow a consistent format:

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID 'task-123' does not exist",
    "details": {}
  }
}
```

### HTTP Status Codes

- `200 OK` - Successful request
- `400 Bad Request` - Invalid input (malformed JSON, missing fields)
- `404 Not Found` - Task or resource not found
- `500 Internal Server Error` - Unexpected system error
- `503 Service Unavailable` - Bus or downstream service unavailable

### Error Mapping

Map bus invocation errors to appropriate HTTP errors:

```typescript
function mapBusError(error: Error): { status: number; body: any } {
  if (error.message.includes('not found')) {
    return {
      status: 404,
      body: {
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      }
    };
  }
  
  if (error.message.includes('invalid')) {
    return {
      status: 400,
      body: {
        error: {
          code: 'INVALID_INPUT',
          message: error.message
        }
      }
    };
  }
  
  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred'
      }
    }
  };
}
```

## Implementation Notes

### 1. SSE Connection Management

**Keep-Alive**: Send periodic heartbeat to keep connection alive:

```typescript
// Send heartbeat every 30 seconds
const heartbeatInterval = setInterval(() => {
  controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
}, 30000);

// Clean up on close
req.signal.addEventListener('abort', () => {
  clearInterval(heartbeatInterval);
  controller.close();
});
```

**Reconnection**: Client should implement reconnection with exponential backoff:

```typescript
// Client-side pseudo-code
function connectSSE(taskId: string) {
  const eventSource = new EventSource(`/stream/${taskId}`);
  
  eventSource.onerror = () => {
    eventSource.close();
    setTimeout(() => connectSSE(taskId), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  };
}
```

### 2. Bus Interaction Pattern

Always wrap bus invocations in try-catch:

```typescript
async function invokeBus(abilityId: string, input: any): Promise<any> {
  try {
    const result = await bus.invoke(abilityId)(JSON.stringify(input));
    return JSON.parse(result);
  } catch (error) {
    console.error(`Bus invocation failed: ${abilityId}`, error);
    throw error;
  }
}
```

### 3. Request Validation

Validate requests before invoking bus:

```typescript
type SendRequest = {
  message: string;
  taskId?: string;
};

function validateSendRequest(body: any): SendRequest {
  if (typeof body.message !== 'string' || body.message.trim() === '') {
    throw new Error('Invalid message: must be non-empty string');
  }
  
  if (body.taskId !== undefined && typeof body.taskId !== 'string') {
    throw new Error('Invalid taskId: must be string');
  }
  
  return body as SendRequest;
}
```

### 4. CORS Configuration

Enable CORS for browser clients:

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // Configure as needed
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle preflight
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

## Integration with Agent Bus

### Initialization

Shell is initialized with a reference to the Agent Bus:

```typescript
type Shell = {
  start: (port: number) => Promise<void>;
  stop: () => Promise<void>;
};

type CreateShell = (bus: AgentBus) => Shell;

// Usage
const shell = createShell(bus);
await shell.start(3000);
```

### Bus Dependency

Shell depends on the following abilities being registered:

**Required**:
- `task:spawn` - Create new task
- `task:send` - Send message to task
- `task:stream` - Stream task output

**Optional** (for inspection):
- `task:list` - List tasks
- `task:get` - Get task details
- `mem:stats` - Memory statistics
- `model:list` - List models
- `bus:list` - List modules
- `bus:abilities` - List abilities

### Startup Check

Verify required abilities on startup:

```typescript
async function verifyDependencies(bus: AgentBus): Promise<void> {
  const required = ['task:spawn', 'task:send', 'task:stream'];
  
  for (const abilityId of required) {
    try {
      await bus.invoke('bus:inspect')(JSON.stringify({ abilityId }));
    } catch (error) {
      throw new Error(`Required ability not found: ${abilityId}`);
    }
  }
}
```

## Example: Complete Request Flow

### Scenario: User sends "Hello"

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ POST /send {"message":"Hello"}
     ▼
┌─────────────┐
│   Shell     │
├─────────────┤
│ Validate    │
│ request     │
└────┬────────┘
     │ bus.invoke('task:spawn')('{"goal":"Hello"}')
     ▼
┌─────────────┐
│  Agent Bus  │
└────┬────────┘
     │ Route to task:spawn
     ▼
┌─────────────┐
│   Task Mgr  │
├─────────────┤
│ Create task │
│ ID: t-123   │
└────┬────────┘
     │ '{"taskId":"t-123","status":"running"}'
     ▼
┌─────────────┐
│  Agent Bus  │
└────┬────────┘
     │
     ▼
┌─────────────┐
│   Shell     │
├─────────────┤
│ Parse JSON  │
│ Send 200    │
└────┬────────┘
     │ {"taskId":"t-123","status":"running"}
     ▼
┌──────────┐
│  Client  │
├──────────┤
│ GET /stream/t-123
└──────────┘
```

## Security Considerations

### 1. Input Sanitization

Always sanitize user input before passing to bus:

```typescript
function sanitizeMessage(message: string): string {
  // Limit length
  const maxLength = 10000;
  if (message.length > maxLength) {
    throw new Error(`Message too long: max ${maxLength} characters`);
  }
  
  // Trim whitespace
  return message.trim();
}
```

### 2. Rate Limiting

Implement rate limiting to prevent abuse:

```typescript
// Using simple in-memory store (consider Redis for production)
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(clientId);
  
  if (!limit || now > limit.resetAt) {
    rateLimits.set(clientId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 100) { // 100 requests per minute
    return false;
  }
  
  limit.count++;
  return true;
}
```

### 3. Authentication (Future)

Reserve header for authentication tokens:

```typescript
// Check Authorization header
const token = req.headers.get('Authorization');
if (!token || !await verifyToken(token)) {
  return new Response('Unauthorized', { status: 401 });
}
```

## Testing Strategy

### Unit Tests

Test request handlers in isolation:

```typescript
test('POST /send creates new task', async () => {
  const mockBus = createMockBus({
    'task:spawn': async (input) => {
      return JSON.stringify({ taskId: 't-123', status: 'running' });
    }
  });
  
  const shell = createShell(mockBus);
  const response = await shell.handle({
    method: 'POST',
    path: '/send',
    body: { message: 'Hello' }
  });
  
  expect(response.status).toBe(200);
  expect(response.json()).toEqual({ taskId: 't-123', status: 'running' });
});
```

### Integration Tests

Test with real bus and task manager:

```typescript
test('Full flow: send message and stream output', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const shell = createShell(bus);
  
  // Send message
  const sendResponse = await shell.handle({
    method: 'POST',
    path: '/send',
    body: { message: 'Hello' }
  });
  
  const { taskId } = sendResponse.json();
  
  // Stream output
  const streamResponse = await shell.handle({
    method: 'GET',
    path: `/stream/${taskId}`
  });
  
  const chunks = [];
  for await (const chunk of streamResponse.body) {
    chunks.push(chunk);
  }
  
  expect(chunks.length).toBeGreaterThan(0);
});
```

## Summary

The Shell module provides:

✅ **Simple HTTP API** for message sending and streaming
✅ **Stateless design** - all state in Task Manager
✅ **Pure bus consumer** - thin translation layer
✅ **SSE streaming** for real-time output
✅ **Reserved inspection endpoints** for monitoring
✅ **Standard error handling** with HTTP status codes

The Shell is intentionally minimal, delegating all business logic to the Agent Bus and underlying modules.

