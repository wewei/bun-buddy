# Agent OS - Model Manager

## Overview

The **Model Manager** is the ABI (Application Binary Interface) layer of Agent OS. Like an OS abstracts hardware through device drivers, Model Manager provides a unified interface to different LLM providers (OpenAI, Anthropic, etc.) and embedding models.

Model Manager sits **below the Agent Bus**: it registers abilities for model invocation while keeping provider-specific details hidden.

## Core Concepts

### Model Instance

A **Model Instance** represents a configured connection to a specific model:

```typescript
type ModelInstance = {
  id: string;                           // Unique identifier (e.g., 'gpt4')
  type: 'llm' | 'embedding';
  provider: 'openai' | 'anthropic' | 'custom';
  endpoint: string;                     // API endpoint URL
  model: string;                        // Model name (e.g., 'gpt-4-turbo')
  apiKey?: string;                      // API key (optional, can use env var)
  
  // Model-specific config
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};
```

### Model Registry

All model instances are registered in a central registry:

```typescript
type ModelRegistry = {
  instances: Map<string, ModelInstance>;
  defaultLLM?: string;                  // Default LLM instance ID
  defaultEmbedding?: string;            // Default embedding instance ID
};
```

## Registered Abilities

Model Manager registers the following abilities on the Agent Bus:

### model:llm

**Description**: Invoke an LLM for chat completion (streaming).

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "messages": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "role": { "type": "string", "enum": ["system", "user", "assistant", "tool"] },
          "content": { "type": "string" }
        }
      },
      "description": "Chat message history"
    },
    "tools": {
      "type": "array",
      "items": { "type": "object" },
      "description": "Optional tool definitions"
    },
    "modelId": {
      "type": "string",
      "description": "Optional model instance ID (uses default if omitted)"
    },
    "temperature": {
      "type": "number",
      "description": "Override temperature"
    },
    "maxTokens": {
      "type": "number",
      "description": "Override max tokens"
    }
  },
  "required": ["messages"]
}
```

**Output**: Stream of completion chunks (JSON strings).

**Chunk Schema**:
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "Text content delta"
    },
    "toolCalls": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "function": {
            "type": "object",
            "properties": {
              "name": { "type": "string" },
              "arguments": { "type": "string" }
            }
          }
        }
      }
    },
    "finished": {
      "type": "boolean",
      "description": "True if this is the final chunk"
    },
    "usage": {
      "type": "object",
      "properties": {
        "promptTokens": { "type": "number" },
        "completionTokens": { "type": "number" },
        "totalTokens": { "type": "number" }
      }
    }
  }
}
```

**Example**:
```typescript
const stream = bus.invokeStream('model:llm')(JSON.stringify({
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is 2+2?' }
  ]
}));

let fullResponse = '';
for await (const chunk of stream) {
  const data = JSON.parse(chunk);
  if (data.content) {
    fullResponse += data.content;
    process.stdout.write(data.content);
  }
  if (data.finished) {
    console.log(`\n\nTokens used: ${data.usage.totalTokens}`);
  }
}
```

**With Tools**:
```typescript
const stream = bus.invokeStream('model:llm')(JSON.stringify({
  messages: [
    { role: 'user', content: 'What tasks are currently running?' }
  ],
  tools: [
    {
      type: 'function',
      function: {
        name: 'task_list',
        description: 'List all tasks',
        parameters: {
          type: 'object',
          properties: {
            status: { type: 'string', enum: ['running', 'completed'] }
          }
        }
      }
    }
  ]
}));

for await (const chunk of stream) {
  const data = JSON.parse(chunk);
  if (data.toolCalls) {
    console.log('Tool calls:', data.toolCalls);
  }
}
```

### model:embed

**Description**: Generate embeddings for text.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "Text to embed"
    },
    "modelId": {
      "type": "string",
      "description": "Optional embedding model instance ID"
    }
  },
  "required": ["text"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "embedding": {
      "type": "array",
      "items": { "type": "number" },
      "description": "Vector embedding"
    },
    "dimensions": {
      "type": "number",
      "description": "Number of dimensions"
    },
    "usage": {
      "type": "object",
      "properties": {
        "promptTokens": { "type": "number" }
      }
    }
  },
  "required": ["embedding", "dimensions"]
}
```

**Example**:
```typescript
const result = await bus.invoke('model:embed')(JSON.stringify({
  text: 'Agent OS is a bus-based architecture'
}));

const { embedding, dimensions } = JSON.parse(result);
console.log(`Generated ${dimensions}-dimensional embedding`);
// embedding: [0.123, -0.456, 0.789, ...]
```

### model:list

**Description**: List all registered model instances.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["llm", "embedding"],
      "description": "Filter by model type"
    }
  }
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "models": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "provider": { "type": "string" },
          "model": { "type": "string" },
          "isDefault": { "type": "boolean" }
        }
      }
    },
    "total": {
      "type": "number"
    }
  },
  "required": ["models", "total"]
}
```

**Example**:
```typescript
const result = await bus.invoke('model:list')(JSON.stringify({
  type: 'llm'
}));

const { models } = JSON.parse(result);
models.forEach(m => {
  console.log(`${m.id}: ${m.provider}/${m.model} ${m.isDefault ? '(default)' : ''}`);
});

// Output:
// gpt4: openai/gpt-4-turbo (default)
// claude: anthropic/claude-3-sonnet
```

### model:register

**Description**: Dynamically register a new model instance.

**Input Schema**:
```json
{
  "type": "object",
  "properties": {
    "id": { "type": "string" },
    "type": { "type": "string", "enum": ["llm", "embedding"] },
    "provider": { "type": "string" },
    "endpoint": { "type": "string" },
    "model": { "type": "string" },
    "apiKey": { "type": "string" },
    "temperature": { "type": "number" },
    "maxTokens": { "type": "number" },
    "setAsDefault": { "type": "boolean" }
  },
  "required": ["id", "type", "provider", "endpoint", "model"]
}
```

**Output Schema**:
```json
{
  "type": "object",
  "properties": {
    "success": { "type": "boolean" },
    "modelId": { "type": "string" }
  },
  "required": ["success", "modelId"]
}
```

**Example**:
```typescript
const result = await bus.invoke('model:register')(JSON.stringify({
  id: 'gpt4-custom',
  type: 'llm',
  provider: 'openai',
  endpoint: 'https://api.openai.com/v1',
  model: 'gpt-4-turbo',
  temperature: 0.7,
  setAsDefault: false
}));

// { "success": true, "modelId": "gpt4-custom" }
```

## Provider Adapters

Model Manager uses **provider adapters** to normalize different API formats:

### Adapter Interface

```typescript
type ProviderAdapter = {
  // LLM completion (streaming)
  complete: (
    instance: ModelInstance,
    messages: ChatMessage[],
    options?: CompletionOptions
  ) => AsyncGenerator<CompletionChunk>;
  
  // Embedding generation
  embed: (
    instance: ModelInstance,
    text: string
  ) => Promise<EmbeddingResult>;
};

type CompletionOptions = {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

type CompletionChunk = {
  content: string;
  toolCalls?: ToolCall[];
  finished: boolean;
  usage?: TokenUsage;
};

type EmbeddingResult = {
  embedding: number[];
  dimensions: number;
  usage: TokenUsage;
};

type TokenUsage = {
  promptTokens: number;
  completionTokens?: number;
  totalTokens: number;
};
```

### OpenAI Adapter

```typescript
const createOpenAIAdapter = (): ProviderAdapter => ({
  complete: async function* (instance, messages, options = {}) {
    const client = new OpenAI({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.OPENAI_API_KEY
    });
    
    const stream = await client.chat.completions.create({
      model: instance.model,
      messages: messages,
      tools: options.tools,
      temperature: options.temperature ?? instance.temperature,
      max_tokens: options.maxTokens ?? instance.maxTokens,
      stream: true
    });
    
    let accumulatedContent = '';
    let accumulatedToolCalls: ToolCall[] = [];
    
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        accumulatedContent += delta.content;
        yield {
          content: delta.content,
          finished: false
        };
      }
      
      if (delta?.tool_calls) {
        // Accumulate tool calls (OpenAI streams them incrementally)
        accumulatedToolCalls = mergeToolCalls(accumulatedToolCalls, delta.tool_calls);
      }
      
      if (chunk.choices[0]?.finish_reason) {
        yield {
          content: '',
          toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          finished: true,
          usage: chunk.usage ? {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens
          } : undefined
        };
      }
    }
  },
  
  embed: async (instance, text) => {
    const client = new OpenAI({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.OPENAI_API_KEY
    });
    
    const response = await client.embeddings.create({
      model: instance.model,
      input: text
    });
    
    return {
      embedding: response.data[0].embedding,
      dimensions: response.data[0].embedding.length,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens
      }
    };
  }
});
```

### Anthropic Adapter

```typescript
const createAnthropicAdapter = (): ProviderAdapter => ({
  complete: async function* (instance, messages, options = {}) {
    const client = new Anthropic({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.ANTHROPIC_API_KEY
    });
    
    // Convert messages to Anthropic format
    const { system, messages: anthropicMessages } = convertToAnthropicFormat(messages);
    
    const stream = await client.messages.create({
      model: instance.model,
      system: system,
      messages: anthropicMessages,
      tools: options.tools,
      temperature: options.temperature ?? instance.temperature,
      max_tokens: options.maxTokens ?? instance.maxTokens ?? 1024,
      stream: true
    });
    
    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield {
            content: event.delta.text,
            finished: false
          };
        }
      }
      
      if (event.type === 'message_stop') {
        yield {
          content: '',
          finished: true,
          usage: {
            promptTokens: event.message.usage.input_tokens,
            completionTokens: event.message.usage.output_tokens,
            totalTokens: event.message.usage.input_tokens + event.message.usage.output_tokens
          }
        };
      }
    }
  },
  
  embed: async (instance, text) => {
    throw new Error('Anthropic does not provide embedding models');
  }
});
```

### Custom Adapter

For custom API endpoints:

```typescript
const createCustomAdapter = (): ProviderAdapter => ({
  complete: async function* (instance, messages, options = {}) {
    // Custom implementation
    const response = await fetch(`${instance.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${instance.apiKey}`
      },
      body: JSON.stringify({
        model: instance.model,
        messages: messages,
        stream: true
      })
    });
    
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      // Parse and yield chunks...
    }
  },
  
  embed: async (instance, text) => {
    // Custom embedding implementation
  }
});
```

## Adapter Registry

Map provider names to adapters:

```typescript
type AdapterRegistry = Map<string, ProviderAdapter>;

const createAdapterRegistry = (): AdapterRegistry => {
  const registry = new Map();
  
  registry.set('openai', createOpenAIAdapter());
  registry.set('anthropic', createAnthropicAdapter());
  registry.set('custom', createCustomAdapter());
  
  return registry;
};
```

## Model Manager Implementation

### Core Structure

```typescript
type ModelManager = {
  registry: ModelRegistry;
  adapters: AdapterRegistry;
};

const createModelManager = (bus: AgentBus): ModelManager => {
  const manager: ModelManager = {
    registry: {
      instances: new Map(),
      defaultLLM: undefined,
      defaultEmbedding: undefined
    },
    adapters: createAdapterRegistry()
  };
  
  // Register abilities
  registerModelAbilities(manager, bus);
  
  return manager;
};
```

### Ability Implementation

```typescript
function registerModelAbilities(manager: ModelManager, bus: AgentBus): void {
  // model:llm
  bus.register(
    {
      id: 'model:llm',
      moduleName: 'model',
      abilityName: 'llm',
      description: 'Invoke LLM for chat completion',
      isStream: true,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async function* (input: string) {
      const { messages, tools, modelId, temperature, maxTokens } = JSON.parse(input);
      
      // Get model instance
      const instanceId = modelId || manager.registry.defaultLLM;
      const instance = manager.registry.instances.get(instanceId!);
      if (!instance) {
        throw new Error(`Model instance not found: ${instanceId}`);
      }
      
      // Get adapter
      const adapter = manager.adapters.get(instance.provider);
      if (!adapter) {
        throw new Error(`Provider adapter not found: ${instance.provider}`);
      }
      
      // Stream completion
      for await (const chunk of adapter.complete(instance, messages, {
        tools,
        temperature,
        maxTokens
      })) {
        yield JSON.stringify(chunk);
      }
    }
  );
  
  // model:embed
  bus.register(
    {
      id: 'model:embed',
      moduleName: 'model',
      abilityName: 'embed',
      description: 'Generate text embeddings',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const { text, modelId } = JSON.parse(input);
      
      const instanceId = modelId || manager.registry.defaultEmbedding;
      const instance = manager.registry.instances.get(instanceId!);
      if (!instance) {
        throw new Error(`Model instance not found: ${instanceId}`);
      }
      
      const adapter = manager.adapters.get(instance.provider);
      if (!adapter) {
        throw new Error(`Provider adapter not found: ${instance.provider}`);
      }
      
      const result = await adapter.embed(instance, text);
      return JSON.stringify(result);
    }
  );
  
  // model:list
  bus.register(
    {
      id: 'model:list',
      moduleName: 'model',
      abilityName: 'list',
      description: 'List registered models',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const { type } = JSON.parse(input);
      
      const models = Array.from(manager.registry.instances.values())
        .filter(m => !type || m.type === type)
        .map(m => ({
          id: m.id,
          type: m.type,
          provider: m.provider,
          model: m.model,
          isDefault: m.id === manager.registry.defaultLLM || 
                     m.id === manager.registry.defaultEmbedding
        }));
      
      return JSON.stringify({ models, total: models.length });
    }
  );
  
  // model:register
  bus.register(
    {
      id: 'model:register',
      moduleName: 'model',
      abilityName: 'register',
      description: 'Register new model instance',
      isStream: false,
      inputSchema: { /* ... */ },
      outputSchema: { /* ... */ }
    },
    async (input: string) => {
      const instance: ModelInstance = JSON.parse(input);
      
      if (manager.registry.instances.has(instance.id)) {
        throw new Error(`Model instance already exists: ${instance.id}`);
      }
      
      manager.registry.instances.set(instance.id, instance);
      
      if (instance.setAsDefault) {
        if (instance.type === 'llm') {
          manager.registry.defaultLLM = instance.id;
        } else {
          manager.registry.defaultEmbedding = instance.id;
        }
      }
      
      return JSON.stringify({ success: true, modelId: instance.id });
    }
  );
}
```

## Configuration

### Initialization

```typescript
type ModelManagerConfig = {
  models: ModelInstance[];
  defaultLLM?: string;
  defaultEmbedding?: string;
};

async function initializeModelManager(
  config: ModelManagerConfig,
  bus: AgentBus
): Promise<ModelManager> {
  const manager = createModelManager(bus);
  
  // Register model instances
  for (const model of config.models) {
    await bus.invoke('model:register')(JSON.stringify(model));
  }
  
  // Set defaults
  if (config.defaultLLM) {
    manager.registry.defaultLLM = config.defaultLLM;
  }
  if (config.defaultEmbedding) {
    manager.registry.defaultEmbedding = config.defaultEmbedding;
  }
  
  return manager;
}
```

### Example Configuration

```typescript
const config: ModelManagerConfig = {
  models: [
    {
      id: 'gpt4',
      type: 'llm',
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4-turbo',
      temperature: 0.7,
      maxTokens: 4096
    },
    {
      id: 'gpt35',
      type: 'llm',
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2048
    },
    {
      id: 'embed-small',
      type: 'embedding',
      provider: 'openai',
      endpoint: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small'
    }
  ],
  defaultLLM: 'gpt4',
  defaultEmbedding: 'embed-small'
};

const manager = await initializeModelManager(config, bus);
```

## Error Handling

### API Errors

```typescript
async function* safeComplete(
  adapter: ProviderAdapter,
  instance: ModelInstance,
  messages: ChatMessage[],
  options: CompletionOptions
): AsyncGenerator<CompletionChunk> {
  try {
    yield* adapter.complete(instance, messages, options);
  } catch (error) {
    if (error.status === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (error.status === 401) {
      throw new Error('Invalid API key.');
    } else if (error.status === 400) {
      throw new Error(`Invalid request: ${error.message}`);
    } else {
      throw new Error(`Model invocation failed: ${error.message}`);
    }
  }
}
```

## Testing Strategy

### Unit Tests

```typescript
test('model:llm streams completion', async () => {
  const bus = createAgentBus();
  const manager = createModelManager(bus);
  
  // Register mock model
  await bus.invoke('model:register')(JSON.stringify({
    id: 'test-llm',
    type: 'llm',
    provider: 'openai',
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4',
    setAsDefault: true
  }));
  
  const stream = bus.invokeStream('model:llm')(JSON.stringify({
    messages: [{ role: 'user', content: 'Hello' }]
  }));
  
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(JSON.parse(chunk));
  }
  
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks[chunks.length - 1].finished).toBe(true);
});
```

## Summary

Model Manager provides:

✅ **Unified interface** to multiple LLM providers
✅ **Streaming support** for real-time completions
✅ **Provider adapters** for OpenAI, Anthropic, and custom APIs
✅ **Dynamic registration** of model instances
✅ **Default model** configuration
✅ **Token usage tracking** across all completions

As the ABI layer, Model Manager hides provider complexity and provides a consistent interface to all other modules.

