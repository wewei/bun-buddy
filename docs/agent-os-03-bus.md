# Agent OS - Agent Bus

## Overview

The **Agent Bus** is the central communication hub of Agent OS. Like a system bus in hardware, it enables decoupled communication between all modules. Every capability in the system is accessed through the bus via a uniform interface.

## Core Concepts

### Ability

An **Ability** is a callable unit of functionality registered on the bus. Every ability has:

- **Unique ID**: Format `${moduleName}:${abilityName}` (e.g., `task:spawn`)
- **Input**: String (typically JSON-encoded)
- **Output**: String (single response) or Stream (multiple chunks)
- **Metadata**: Description, schemas, execution type

### Bus Architecture

```
┌─────────────────────────────────────────────────┐
│              Caller (any module)                │
└───────────────────┬─────────────────────────────┘
                    │
                    │ invoke('task:spawn')(input)
                    ▼
┌─────────────────────────────────────────────────┐
│              Agent Bus Controller               │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Ability Registry                 │  │
│  │  {                                       │  │
│  │    'task:spawn': { meta, handler },     │  │
│  │    'model:llm': { meta, handler },      │  │
│  │    'mem:retrieve': { meta, handler }    │  │
│  │  }                                       │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │         Routing Logic                    │  │
│  │  - Find handler by abilityId            │  │
│  │  - Validate input against schema        │  │
│  │  - Execute handler                      │  │
│  │  - Return result                        │  │
│  └──────────────────────────────────────────┘  │
└───────────────────┬─────────────────────────────┘
                    │
                    │ handler(input)
                    ▼
┌─────────────────────────────────────────────────┐
│          Target Module (e.g., Task Mgr)         │
└─────────────────────────────────────────────────┘
```

## Agent Bus Interface

### Type Definitions

```typescript
// Ability handler signatures
type AbilityHandler = (input: string) => Promise<string>;
type AbilityStreamHandler = (input: string) => AsyncGenerator<string>;

// Ability metadata
type AbilityMeta = {
  id: string;                           // e.g., 'task:spawn'
  moduleName: string;                   // e.g., 'task'
  abilityName: string;                  // e.g., 'spawn'
  description: string;
  inputSchema: JSONSchema;              // JSON Schema for input validation
  outputSchema: JSONSchema;             // JSON Schema for output
  isStream: boolean;                    // true for stream, false for single response
  tags?: string[];                      // Optional categorization tags
};

// Registered ability
type RegisteredAbility = {
  meta: AbilityMeta;
  handler: AbilityHandler | AbilityStreamHandler;
};

// Agent Bus public interface
type AgentBus = {
  // Invoke ability (single response)
  invoke: (abilityId: string) => (input: string) => Promise<string>;
  
  // Invoke ability (streaming response)
  invokeStream: (abilityId: string) => (input: string) => AsyncGenerator<string>;
  
  // Register new ability
  register: (meta: AbilityMeta, handler: AbilityHandler | AbilityStreamHandler) => void;
  
  // Unregister ability
  unregister: (abilityId: string) => void;
  
  // Check if ability exists
  has: (abilityId: string) => boolean;
};
```

### Invocation API

#### invoke() - Single Response

For abilities that return a single result:

```typescript
// Usage example
const result = await bus.invoke('task:spawn')(JSON.stringify({
  goal: 'Analyze sales data'
}));

const { taskId } = JSON.parse(result);
console.log(`Created task: ${taskId}`);
```

**Curried Signature**: `invoke` returns a function to enable partial application:

```typescript
// Get invoker for specific ability
const spawnTask = bus.invoke('task:spawn');

// Use it multiple times
const result1 = await spawnTask('{"goal":"Task 1"}');
const result2 = await spawnTask('{"goal":"Task 2"}');
```

#### invokeStream() - Streaming Response

For abilities that return multiple chunks:

```typescript
// Usage example
const stream = bus.invokeStream('model:llm')(JSON.stringify({
  messages: [{ role: 'user', content: 'Hello' }]
}));

for await (const chunk of stream) {
  const data = JSON.parse(chunk);
  process.stdout.write(data.content);
}
```

### Registration API

#### register()

Register a new ability on the bus:

```typescript
// Example: Register task:spawn ability
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

Remove an ability from the bus:

```typescript
bus.unregister('task:spawn');
```

**Use Cases**:
- Hot reload of modules
- Temporary ability override
- Cleanup on module shutdown

## Ability ID Naming Convention

Format: `${moduleName}:${abilityName}`

### Rules

1. **Module name** (singular, lowercase):
   - `task` (not `tasks`)
   - `model` (not `models`)
   - `mem` (not `memory`, abbreviate if long)
   - `bus` (bus controller itself)

2. **Ability name** (verb-based, lowercase):
   - Action verbs: `spawn`, `send`, `kill`, `list`, `get`
   - Avoid generic names: `create` → `spawn`, `delete` → `kill`

3. **Separator**: Always use colon `:`

### Examples

✅ **Good**:
- `task:spawn` - Create task
- `task:send` - Send message to task
- `task:kill` - Terminate task
- `model:llm` - Invoke LLM
- `model:embed` - Generate embedding
- `mem:save` - Save to memory
- `mem:retrieve` - Retrieve from memory
- `bus:list` - List modules

❌ **Bad**:
- `tasks:create` - Wrong: plural module name, generic verb
- `taskManager:spawnTask` - Wrong: camelCase, redundant suffix
- `task_spawn` - Wrong: underscore separator
- `spawn` - Wrong: missing module name

## Bus Controller Self-Hosted Abilities

The Bus Controller itself registers abilities for introspection and discovery.

### bus:list - List Modules

**Description**: List all modules that have registered abilities.

**Input Schema**:
```json
{}
```

**Output Schema**:
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

**Example**:
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

### bus:abilities - List Module Abilities

**Description**: List all abilities registered by a specific module.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "moduleName": { "type": "string" }
  },
  "required": ["moduleName"]
}
```

**Output Schema**:
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

**Example**:
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

### bus:schema - Get Ability Schema

**Description**: Get the input and output schema for a specific ability.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "abilityId": { "type": "string" }
  },
  "required": ["abilityId"]
}
```

**Output Schema**:
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

**Example**:
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

### bus:inspect - Inspect Ability Metadata

**Description**: Get complete metadata for an ability including description, tags, and schemas.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "abilityId": { "type": "string" }
  },
  "required": ["abilityId"]
}
```

**Output Schema**:
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

**Example**:
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

## Implementation Details

### Bus Controller Structure

```typescript
type BusState = {
  abilities: Map<string, RegisteredAbility>;
};

const createAgentBus = (): AgentBus => {
  const state: BusState = {
    abilities: new Map()
  };
  
  // Register bus controller's own abilities
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
      
      // Validate input
      validateInput(input, ability.meta.inputSchema);
      
      // Execute
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
      
      // Validate input
      validateInput(input, ability.meta.inputSchema);
      
      // Execute
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

### Input Validation

Use JSON Schema validation:

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

### Error Handling

Standardize error format:

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

## Usage Patterns

### Pattern 1: Direct Invocation

Simple one-off call:

```typescript
const result = await bus.invoke('task:spawn')('{"goal":"Test"}');
```

### Pattern 2: Partial Application

Reusable invoker:

```typescript
const spawnTask = bus.invoke('task:spawn');

const task1 = await spawnTask('{"goal":"Task 1"}');
const task2 = await spawnTask('{"goal":"Task 2"}');
```

### Pattern 3: Chaining Abilities

Sequential composition:

```typescript
// Spawn task
const spawnResult = await bus.invoke('task:spawn')('{"goal":"Analyze"}');
const { taskId } = JSON.parse(spawnResult);

// Send follow-up message
const sendResult = await bus.invoke('task:send')(JSON.stringify({
  taskId,
  message: 'Focus on Q1 data'
}));

// Stream output
for await (const chunk of bus.invokeStream('task:stream')(`{"taskId":"${taskId}"}`)) {
  console.log(chunk);
}
```

### Pattern 4: Dynamic Discovery

Discover and invoke abilities at runtime:

```typescript
// List all modules
const modulesResult = await bus.invoke('bus:list')('{}');
const { modules } = JSON.parse(modulesResult);

// Get abilities for each module
for (const module of modules) {
  const abilitiesResult = await bus.invoke('bus:abilities')(
    JSON.stringify({ moduleName: module.name })
  );
  console.log(JSON.parse(abilitiesResult));
}
```

## LLM Integration

Abilities can be automatically converted to LLM tool definitions:

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

// Generate tool definitions for LLM
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

// Use in LLM call
const response = await llm.complete(messages, { tools });
```

## Testing Strategy

### Unit Tests

Test bus controller in isolation:

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

### Integration Tests

Test with multiple modules:

```typescript
test('Full flow: task spawn and stream', async () => {
  const bus = createAgentBus();
  const taskManager = createTaskManager(bus);
  const modelManager = createModelManager(bus);
  
  // Task manager registers abilities
  taskManager.registerAbilities(bus);
  modelManager.registerAbilities(bus);
  
  // Verify registration
  expect(bus.has('task:spawn')).toBe(true);
  expect(bus.has('model:llm')).toBe(true);
  
  // Use abilities
  const spawnResult = await bus.invoke('task:spawn')('{"goal":"Test"}');
  const { taskId } = JSON.parse(spawnResult);
  expect(taskId).toBeDefined();
});
```

## Summary

The Agent Bus provides:

✅ **Unified interface** for all system capabilities
✅ **Decoupled communication** between modules
✅ **Ability discovery** via self-hosted introspection abilities
✅ **Type safety** with JSON Schema validation
✅ **Streaming support** for real-time output
✅ **LLM integration** via automatic tool definition generation

The bus is the heart of Agent OS, enabling flexible, discoverable, and loosely-coupled module composition.

