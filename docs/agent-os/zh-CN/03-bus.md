# Agent OS - Agent Bus

## 概述

**Agent Bus** 是 Agent OS 的中央通信枢纽。就像硬件中的系统总线一样，它实现了所有模块之间的解耦通信。系统中的每个功能都通过统一接口通过总线访问。

## 核心概念

### 能力（Ability）

**能力**是在总线上注册的可调用功能单元。每个能力都有：

- **唯一 ID**：格式 `${moduleName}:${abilityName}`（例如 `task:spawn`）
- **输入**：字符串（通常是 JSON 编码）
- **输出**：字符串（单个响应）
- **元数据**：描述、模式、标签
- **调用者追踪**：所有调用都携带调用方任务 ID

### 总线架构

```
┌─────────────────────────────────────────────────┐
│      调用者（任何模块，如 Task Manager）          │
└───────────────────┬─────────────────────────────┘
                    │
                    │ invoke('task-123', 'mem:retrieve', input)
                    ▼
┌─────────────────────────────────────────────────┐
│              Agent Bus Controller               │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         能力注册表                        │  │
│  │  {                                       │  │
│  │    'task:spawn': { meta, handler },     │  │
│  │    'model:llm': { meta, handler },      │  │
│  │    'mem:retrieve': { meta, handler },   │  │
│  │    'shell:send': { meta, handler }      │  │
│  │  }                                       │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         路由逻辑                          │  │
│  │  - 通过 abilityId 查找处理器              │  │
│  │  - 根据模式验证输入                       │  │
│  │  - 记录 callerId 用于追踪                │  │
│  │  - 执行处理器                            │  │
│  │  - 返回结果                              │  │
│  └──────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │
                    │ handler(input)
                    ▼
┌─────────────────────────────────────────────────┐
│    目标模块（如 Memory Manager）                 │
└─────────────────────────────────────────────────┘
```

## Agent Bus 接口

### 类型定义

```typescript
// 能力执行结果（能力内部返回）
type AbilityResult<R, E> = 
  | { type: 'success'; result: R }
  | { type: 'error'; error: E };

// Invoke 调用结果（Bus 返回给调用者）
type InvokeResult<R, E> = 
  | { type: 'invalid-ability'; message: string }
  | { type: 'invalid-input'; message: string }
  | { type: 'unknown-failure'; message: string }
  | AbilityResult<R, E>;

// 能力处理器签名
// taskId: 调用方任务 ID，用于追踪和上下文传递
// input: JSON 编码的参数
// 返回: AbilityResult，永不 reject
type AbilityHandler = (taskId: string, input: string) => Promise<AbilityResult<string, string>>;

// 能力元数据
type AbilityMeta = {
  id: string;                           // 例如 'task:spawn'
  moduleName: string;                   // 例如 'task'
  abilityName: string;                  // 例如 'spawn'
  description: string;
  inputSchema: z.ZodSchema;             // Zod schema 用于输入验证
  outputSchema: z.ZodSchema;            // 输出的 Zod schema
  tags?: string[];                      // 可选的分类标签
};

// 已注册的能力
type RegisteredAbility = {
  meta: AbilityMeta;
  handler: AbilityHandler;
};

// Agent Bus 公共接口
type AgentBus = {
  // 调用能力
  // abilityId: 能力标识符（如 'task:spawn'）
  // callerId: 调用方任务 ID，用于追踪和审计
  // input: JSON 编码的参数
  // 返回: InvokeResult，永不 reject
  invoke: (abilityId: string, callerId: string, input: string) => Promise<InvokeResult<string, string>>;
  
  // 注册新能力
  register: (meta: AbilityMeta, handler: AbilityHandler) => void;
  
  // 注销能力
  unregister: (abilityId: string) => void;
  
  // 检查能力是否存在
  has: (abilityId: string) => boolean;
};
```

### 调用 API

#### invoke() - 调用能力

所有能力调用都使用统一的三参数接口：

```typescript
// 基本使用示例
const result = await bus.invoke(
  'task:spawn',               // abilityId - 能力标识符
  'task-abc123',              // callerId - 调用方任务 ID
  JSON.stringify({            // input - JSON 编码的参数
    goal: 'Analyze sales data'
  })
);

// 处理结果
if (result.type === 'success') {
  const { taskId } = JSON.parse(result.result);
  console.log(`Created task: ${taskId}`);
} else {
  console.error(`Error: ${result.message || result.error}`);
}
```

**参数说明**：

1. **abilityId**：目标能力的唯一标识符
   - 格式：`${moduleName}:${abilityName}`
   - 例如：`task:spawn`、`mem:retrieve`、`shell:send`

2. **callerId**：调用方的任务 ID
   - 用于追踪能力调用链
   - 用于审计和调试
   - 用于权限控制（未来）

3. **input**：JSON 编码的参数字符串
   - 必须符合能力的 inputSchema（Zod schema）
   - 由总线使用 Zod 自动验证

**调用示例**：

```typescript
// 从任务中检索记忆
const memResult = await bus.invoke(
  'mem:retrieve',
  'task-xyz789',
  JSON.stringify({ query: 'sales data Q1' })
);

// 向用户发送消息片段
const shellResult = await bus.invoke(
  'shell:send',
  'task-abc123',
  JSON.stringify({
    content: 'Processing your request...',
    messageId: 'msg-001',
    index: 0
  })
);

// 任务间通信
const sendResult = await bus.invoke(
  'task:send',
  'task-parent',
  JSON.stringify({
    receiverId: 'task-child',
    message: 'Continue with next step'
  })
);
```

#### 标准化错误处理

**核心原则：永不 reject**

Agent Bus 采用标准化的错误处理机制：

1. **invoke 返回的 Promise 永不 reject**
   - 所有错误都通过 `InvokeResult` 类型返回
   - 调用方无需使用 try-catch 捕获 rejection

2. **能力 handler 返回的 Promise 也永不 reject**
   - Handler 必须返回 `AbilityResult<R, E>` 类型
   - 所有错误都包装为 `{ type: 'error', error: E }`

3. **错误类型分类**：

```typescript
// InvokeResult 的四种可能结果：

// 1. 能力不存在
{ type: 'invalid-ability', message: 'Ability not found: xxx' }

// 2. 输入验证失败（不符合 Zod schema）
{ type: 'invalid-input', message: 'Input validation failed: ...' }

// 3. Handler 意外 reject（不应该发生）
{ type: 'unknown-failure', message: 'Handler rejected unexpectedly: ...' }

// 4. 成功执行（返回 AbilityResult）
{ type: 'success', result: '...' }  // 或
{ type: 'error', error: '...' }     // 业务逻辑错误
```

**错误处理示例**：

```typescript
// 方式 1：完整处理所有情况
const result = await bus.invoke('task:spawn', 'caller-1', JSON.stringify({ goal: 'test' }));

switch (result.type) {
  case 'invalid-ability':
    console.error('Ability not found:', result.message);
    break;
  
  case 'invalid-input':
    console.error('Invalid input:', result.message);
    break;
  
  case 'unknown-failure':
    console.error('Unexpected failure:', result.message);
    break;
  
  case 'success':
    const data = JSON.parse(result.result);
    console.log('Success:', data);
    break;
  
  case 'error':
    console.error('Business error:', result.error);
    break;
}

// 方式 2：使用帮助函数简化（适合已知能力存在的场景）
const unwrapResult = (result: InvokeResult<string, string>): string => {
  if (result.type === 'success') return result.result;
  const msg = result.message || result.error;
  throw new Error(`Invoke failed (${result.type}): ${msg}`);
};

try {
  const data = unwrapResult(await bus.invoke('task:spawn', 'caller-1', input));
  console.log('Task created:', JSON.parse(data).taskId);
} catch (error) {
  console.error('Failed to create task:', error);
}
```

### 注册 API

#### register()

在总线上注册新能力：

```typescript
import { z } from 'zod';

// 定义 Zod schemas
const inputSchema = z.object({
  goal: z.string().describe('Task goal'),
  parentTaskId: z.string().optional().describe('Parent task ID')
});

const outputSchema = z.object({
  taskId: z.string(),
  status: z.enum(['pending', 'running'])
});

// 示例：注册 task:spawn 能力
bus.register(
  {
    id: 'task:spawn',
    moduleName: 'task',
    abilityName: 'spawn',
    description: 'Create a new task',
    inputSchema,
    outputSchema
  },
  async (taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { goal, parentTaskId } = JSON.parse(input);
      const task = createTask(goal, parentTaskId);
      return { 
        type: 'success', 
        result: JSON.stringify({ taskId: task.id, status: task.status }) 
      };
    } catch (error) {
      return { 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
);
```

**注意**：
- 处理器函数接收两个参数：`taskId`（调用方任务 ID）和 `input`（JSON 编码的参数）
- 处理器必须返回 `AbilityResult<R, E>` 类型，永不 reject
- 使用 `try-catch` 捕获所有异常，并返回 `{ type: 'error', error }` 而非抛出
- Input validation 由总线使用 Zod 自动完成，handler 无需再次验证

#### unregister()

从总线中移除能力：

```typescript
bus.unregister('task:spawn');
```

**使用场景**：
- 模块热重载
- 临时能力覆盖
- 模块关闭时清理

## 能力 ID 命名约定

格式：`${moduleName}:${abilityName}`

### 规则

1. **模块名**（单数，小写）：
   - `task`（不是 `tasks`）
   - `model`（不是 `models`）
   - `mem`（不是 `memory`，如果太长则缩写）
   - `bus`（总线控制器本身）

2. **能力名**（基于动词，小写）：
   - 动作动词：`spawn`、`send`、`kill`、`list`、`get`
   - 避免通用名称：`create` → `spawn`，`delete` → `kill`

3. **分隔符**：始终使用冒号 `:`

### 示例

✅ **正确**：
- `task:spawn` - 创建任务
- `task:send` - 向任务发送消息
- `task:kill` - 终止任务
- `model:llm` - 调用 LLM
- `model:embed` - 生成嵌入
- `mem:save` - 保存到内存
- `mem:retrieve` - 从内存检索
- `bus:list` - 列出模块

❌ **错误**：
- `tasks:create` - 错误：复数模块名，通用动词
- `taskManager:spawnTask` - 错误：驼峰式命名，冗余后缀
- `task_spawn` - 错误：下划线分隔符
- `spawn` - 错误：缺少模块名

## Bus Controller 自托管能力

Bus Controller 本身注册用于内省和发现的能力。

### bus:list - 列出模块

**描述**：列出所有已注册能力的模块。

**输入模式**：
```json
{}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "modules": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "abilityCount": { "type": "number" }
        }
      }
    }
  }
}
```

**示例**：
```typescript
const result = await bus.invoke('system', 'bus:list', '{}');
console.log(JSON.parse(result));
// {
//   "modules": [
//     { "name": "task", "abilityCount": 4 },
//     { "name": "model", "abilityCount": 3 },
//     { "name": "mem", "abilityCount": 4 },
//     { "name": "shell", "abilityCount": 1 },
//     { "name": "bus", "abilityCount": 4 }
//   ]
// }
```

### bus:abilities - 列出模块能力

**描述**：列出特定模块注册的所有能力。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "moduleName": { "type": "string" }
  },
  "required": ["moduleName"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "moduleName": { "type": "string" },
    "abilities": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

**示例**：
```typescript
const result = await bus.invoke(
  'system',                   // 系统级调用
  'bus:abilities',
  JSON.stringify({
    moduleName: 'task'
  })
);
console.log(JSON.parse(result));
// {
//   "moduleName": "task",
//   "abilities": [
//     { "id": "task:spawn", "name": "spawn", "description": "创建新任务" },
//     { "id": "task:send", "name": "send", "description": "向任务发送消息" },
//     { "id": "task:cancel", "name": "cancel", "description": "取消任务" }
//   ]
// }
```

### bus:schema - 获取能力模式

**描述**：获取特定能力的输入和输出模式。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "abilityId": { "type": "string" }
  },
  "required": ["abilityId"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "abilityId": { "type": "string" },
    "inputSchema": { "type": "object" },
    "outputSchema": { "type": "object" }
  }
}
```

**示例**：
```typescript
const result = await bus.invoke(
  'system',
  'bus:schema',
  JSON.stringify({
    abilityId: 'task:spawn'
  })
);
console.log(JSON.parse(result));
// {
//   "abilityId": "task:spawn",
//   "inputSchema": { "type": "object", "properties": { ... } },
//   "outputSchema": { "type": "object", "properties": { ... } }
// }
```

### bus:inspect - 检查能力元数据

**描述**：获取能力的完整元数据，包括描述、标签和模式。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "abilityId": { "type": "string" }
  },
  "required": ["abilityId"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "meta": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "moduleName": { "type": "string" },
        "abilityName": { "type": "string" },
        "description": { "type": "string" },
        "inputSchema": { "type": "object" },
        "outputSchema": { "type": "object" },
        "isStream": { "type": "boolean" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

**示例**：
```typescript
const result = await bus.invoke(
  'system',
  'bus:inspect',
  JSON.stringify({
    abilityId: 'task:spawn'
  })
);
console.log(JSON.parse(result));
// {
//   "meta": {
//     "id": "task:spawn",
//     "moduleName": "task",
//     "abilityName": "spawn",
//     "description": "创建具有给定目标的新任务",
//     "inputSchema": { ... },
//     "outputSchema": { ... },
//     "tags": ["task", "creation"]
//   }
// }
```

## 实现细节

### Bus Controller 结构

```typescript
type BusState = {
  abilities: Map<string, RegisteredAbility>;
  callLog: Array<{ callerId: string; abilityId: string; timestamp: number }>;
};

const createAgentBus = (): AgentBus => {
  const state: BusState = {
    abilities: new Map(),
    callLog: []
  };
  
  // 注册 bus controller 自己的能力
  registerBusControllerAbilities(state);
  
  return {
    invoke: async (callerId: string, abilityId: string, input: string) => {
      const ability = state.abilities.get(abilityId);
      if (!ability) {
        throw new Error(`Ability not found: ${abilityId}`);
      }
      
      // 记录调用用于审计
      state.callLog.push({
        callerId,
        abilityId,
        timestamp: Date.now()
      });
      
      // 验证输入
      validateInput(input, ability.meta.inputSchema);
      
      // 执行处理器
      return await ability.handler(input);
    },
    
    register: (meta: AbilityMeta, handler: AbilityHandler) => {
      if (state.abilities.has(meta.id)) {
        throw new Error(`Ability already registered: ${meta.id}`);
      }
      state.abilities.set(meta.id, { meta, handler });
    },
    
    unregister: (abilityId: string) => {
      state.abilities.delete(abilityId);
    },
    
    has: (abilityId: string) => {
      return state.abilities.has(abilityId);
    }
  };
};
```

**关键实现点**：

1. **调用者追踪**：每次调用都记录 `callerId`，用于审计和调试
2. **简化设计**：移除流式接口，所有能力都是简单的 Promise 返回
3. **统一验证**：输入验证在总线层统一处理

### 输入验证

使用 JSON Schema 验证：

```typescript
import Ajv from 'ajv';

const ajv = new Ajv();

function validateInput(input: string, schema: JSONSchema): void {
  let data: any;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${error.message}`);
  }
  
  const validate = ajv.compile(schema);
  if (!validate(data)) {
    throw new Error(`Input validation failed: ${ajv.errorsText(validate.errors)}`);
  }
}
```

### 错误处理

标准化错误格式：

```typescript
type BusError = {
  code: 'NOT_FOUND' | 'INVALID_INPUT' | 'EXECUTION_ERROR' | 'TYPE_MISMATCH';
  message: string;
  abilityId: string;
  details?: any;
};

function wrapHandler(
  abilityId: string,
  handler: AbilityHandler
): AbilityHandler {
  return async (input: string) => {
    try {
      return await handler(input);
    } catch (error) {
      const busError: BusError = {
        code: 'EXECUTION_ERROR',
        message: error.message,
        abilityId
      };
      throw new Error(JSON.stringify(busError));
    }
  };
}
```

## 使用模式

### 模式 1：基本能力调用

从任务中调用能力：

```typescript
const result = await bus.invoke(
  'task-123',
  'mem:retrieve',
  JSON.stringify({ query: 'sales data' })
);
```

### 模式 2：链式能力组合

顺序组合多个能力调用：

```typescript
// 1. 创建任务
const spawnResult = await bus.invoke(
  'shell',
  'task:spawn',
  JSON.stringify({ goal: 'Analyze Q1 data' })
);
const { taskId } = JSON.parse(spawnResult);

// 2. 检索相关记忆
const memResult = await bus.invoke(
  taskId,
  'mem:retrieve',
  JSON.stringify({ query: 'Q1 analysis' })
);

// 3. 向用户发送进度
await bus.invoke(
  taskId,
  'shell:send',
  JSON.stringify({
    content: 'Found relevant data, analyzing...',
    messageId: `${taskId}-msg-1`,
    index: 0
  })
);
```

### 模式 3：任务间通信

父子任务或协作任务间的消息传递：

```typescript
// 父任务创建子任务
const childResult = await bus.invoke(
  'task-parent',
  'task:spawn',
  JSON.stringify({
    goal: 'Process subset of data',
    parentTaskId: 'task-parent'
  })
);
const { taskId: childTaskId } = JSON.parse(childResult);

// 子任务完成后通知父任务
const sendResult = await bus.invoke(
  childTaskId,
  'task:send',
  JSON.stringify({
    receiverId: 'task-parent',
    message: 'Processing complete, found 42 records'
  })
);
```

### 模式 4：动态能力发现

在运行时发现和调用能力：

```typescript
// 列出所有模块
const modulesResult = await bus.invoke('system', 'bus:list', '{}');
const { modules } = JSON.parse(modulesResult);

// 获取每个模块的能力
for (const module of modules) {
  const abilitiesResult = await bus.invoke(
    'system',
    'bus:abilities',
    JSON.stringify({ moduleName: module.name })
  );
  console.log(JSON.parse(abilitiesResult));
}
```

## LLM 集成

能力可以自动转换为 LLM 工具定义：

```typescript
type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: JSONSchema;
  };
};

const abilityToToolDefinition = (meta: AbilityMeta): ToolDefinition => ({
  type: 'function',
  function: {
    name: meta.id.replace(':', '_'), // 'task:spawn' → 'task_spawn'
    description: meta.description,
    parameters: meta.inputSchema
  }
});

// 为 LLM 生成工具定义
const generateToolsForLLM = async (
  bus: AgentBus,
  callerId: string
): Promise<ToolDefinition[]> => {
  const modulesResult = await bus.invoke(callerId, 'bus:list', '{}');
  const { modules } = JSON.parse(modulesResult);
  
  const tools: ToolDefinition[] = [];
  
  for (const module of modules) {
    const abilitiesResult = await bus.invoke(
      callerId,
      'bus:abilities',
      JSON.stringify({ moduleName: module.name })
    );
    const { abilities } = JSON.parse(abilitiesResult);
    
    for (const ability of abilities) {
      const metaResult = await bus.invoke(
        callerId,
        'bus:inspect',
        JSON.stringify({ abilityId: ability.id })
      );
      const { meta } = JSON.parse(metaResult);
      tools.push(abilityToToolDefinition(meta));
    }
  }
  
  return tools;
};

// 在任务执行循环中使用
const tools = await generateToolsForLLM(bus, taskId);
const response = await llm.complete(messages, { tools });
```

**重要说明**：

- LLM 作为 stakeholder 不需要关心能力调用的流式输出过程
- Task Manager 负责处理 LLM 的流式响应
- Task Manager 通过 `shell:send` 逐块向用户推送内容
- 完整消息累积完成后再保存到 Ledger

## 测试策略

### 单元测试

独立测试总线控制器：

```typescript
test('invoke() calls registered ability', async () => {
  const bus = createAgentBus();
  
  bus.register(
    {
      id: 'test:echo',
      moduleName: 'test',
      abilityName: 'echo',
      description: 'Echo input',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string' }
    },
    async (input: string) => input
  );
  
  const result = await bus.invoke(
    'test-caller',
    'test:echo',
    '{"message":"hello"}'
  );
  expect(result).toBe('{"message":"hello"}');
});

test('invoke() throws for non-existent ability', async () => {
  const bus = createAgentBus();
  await expect(
    bus.invoke('test-caller', 'non:existent', '{}')
  ).rejects.toThrow('Ability not found');
});

test('invoke() tracks caller', async () => {
  const bus = createAgentBus();
  
  bus.register(
    {
      id: 'test:track',
      moduleName: 'test',
      abilityName: 'track',
      description: 'Test tracking',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' }
    },
    async (input: string) => '{"ok":true}'
  );
  
  await bus.invoke('task-123', 'test:track', '{}');
  
  // 验证调用日志包含 callerId
  const logs = bus.getCallLog();
  expect(logs[0].callerId).toBe('task-123');
  expect(logs[0].abilityId).toBe('test:track');
});
```

### 集成测试

使用多个模块进行测试：

```typescript
test('Full flow: task spawn and communication', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const shellManager = createShellManager(bus);
  
  // 模块注册能力
  taskManager.registerAbilities(bus);
  shellManager.registerAbilities(bus);
  
  // 验证注册
  expect(bus.has('task:spawn')).toBe(true);
  expect(bus.has('task:send')).toBe(true);
  expect(bus.has('shell:send')).toBe(true);
  
  // 测试任务创建
  const spawnResult = await bus.invoke(
    'shell',
    'task:spawn',
    JSON.stringify({ goal: 'Test task' })
  );
  const { taskId } = JSON.parse(spawnResult);
  expect(taskId).toBeDefined();
  
  // 测试向用户发送消息
  await bus.invoke(
    taskId,
    'shell:send',
    JSON.stringify({
      content: 'Hello user',
      messageId: 'msg-1',
      index: -1
    })
  );
  
  // 测试任务间通信
  const sendResult = await bus.invoke(
    taskId,
    'task:send',
    JSON.stringify({
      receiverId: 'task-other',
      message: 'Test message'
    })
  );
  const { success } = JSON.parse(sendResult);
  expect(success).toBe(true);
});
```

## 总结

Agent Bus 提供：

✅ **统一接口** 用于所有系统功能  
✅ **解耦通信** 在模块之间  
✅ **调用者追踪** 每次调用都携带任务 ID  
✅ **能力发现** 通过自托管的内省能力  
✅ **类型安全** 使用 JSON Schema 验证  
✅ **简化设计** 移除柯里化和流式接口  
✅ **LLM 集成** 通过自动工具定义生成  
✅ **任务间通信** 通过 `task:send` 能力  
✅ **用户输出** 通过 `shell:send` 能力

**核心设计变更**：

- 所有模块（包括 Shell）都在总线上注册能力
- 移除"总线上下"的概念区分
- 简化调用协议：`invoke(callerId, abilityId, input)`
- LLM 不需要关心流式处理的中间过程
- Task Manager 负责处理 LLM 流式响应并向用户推送

总线是 Agent OS 的核心，实现了灵活、可发现和松耦合的模块组合。

