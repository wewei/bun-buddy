# Agent OS - Agent Bus

## 概述

**Agent Bus** 是 Agent OS 的中央通信枢纽。就像硬件中的系统总线一样，它实现了所有模块之间的解耦通信。系统中的每个功能都通过统一接口通过总线访问。

## 核心概念

### 能力（Ability）

**能力**是在总线上注册的可调用功能单元。每个能力都有：

- **唯一 ID**：格式 `${moduleName}:${abilityName}`（例如 `task:spawn`）
- **输入**：字符串（通常是 JSON 编码）
- **输出**：字符串（单个响应）或流（多个块）
- **元数据**：描述、模式、执行类型

### 总线架构

```
┌─────────────────────────────────────────────────┐
│              调用者（任何模块）                   │
└───────────────────┬─────────────────────────────┘
                    │
                    │ invoke('task:spawn')(input)
                    ▼
┌─────────────────────────────────────────────────┐
│              Agent Bus Controller               │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         能力注册表                        │  │
│  │  {                                       │  │
│  │    'task:spawn': { meta, handler },     │  │
│  │    'model:llm': { meta, handler },      │  │
│  │    'mem:retrieve': { meta, handler }    │  │
│  │  }                                       │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         路由逻辑                          │  │
│  │  - 通过 abilityId 查找处理器              │  │
│  │  - 根据模式验证输入                       │  │
│  │  - 执行处理器                            │  │
│  │  - 返回结果                              │  │
│  └──────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │
                    │ handler(input)
                    ▼
┌─────────────────────────────────────────────────┐
│          目标模块（例如 Task Mgr）               │
└─────────────────────────────────────────────────┘
```

## Agent Bus 接口

### 类型定义

```typescript
// 能力处理器签名
type AbilityHandler = (input: string) => Promise<string>;
type AbilityStreamHandler = (input: string) => AsyncGenerator<string>;

// 能力元数据
type AbilityMeta = {
  id: string;                           // 例如 'task:spawn'
  moduleName: string;                   // 例如 'task'
  abilityName: string;                  // 例如 'spawn'
  description: string;
  inputSchema: JSONSchema;              // 用于输入验证的 JSON Schema
  outputSchema: JSONSchema;             // 输出的 JSON Schema
  isStream: boolean;                    // 流式为 true，单次响应为 false
  tags?: string[];                      // 可选的分类标签
};

// 已注册的能力
type RegisteredAbility = {
  meta: AbilityMeta;
  handler: AbilityHandler | AbilityStreamHandler;
};

// Agent Bus 公共接口
type AgentBus = {
  // 调用能力（单次响应）
  invoke: (abilityId: string) => (input: string) => Promise<string>;
  
  // 调用能力（流式响应）
  invokeStream: (abilityId: string) => (input: string) => AsyncGenerator<string>;
  
  // 注册新能力
  register: (meta: AbilityMeta, handler: AbilityHandler | AbilityStreamHandler) => void;
  
  // 注销能力
  unregister: (abilityId: string) => void;
  
  // 检查能力是否存在
  has: (abilityId: string) => boolean;
};
```

### 调用 API

#### invoke() - 单次响应

对于返回单个结果的能力：

```typescript
// 使用示例
const result = await bus.invoke('task:spawn')(JSON.stringify({
  goal: 'Analyze sales data'
}));

const { taskId } = JSON.parse(result);
console.log(`Created task: ${taskId}`);
```

**柯里化签名**：`invoke` 返回一个函数以支持部分应用：

```typescript
// 获取特定能力的调用器
const spawnTask = bus.invoke('task:spawn');

// 多次使用
const result1 = await spawnTask('{"goal":"Task 1"}');
const result2 = await spawnTask('{"goal":"Task 2"}');
```

#### invokeStream() - 流式响应

对于返回多个块的能力：

```typescript
// 使用示例
const stream = bus.invokeStream('model:llm')(JSON.stringify({
  messages: [{ role: 'user', content: 'Hello' }]
}));

for await (const chunk of stream) {
  const data = JSON.parse(chunk);
  process.stdout.write(data.content);
}
```

### 注册 API

#### register()

在总线上注册新能力：

```typescript
// 示例：注册 task:spawn 能力
bus.register(
  {
    id: 'task:spawn',
    moduleName: 'task',
    abilityName: 'spawn',
    description: 'Create a new task',
    isStream: false,
    inputSchema: {
      type: 'object',
      properties: {
        goal: { type: 'string', description: 'Task goal' },
        parentTaskId: { type: 'string', description: 'Parent task ID' }
      },
      required: ['goal']
    },
    outputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'running'] }
      },
      required: ['taskId', 'status']
    }
  },
  async (input: string) => {
    const { goal, parentTaskId } = JSON.parse(input);
    const task = createTask(goal, parentTaskId);
    return JSON.stringify({ taskId: task.id, status: task.status });
  }
);
```

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
const result = await bus.invoke('bus:list')('{}');
console.log(JSON.parse(result));
// {
//   "modules": [
//     { "name": "task", "abilityCount": 5 },
//     { "name": "model", "abilityCount": 4 },
//     { "name": "mem", "abilityCount": 5 },
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
          "description": { "type": "string" },
          "isStream": { "type": "boolean" }
        }
      }
    }
  }
}
```

**示例**：
```typescript
const result = await bus.invoke('bus:abilities')(JSON.stringify({
  moduleName: 'task'
}));
console.log(JSON.parse(result));
// {
//   "moduleName": "task",
//   "abilities": [
//     { "id": "task:spawn", "name": "spawn", "description": "...", "isStream": false },
//     { "id": "task:send", "name": "send", "description": "...", "isStream": false },
//     { "id": "task:stream", "name": "stream", "description": "...", "isStream": true }
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
const result = await bus.invoke('bus:schema')(JSON.stringify({
  abilityId: 'task:spawn'
}));
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
const result = await bus.invoke('bus:inspect')(JSON.stringify({
  abilityId: 'task:spawn'
}));
console.log(JSON.parse(result));
// {
//   "meta": {
//     "id": "task:spawn",
//     "moduleName": "task",
//     "abilityName": "spawn",
//     "description": "Create a new task with the given goal",
//     "inputSchema": { ... },
//     "outputSchema": { ... },
//     "isStream": false,
//     "tags": ["task", "creation"]
//   }
// }
```

## 实现细节

### Bus Controller 结构

```typescript
type BusState = {
  abilities: Map<string, RegisteredAbility>;
};

const createAgentBus = (): AgentBus => {
  const state: BusState = {
    abilities: new Map()
  };
  
  // 注册 bus controller 自己的能力
  registerBusControllerAbilities(state);
  
  return {
    invoke: (abilityId: string) => async (input: string) => {
      const ability = state.abilities.get(abilityId);
      if (!ability) {
        throw new Error(`Ability not found: ${abilityId}`);
      }
      if (ability.meta.isStream) {
        throw new Error(`Ability ${abilityId} is streaming, use invokeStream()`);
      }
      
      // 验证输入
      validateInput(input, ability.meta.inputSchema);
      
      // 执行
      return await (ability.handler as AbilityHandler)(input);
    },
    
    invokeStream: (abilityId: string) => async function* (input: string) {
      const ability = state.abilities.get(abilityId);
      if (!ability) {
        throw new Error(`Ability not found: ${abilityId}`);
      }
      if (!ability.meta.isStream) {
        throw new Error(`Ability ${abilityId} is not streaming, use invoke()`);
      }
      
      // 验证输入
      validateInput(input, ability.meta.inputSchema);
      
      // 执行
      yield* (ability.handler as AbilityStreamHandler)(input);
    },
    
    register: (meta: AbilityMeta, handler: any) => {
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

### 模式 1：直接调用

简单的一次性调用：

```typescript
const result = await bus.invoke('task:spawn')('{"goal":"Test"}');
```

### 模式 2：部分应用

可重用的调用器：

```typescript
const spawnTask = bus.invoke('task:spawn');

const task1 = await spawnTask('{"goal":"Task 1"}');
const task2 = await spawnTask('{"goal":"Task 2"}');
```

### 模式 3：链式能力

顺序组合：

```typescript
// 生成任务
const spawnResult = await bus.invoke('task:spawn')('{"goal":"Analyze"}');
const { taskId } = JSON.parse(spawnResult);

// 发送后续消息
const sendResult = await bus.invoke('task:send')(JSON.stringify({
  taskId,
  message: 'Focus on Q1 data'
}));

// 流式输出
for await (const chunk of bus.invokeStream('task:stream')(`{"taskId":"${taskId}"}`)) {
  console.log(chunk);
}
```

### 模式 4：动态发现

在运行时发现和调用能力：

```typescript
// 列出所有模块
const modulesResult = await bus.invoke('bus:list')('{}');
const { modules } = JSON.parse(modulesResult);

// 获取每个模块的能力
for (const module of modules) {
  const abilitiesResult = await bus.invoke('bus:abilities')(
    JSON.stringify({ moduleName: module.name })
  );
  console.log(JSON.parse(abilitiesResult));
}
```

## LLM 集成

能力可以自动转换为 LLM 工具定义：

```typescript
function abilityToToolDefinition(meta: AbilityMeta): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: meta.id.replace(':', '_'), // 'task:spawn' → 'task_spawn'
      description: meta.description,
      parameters: meta.inputSchema
    }
  };
}

// 为 LLM 生成工具定义
const modules = await bus.invoke('bus:list')('{}');
const tools: ToolDefinition[] = [];

for (const module of modules) {
  const abilities = await bus.invoke('bus:abilities')(
    JSON.stringify({ moduleName: module.name })
  );
  for (const ability of abilities) {
    const meta = await bus.invoke('bus:inspect')(
      JSON.stringify({ abilityId: ability.id })
    );
    tools.push(abilityToToolDefinition(meta));
  }
}

// 在 LLM 调用中使用
const response = await llm.complete(messages, { tools });
```

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
      isStream: false,
      inputSchema: { type: 'object' },
      outputSchema: { type: 'string' }
    },
    async (input: string) => input
  );
  
  const result = await bus.invoke('test:echo')('{"message":"hello"}');
  expect(result).toBe('{"message":"hello"}');
});

test('invoke() throws for non-existent ability', async () => {
  const bus = createAgentBus();
  await expect(
    bus.invoke('non:existent')('{}')
  ).rejects.toThrow('Ability not found');
});
```

### 集成测试

使用多个模块进行测试：

```typescript
test('Full flow: task spawn and stream', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const modelManager = createModelManager(bus);
  
  // Task manager 注册能力
  taskManager.registerAbilities(bus);
  modelManager.registerAbilities(bus);
  
  // 验证注册
  expect(bus.has('task:spawn')).toBe(true);
  expect(bus.has('model:llm')).toBe(true);
  
  // 使用能力
  const spawnResult = await bus.invoke('task:spawn')('{"goal":"Test"}');
  const { taskId } = JSON.parse(spawnResult);
  expect(taskId).toBeDefined();
});
```

## 总结

Agent Bus 提供：

✅ **统一接口** 用于所有系统功能
✅ **解耦通信** 在模块之间
✅ **能力发现** 通过自托管的内省能力
✅ **类型安全** 使用 JSON Schema 验证
✅ **流式支持** 用于实时输出
✅ **LLM 集成** 通过自动工具定义生成

总线是 Agent OS 的核心，实现了灵活、可发现和松耦合的模块组合。

