// Model Manager Abilities

import type { AgentBus, AbilityMeta } from '../types';
import type {
  ProviderRegistry,
  ProviderConfig,
  ChatMessage,
  CompletionOptions,
  ToolCall,
  ToolDefinition,
  ProviderAdapter,
} from './types';

// ============================================================================
// model:llm - LLM completion ability
// ============================================================================

const LLM_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          role: { type: 'string', enum: ['system', 'user', 'assistant', 'tool'] },
          content: { type: 'string' },
        },
      },
      description: 'Chat message history',
    },
    provider: {
      type: 'string',
      description: 'Provider name',
    },
    model: {
      type: 'string',
      description: 'Model name',
    },
    temperature: {
      type: 'number',
      description: 'Temperature for this completion',
    },
    maxTokens: {
      type: 'number',
      description: 'Max tokens for this completion',
    },
    topP: {
      type: 'number',
      description: 'Top P for this completion',
    },
    streamToUser: {
      type: 'boolean',
      description: 'Whether to stream output to user via shell:send',
    },
    tools: {
      type: 'array',
      items: { type: 'object' },
      description: 'Optional tool definitions',
    },
  },
  required: ['messages', 'provider', 'model'],
};

const LLM_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    content: { type: 'string' },
    toolCalls: {
      type: 'array',
      items: { type: 'object' },
    },
    usage: {
      type: 'object',
      properties: {
        promptTokens: { type: 'number' },
        completionTokens: { type: 'number' },
        totalTokens: { type: 'number' },
      },
    },
  },
  required: ['content'],
};

const createLLMMeta = (): AbilityMeta => ({
  id: 'model:llm',
  moduleName: 'model',
  abilityName: 'llm',
  description: 'Invoke LLM for chat completion',
  inputSchema: LLM_INPUT_SCHEMA,
  outputSchema: LLM_OUTPUT_SCHEMA,
});

type LLMInput = {
  messages: ChatMessage[];
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  streamToUser?: boolean;
  tools?: ToolDefinition[];
};

const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const validateProviderAndModel = (
  provider: string,
  model: string,
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>
): { config: ProviderConfig; adapter: ProviderAdapter } => {
  const config = registry.get(provider);
  if (!config) {
    throw new Error(`Provider not found: ${provider}`);
  }

  const modelAvailable = config.models.some((m) => m.type === 'llm' && m.name === model);
  if (!modelAvailable) {
    throw new Error(`Model ${model} not available in provider ${provider}`);
  }

  const adapter = adapters.get(config.adapterType);
  if (!adapter) {
    throw new Error(`Adapter not found: ${config.adapterType}`);
  }

  return { config, adapter };
};

const handleStreamCompletion = async (
  taskId: string,
  adapter: ProviderAdapter,
  config: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions,
  bus: AgentBus
): Promise<string> => {
  let fullContent = '';
  let finalToolCalls: ToolCall[] | undefined;
  let finalUsage: unknown;
  const messageId = generateMessageId();
  let chunkIndex = 0;

  for await (const chunk of adapter.completeStream(config, model, messages, options)) {
    if (chunk.content) {
      fullContent += chunk.content;
      await bus.invoke(
        'shell:send',
        taskId,
        JSON.stringify({
          content: chunk.content,
          messageId,
          index: chunk.finished ? -1 : chunkIndex++,
        })
      );
    }
    if (chunk.toolCalls) {
      finalToolCalls = chunk.toolCalls;
    }
    if (chunk.usage) {
      finalUsage = chunk.usage;
    }
  }

  return JSON.stringify({
    content: fullContent,
    toolCalls: finalToolCalls,
    usage: finalUsage,
  });
};

const handleLLMInvoke = async (
  taskId: string,
  input: string,
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): Promise<string> => {
  const {
    messages,
    provider,
    model,
    temperature,
    maxTokens,
    topP,
    streamToUser,
    tools,
  } = JSON.parse(input) as LLMInput;

  const { config, adapter } = validateProviderAndModel(provider, model, registry, adapters);

  const options: CompletionOptions = {
    tools,
    temperature,
    maxTokens,
    topP,
  };

  if (streamToUser) {
    return handleStreamCompletion(taskId, adapter, config, model, messages, options, bus);
  } else {
    const result = await adapter.completeNonStream(config, model, messages, options);
    return JSON.stringify(result);
  }
};

const registerLLMAbility = (
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): void => {
  bus.register(createLLMMeta(), async (taskId: string, input: string) =>
    handleLLMInvoke(taskId, input, registry, adapters, bus)
  );
};

// ============================================================================
// model:listLLM - List LLM providers and models
// ============================================================================

const createListLLMMeta = (): AbilityMeta => ({
  id: 'model:listLLM',
  moduleName: 'model',
  abilityName: 'listLLM',
  description: 'List all LLM providers and available models',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  outputSchema: {
    type: 'object',
    properties: {
      providers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            providerName: { type: 'string' },
            models: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
      total: { type: 'number' },
    },
    required: ['providers', 'total'],
  },
});

const handleListLLMInvoke = async (
  _taskId: string,
  _input: string,
  registry: ProviderRegistry
): Promise<string> => {
  const providers = Array.from(registry.entries())
    .map(([providerName, config]) => ({
      providerName,
      models: config.models
        .filter((m) => m.type === 'llm')
        .map((m) => m.name),
    }))
    .filter((p) => p.models.length > 0);

  return JSON.stringify({ providers, total: providers.length });
};

const registerListLLMAbility = (registry: ProviderRegistry, bus: AgentBus): void => {
  bus.register(createListLLMMeta(), async (taskId: string, input: string) =>
    handleListLLMInvoke(taskId, input, registry)
  );
};

// ============================================================================
// model:listEmbed - List embedding providers and models
// ============================================================================

const createListEmbedMeta = (): AbilityMeta => ({
  id: 'model:listEmbed',
  moduleName: 'model',
  abilityName: 'listEmbed',
  description: 'List all embedding providers and available models',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  outputSchema: {
    type: 'object',
    properties: {
      providers: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            providerName: { type: 'string' },
            models: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
      total: { type: 'number' },
    },
    required: ['providers', 'total'],
  },
});

const handleListEmbedInvoke = async (
  _taskId: string,
  _input: string,
  registry: ProviderRegistry
): Promise<string> => {
  const providers = Array.from(registry.entries())
    .map(([providerName, config]) => ({
      providerName,
      models: config.models
        .filter((m) => m.type === 'embed')
        .map((m) => m.name),
    }))
    .filter((p) => p.models.length > 0);

  return JSON.stringify({ providers, total: providers.length });
};

const registerListEmbedAbility = (registry: ProviderRegistry, bus: AgentBus): void => {
  bus.register(createListEmbedMeta(), async (taskId: string, input: string) =>
    handleListEmbedInvoke(taskId, input, registry)
  );
};

// ============================================================================
// Register all model abilities
// ============================================================================

export const registerModelAbilities = (
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): void => {
  registerLLMAbility(registry, adapters, bus);
  registerListLLMAbility(registry, bus);
  registerListEmbedAbility(registry, bus);
};
