# Agent OS - Model Manager

## 概述

**Model Manager** 是 Agent OS 的 ABI（应用程序二进制接口）层。就像操作系统通过设备驱动程序抽象硬件一样，Model Manager 为不同的 LLM 提供商（OpenAI、Anthropic 等）和嵌入模型提供统一接口。

Model Manager 位于 **Agent Bus 之下**：它注册模型调用的能力，同时隐藏提供商特定的细节。

## 核心概念

### 模型实例

**模型实例**表示与特定模型的配置连接：

```typescript
type ModelInstance = {
  id: string;                           // 唯一标识符（例如 'gpt4'）
  type: 'llm' | 'embedding';
  provider: 'openai' | 'anthropic' | 'custom';
  endpoint: string;                     // API 端点 URL
  model: string;                        // 模型名称（例如 'gpt-4-turbo'）
  apiKey?: string;                      // API 密钥（可选，可以使用环境变量）
  
  // 模型特定配置
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};
```

### 模型注册表

所有模型实例都在中央注册表中注册：

```typescript
type ModelRegistry = {
  instances: Map<string, ModelInstance>;
  defaultLLM?: string;                  // 默认 LLM 实例 ID
  defaultEmbedding?: string;            // 默认嵌入实例 ID
};
```

## 注册的能力

Model Manager 在 Agent Bus 上注册以下能力：

### model:llm

**描述**：调用 LLM 进行聊天完成（流式）。

**输入模式**：
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
      "description": "聊天消息历史"
    },
    "tools": {
      "type": "array",
      "items": { "type": "object" },
      "description": "可选的工具定义"
    },
    "modelId": {
      "type": "string",
      "description": "可选的模型实例 ID（如果省略则使用默认值）"
    },
    "temperature": {
      "type": "number",
      "description": "覆盖温度"
    },
    "maxTokens": {
      "type": "number",
      "description": "覆盖最大令牌数"
    }
  },
  "required": ["messages"]
}
```

**输出**：完成块流（JSON 字符串）。

**块模式**：
```json
{
  "type": "object",
  "properties": {
    "content": {
      "type": "string",
      "description": "文本内容增量"
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
      "description": "如果这是最后一个块则为 true"
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

**示例**：
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

**使用工具**：
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

**描述**：为文本生成嵌入。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "text": {
      "type": "string",
      "description": "要嵌入的文本"
    },
    "modelId": {
      "type": "string",
      "description": "可选的嵌入模型实例 ID"
    }
  },
  "required": ["text"]
}
```

**输出模式**：
```json
{
  "type": "object",
  "properties": {
    "embedding": {
      "type": "array",
      "items": { "type": "number" },
      "description": "向量嵌入"
    },
    "dimensions": {
      "type": "number",
      "description": "维度数量"
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

**示例**：
```typescript
const result = await bus.invoke('model:embed')(JSON.stringify({
  text: 'Agent OS is a bus-based architecture'
}));

const { embedding, dimensions } = JSON.parse(result);
console.log(`Generated ${dimensions}-dimensional embedding`);
// embedding: [0.123, -0.456, 0.789, ...]
```

### model:list

**描述**：列出所有已注册的模型实例。

**输入模式**：
```json
{
  "type": "object",
  "properties": {
    "type": {
      "type": "string",
      "enum": ["llm", "embedding"],
      "description": "按模型类型过滤"
    }
  }
}
```

**输出模式**：
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

**示例**：
```typescript
const result = await bus.invoke('model:list')(JSON.stringify({
  type: 'llm'
}));

const { models } = JSON.parse(result);
models.forEach(m => {
  console.log(`${m.id}: ${m.provider}/${m.model} ${m.isDefault ? '(default)' : ''}`);
});

// 输出：
// gpt4: openai/gpt-4-turbo (default)
// claude: anthropic/claude-3-sonnet
```

### model:register

**描述**：动态注册新的模型实例。

**输入模式**：
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

**输出模式**：
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

**示例**：
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

## 提供商适配器

Model Manager 使用**提供商适配器**来规范化不同的 API 格式：

### 适配器接口

```typescript
type ProviderAdapter = {
  // LLM 完成（流式）
  complete: (
    instance: ModelInstance,
    messages: ChatMessage[],
    options?: CompletionOptions
  ) => AsyncGenerator<CompletionChunk>;
  
  // 嵌入生成
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

### OpenAI 适配器

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
        // 累积工具调用（OpenAI 以增量方式流式传输它们）
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

### Anthropic 适配器

```typescript
const createAnthropicAdapter = (): ProviderAdapter => ({
  complete: async function* (instance, messages, options = {}) {
    const client = new Anthropic({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.ANTHROPIC_API_KEY
    });
    
    // 将消息转换为 Anthropic 格式
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

### 自定义适配器

对于自定义 API 端点：

```typescript
const createCustomAdapter = (): ProviderAdapter => ({
  complete: async function* (instance, messages, options = {}) {
    // 自定义实现
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
      // 解析并产出块...
    }
  },
  
  embed: async (instance, text) => {
    // 自定义嵌入实现
  }
});
```

## 适配器注册表

将提供商名称映射到适配器：

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

## Model Manager 实现

### 核心结构

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
  
  // 注册能力
  registerModelAbilities(manager, bus);
  
  return manager;
};
```

### 能力实现

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
      
      // 获取模型实例
      const instanceId = modelId || manager.registry.defaultLLM;
      const instance = manager.registry.instances.get(instanceId!);
      if (!instance) {
        throw new Error(`Model instance not found: ${instanceId}`);
      }
      
      // 获取适配器
      const adapter = manager.adapters.get(instance.provider);
      if (!adapter) {
        throw new Error(`Provider adapter not found: ${instance.provider}`);
      }
      
      // 流式完成
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

## 配置

### 初始化

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
  
  // 注册模型实例
  for (const model of config.models) {
    await bus.invoke('model:register')(JSON.stringify(model));
  }
  
  // 设置默认值
  if (config.defaultLLM) {
    manager.registry.defaultLLM = config.defaultLLM;
  }
  if (config.defaultEmbedding) {
    manager.registry.defaultEmbedding = config.defaultEmbedding;
  }
  
  return manager;
}
```

### 示例配置

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

## 错误处理

### API 错误

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

## 测试策略

### 单元测试

```typescript
test('model:llm streams completion', async () => {
  const bus = createAgentBus();
  const manager = createModelManager(bus);
  
  // 注册模拟模型
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

## 总结

Model Manager 提供：

✅ **统一接口** 到多个 LLM 提供商
✅ **流式支持** 用于实时完成
✅ **提供商适配器** 用于 OpenAI、Anthropic 和自定义 API
✅ **动态注册** 模型实例
✅ **默认模型** 配置
✅ **令牌使用跟踪** 跨所有完成

作为 ABI 层，Model Manager 隐藏提供商复杂性，并为所有其他模块提供一致的接口。

