# Agent OS - Shell 模块

## 概述

**Shell** 是 Agent OS 的面向用户的 HTTP API 层。就像操作系统的 shell 一样，它为外部客户端提供与系统交互的命令接口。Shell 位于 **Agent Bus 之上**，充当总线能力的纯消费者。

## 设计原则

1. **双重角色**：Shell 既是能力提供者（`shell:sendMessageChunk`）也是能力消费者（调用其他能力）
2. **薄层**：Shell 只将 HTTP 请求转换为总线调用，并维护 SSE 连接
3. **无状态核心**：除 SSE 连接外，Shell 不维护业务状态
4. **流式优先**：设计用于通过 SSE 进行实时流式响应

## HTTP API 设计

### 1. POST /send - 发送消息

**目的**：接受用户消息并创建或追加到任务。

**请求**：
```http
POST /send
Content-Type: application/json

{
  "message": "Help me analyze this data",
  "taskId": "task-123" // 可选，如果省略则创建新任务
}
```

**响应**：
```http
200 OK
Content-Type: application/json

{
  "taskId": "task-123",
  "status": "running"
}
```

**实现流程**：
```typescript
// 伪代码
async function handleSend(req: Request): Promise<Response> {
  const { message, taskId } = await req.json();
  
  if (taskId) {
    // 向现有任务发送消息
    const result = await bus.invoke(
      'shell',                          // callerId
      'task:send',                       // abilityId
      JSON.stringify({
        receiverId: taskId,
        message
      })
    );
    return Response.json(JSON.parse(result));
  } else {
    // 创建新任务
    const result = await bus.invoke(
      'shell',                          // callerId
      'task:spawn',                      // abilityId
      JSON.stringify({ goal: message })
    );
    return Response.json(JSON.parse(result));
  }
}
```

### 2. GET /stream/:taskId - 流式传输任务输出

**目的**：建立 SSE 连接以接收实时任务输出。

**请求**：
```http
GET /stream/task-123
Accept: text/event-stream
```

**响应**：
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

**实现流程**：
```typescript
// Shell 维护活动的 SSE 连接映射
type SSEConnection = {
  taskId: string;
  controller: ReadableStreamDefaultController;
  messageBuffer: Map<string, Array<{ content: string; index: number }>>;
};

const activeConnections = new Map<string, SSEConnection>();

// 处理 /stream/:taskId 请求
async function handleStream(req: Request): Promise<Response> {
  const taskId = req.params.taskId;
  
  const stream = new ReadableStream({
    start(controller) {
      // 注册此 SSE 连接
      activeConnections.set(taskId, {
        taskId,
        controller,
        messageBuffer: new Map()
      });
      
      // 发送连接建立事件
      const startEvent = formatSSE({
        type: 'start',
        taskId
      });
      controller.enqueue(startEvent);
    },
    
    cancel() {
      // 清理连接
      activeConnections.delete(taskId);
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

const formatSSE = (data: any): Uint8Array => {
  const type = data.type || 'message';
  const json = JSON.stringify(data);
  const sse = `event: ${type}\ndata: ${json}\n\n`;
  return new TextEncoder().encode(sse);
};
```

### 3. GET /inspection/* - 检查 API（保留）

**目的**：为监控和调试提供对系统状态的只读访问。

这些端点保留供将来实现。建议的路由：

```
GET /inspection/tasks              # 列出所有任务
GET /inspection/tasks/:taskId      # 获取任务详情
GET /inspection/memory/stats       # Memory 统计信息
GET /inspection/models             # 列出可用模型
GET /inspection/abilities          # 列出所有能力
```

**实现策略**：
每个检查端点将调用相应的总线能力：
- `/inspection/tasks` → `task:list`
- `/inspection/tasks/:taskId` → `task:get`
- `/inspection/memory/stats` → `mem:stats`
- `/inspection/models` → `model:list`
- `/inspection/abilities` → `bus:list` + `bus:abilities`

## Shell 注册的能力

### shell:sendMessageChunk - 向用户发送消息片段

**描述**：接收来自任务的消息片段，并通过 SSE 连接推送给用户。这是任务向用户输出的主要机制。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "消息内容片段"
    },
    "messageId": {
      "type": "string",
      "description": "消息的唯一标识符，用于组装多个片段"
    },
    "index": {
      "type": "number",
      "description": "片段索引。>= 0 表示还有后续片段，< 0 表示消息结束"
    }
  },
  "required": ["content", "messageId", "index"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "是否成功推送"
    },
    "error": {
      "type": "string",
      "description": "失败时的错误信息"
    }
  },
  "required": ["success"]
}
```

**实现**：
```typescript
// 注册 shell:sendMessageChunk 能力
bus.register(
  {
    id: 'shell:sendMessageChunk',
    moduleName: 'shell',
    abilityName: 'sendMessageChunk',
    description: '向用户发送消息片段',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        messageId: { type: 'string' },
        index: { type: 'number' }
      },
      required: ['content', 'messageId', 'index']
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' }
      },
      required: ['success']
    }
  },
  async (input: string) => {
    const { content, messageId, index } = JSON.parse(input);
    
    // 从 callerId 中提取 taskId（格式：'task-xxx'）
    // 注意：实际实现中，callerId 需要从总线上下文传递
    const taskId = extractTaskIdFromContext();
    
    const connection = activeConnections.get(taskId);
    if (!connection) {
      return JSON.stringify({
        success: false,
        error: `No active SSE connection for task ${taskId}`
      });
    }
    
    // 获取或创建消息缓冲区
    if (!connection.messageBuffer.has(messageId)) {
      connection.messageBuffer.set(messageId, []);
    }
    const buffer = connection.messageBuffer.get(messageId)!;
    
    // 添加片段到缓冲区
    buffer.push({ content, index });
    
    // 发送内容片段
    const chunkEvent = formatSSE({
      type: 'content',
      messageId,
      content,
      index
    });
    connection.controller.enqueue(chunkEvent);
    
    // 如果是最后一个片段，清理缓冲区
    if (index < 0) {
      connection.messageBuffer.delete(messageId);
      
      // 发送消息完成事件
      const completeEvent = formatSSE({
        type: 'message_complete',
        messageId
      });
      connection.controller.enqueue(completeEvent);
    }
    
    return JSON.stringify({ success: true });
  }
);
```

**使用示例**：

任务向用户推送流式内容：

```typescript
// Task Manager 在处理 LLM 流式响应时
for await (const chunk of llmStream) {
  await bus.invoke(
    taskId,
    'shell:sendMessageChunk',
    JSON.stringify({
      content: chunk.content,
      messageId: currentMessageId,
      index: chunkIndex++
    })
  );
}

// 发送最后一个片段，标记消息结束
await bus.invoke(
  taskId,
  'shell:sendMessageChunk',
  JSON.stringify({
    content: '',
    messageId: currentMessageId,
    index: -1
  })
);
```

**协议说明**：

1. **消息片段化**：长消息可以分多个片段发送
2. **index 语义**：
   - `index >= 0`：消息还有后续片段
   - `index < 0`：消息结束，不再有后续片段
3. **messageId**：用于区分不同消息的片段
4. **缓冲机制**：Shell 维护消息缓冲区，确保片段按序组装

## 错误处理

### 标准错误响应

所有错误遵循一致的格式：

```json
{
  "error": {
    "code": "TASK_NOT_FOUND",
    "message": "Task with ID 'task-123' does not exist",
    "details": {}
  }
}
```

### HTTP 状态码

- `200 OK` - 请求成功
- `400 Bad Request` - 无效输入（格式错误的 JSON、缺少字段）
- `404 Not Found` - 未找到任务或资源
- `500 Internal Server Error` - 意外的系统错误
- `503 Service Unavailable` - 总线或下游服务不可用

### 错误映射

将总线调用错误映射到适当的 HTTP 错误：

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

## 实现说明

### 1. SSE 连接管理

**保持活动**：发送周期性心跳以保持连接活动：

```typescript
// 每 30 秒发送一次心跳
const heartbeatInterval = setInterval(() => {
  controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
}, 30000);

// 关闭时清理
req.signal.addEventListener('abort', () => {
  clearInterval(heartbeatInterval);
  controller.close();
});
```

**重新连接**：客户端应实现指数退避的重新连接：

```typescript
// 客户端伪代码
function connectSSE(taskId: string) {
  const eventSource = new EventSource(`/stream/${taskId}`);
  
  eventSource.onerror = () => {
    eventSource.close();
    setTimeout(() => connectSSE(taskId), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 30000);
  };
}
```

### 2. 总线交互模式

始终在 try-catch 中包装总线调用：

```typescript
const invokeBus = async (
  callerId: string,
  abilityId: string,
  input: any
): Promise<any> => {
  try {
    const result = await bus.invoke(
      callerId,
      abilityId,
      JSON.stringify(input)
    );
    return JSON.parse(result);
  } catch (error) {
    console.error(`Bus invocation failed: ${abilityId}`, error);
    throw error;
  }
};
```

### 3. 请求验证

在调用总线之前验证请求：

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

### 4. CORS 配置

为浏览器客户端启用 CORS：

```typescript
const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // 根据需要配置
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 处理预检请求
if (req.method === 'OPTIONS') {
  return new Response(null, { headers: corsHeaders });
}
```

## 与 Agent Bus 的集成

### 初始化

Shell 使用对 Agent Bus 的引用进行初始化，并注册自己的能力：

```typescript
type Shell = {
  start: (port: number) => Promise<void>;
  stop: () => Promise<void>;
};

type CreateShell = (bus: AgentBus) => Shell;

const createShell = (bus: AgentBus): Shell => {
  // 注册 shell:sendMessageChunk 能力
  registerShellAbilities(bus);
  
  return {
    start: async (port: number) => {
      // 启动 HTTP 服务器
      // ...
    },
    stop: async () => {
      // 清理所有活动的 SSE 连接
      activeConnections.clear();
      // 停止 HTTP 服务器
      // ...
    }
  };
};

// 使用方式
const shell = createShell(bus);
await shell.start(3000);
```

### 总线依赖

**Shell 提供的能力**：
- `shell:sendMessageChunk` - 接收任务的消息片段并推送给用户

**Shell 依赖的能力**：

**必需**：
- `task:spawn` - 创建新任务
- `task:send` - 向任务发送消息

**可选**（用于检查）：
- `task:list` - 列出任务
- `task:get` - 获取任务详情
- `mem:stats` - Memory 统计信息
- `model:list` - 列出模型
- `bus:list` - 列出模块
- `bus:abilities` - 列出能力

### 启动检查

在启动时验证所需能力：

```typescript
const verifyDependencies = async (bus: AgentBus): Promise<void> => {
  const required = ['task:spawn', 'task:send'];
  
  for (const abilityId of required) {
    if (!bus.has(abilityId)) {
      throw new Error(`Required ability not found: ${abilityId}`);
    }
  }
  
  // 验证 Shell 自己的能力已注册
  if (!bus.has('shell:sendMessageChunk')) {
    throw new Error('Shell ability not registered: shell:sendMessageChunk');
  }
};
```

## 示例：完整的请求流程

### 场景：用户发送 "Hello"

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

## 安全考虑

### 1. 输入净化

在传递给总线之前始终净化用户输入：

```typescript
function sanitizeMessage(message: string): string {
  // 限制长度
  const maxLength = 10000;
  if (message.length > maxLength) {
    throw new Error(`Message too long: max ${maxLength} characters`);
  }
  
  // 修剪空白
  return message.trim();
}
```

### 2. 速率限制

实施速率限制以防止滥用：

```typescript
// 使用简单的内存存储（生产环境考虑使用 Redis）
const rateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientId: string): boolean {
  const now = Date.now();
  const limit = rateLimits.get(clientId);
  
  if (!limit || now > limit.resetAt) {
    rateLimits.set(clientId, { count: 1, resetAt: now + 60000 });
    return true;
  }
  
  if (limit.count >= 100) { // 每分钟 100 个请求
    return false;
  }
  
  limit.count++;
  return true;
}
```

### 3. 身份验证（未来）

保留用于身份验证令牌的 header：

```typescript
// 检查 Authorization header
const token = req.headers.get('Authorization');
if (!token || !await verifyToken(token)) {
  return new Response('Unauthorized', { status: 401 });
}
```

## 测试策略

### 单元测试

独立测试请求处理器：

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

### 集成测试

使用真实的总线和任务管理器进行测试：

```typescript
test('Full flow: send message and stream output', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const shell = createShell(bus);
  
  // 发送消息
  const sendResponse = await shell.handle({
    method: 'POST',
    path: '/send',
    body: { message: 'Hello' }
  });
  
  const { taskId } = sendResponse.json();
  
  // 流式传输输出
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

## 总结

Shell 模块提供：

✅ **简单的 HTTP API** 用于消息发送和 SSE 流式传输  
✅ **双重角色** - 既是能力提供者也是消费者  
✅ **shell:sendMessageChunk 能力** - 任务向用户推送消息的接口  
✅ **SSE 连接管理** - 维护活动连接和消息缓冲  
✅ **简化调用协议** - 使用 `invoke(callerId, abilityId, input)`  
✅ **保留的检查端点** 用于监控  
✅ **标准错误处理** 使用 HTTP 状态码

**核心变更**：

- Shell 现在在总线上注册 `shell:sendMessageChunk` 能力
- 所有总线调用都携带 `callerId` 参数
- 移除 `task:stream` 依赖，改为通过 `shell:sendMessageChunk` 接收推送
- 消息片段化协议支持流式传输

Shell 有意保持最小化，将所有业务逻辑委托给 Agent Bus 和底层模块。

