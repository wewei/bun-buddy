// Model Manager Abilities

import type { AgentBus, AbilityMeta } from '../types';
import type { ModelRegistry, ChatMessage, CompletionOptions, ToolCall } from './types';
import type { ProviderAdapter } from './types';

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
    tools: {
      type: 'array',
      items: { type: 'object' },
      description: 'Optional tool definitions',
    },
    modelId: {
      type: 'string',
      description: 'Optional model instance ID (uses default if omitted)',
    },
    temperature: {
      type: 'number',
      description: 'Override temperature',
    },
    maxTokens: {
      type: 'number',
      description: 'Override max tokens',
    },
  },
  required: ['messages'],
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
  tools?: CompletionOptions['tools'];
  modelId?: string;
  temperature?: number;
  maxTokens?: number;
};

const handleLLMInvoke = async (
  input: string,
  registry: ModelRegistry,
  adapters: Map<string, ProviderAdapter>
): Promise<string> => {
  const { messages, tools, modelId, temperature, maxTokens } = JSON.parse(input) as LLMInput;

  const instanceId = modelId || registry.defaultLLM;
  if (!instanceId) {
    throw new Error('No model instance specified and no default LLM configured');
  }

  const instance = registry.instances.get(instanceId);
  if (!instance) {
    throw new Error(`Model instance not found: ${instanceId}`);
  }

  const adapter = adapters.get(instance.provider);
  if (!adapter) {
    throw new Error(`Provider adapter not found: ${instance.provider}`);
  }

  let fullContent = '';
  let finalToolCalls: ToolCall[] | undefined;
  let finalUsage: unknown;

  const options: CompletionOptions = {
    tools,
    temperature,
    maxTokens,
  };

  for await (const chunk of adapter.complete(instance, messages, options)) {
    if (chunk.content) {
      fullContent += chunk.content;
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

const registerLLMAbility = (
  registry: ModelRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): void => {
  bus.register(createLLMMeta(), async (input: string) =>
    handleLLMInvoke(input, registry, adapters)
  );
};

const createListMeta = (): AbilityMeta => ({
  id: 'model:list',
  moduleName: 'model',
  abilityName: 'list',
  description: 'List all registered model instances',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['llm', 'embedding'],
        description: 'Filter by model type',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      models: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: { type: 'string' },
            provider: { type: 'string' },
            model: { type: 'string' },
            isDefault: { type: 'boolean' },
          },
        },
      },
      total: { type: 'number' },
    },
    required: ['models', 'total'],
  },
});

const handleListInvoke = async (input: string, registry: ModelRegistry): Promise<string> => {
  const { type } = JSON.parse(input) as { type?: string };

  const models = Array.from(registry.instances.values())
    .filter((m) => !type || m.type === type)
    .map((m) => ({
      id: m.id,
      type: m.type,
      provider: m.provider,
      model: m.model,
      isDefault: m.id === registry.defaultLLM || m.id === registry.defaultEmbedding,
    }));

  return JSON.stringify({ models, total: models.length });
};

const registerListAbility = (registry: ModelRegistry, bus: AgentBus): void => {
  bus.register(createListMeta(), async (input: string) => handleListInvoke(input, registry));
};

const createRegisterMeta = (): AbilityMeta => ({
  id: 'model:register',
  moduleName: 'model',
  abilityName: 'register',
  description: 'Register a new model instance',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      type: { type: 'string', enum: ['llm', 'embedding'] },
      provider: { type: 'string' },
      endpoint: { type: 'string' },
      model: { type: 'string' },
      apiKey: { type: 'string' },
      temperature: { type: 'number' },
      maxTokens: { type: 'number' },
      setAsDefault: { type: 'boolean' },
    },
    required: ['id', 'type', 'provider', 'endpoint', 'model'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      modelId: { type: 'string' },
    },
    required: ['success', 'modelId'],
  },
});

const handleRegisterInvoke = async (input: string, registry: ModelRegistry): Promise<string> => {
  const data = JSON.parse(input);
  const { id, type, provider, endpoint, model, apiKey, temperature, maxTokens, setAsDefault } =
    data;

  if (registry.instances.has(id)) {
    throw new Error(`Model instance already exists: ${id}`);
  }

  registry.instances.set(id, {
    id,
    type,
    provider,
    endpoint,
    model,
    apiKey,
    temperature,
    maxTokens,
  });

  if (setAsDefault) {
    if (type === 'llm') {
      registry.defaultLLM = id;
    } else {
      registry.defaultEmbedding = id;
    }
  }

  return JSON.stringify({ success: true, modelId: id });
};

const registerRegisterAbility = (registry: ModelRegistry, bus: AgentBus): void => {
  bus.register(createRegisterMeta(), async (input: string) =>
    handleRegisterInvoke(input, registry)
  );
};

export const registerModelAbilities = (
  registry: ModelRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): void => {
  registerLLMAbility(registry, adapters, bus);
  registerListAbility(registry, bus);
  registerRegisterAbility(registry, bus);
};
