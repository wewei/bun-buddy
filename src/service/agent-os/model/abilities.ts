// Model Manager Abilities

import { z } from 'zod';

import type { AgentBus, AbilityMeta, AbilityResult } from '../types';
import type {
  ProviderRegistry,
  ProviderConfig,
  ChatMessage,
  CompletionOptions,
  ToolCall,
  ProviderAdapter,
} from './types';

// Schema definitions
const MODEL_LLM_INPUT_SCHEMA = z.object({
  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant', 'tool']),
    content: z.string(),
  })).describe('Chat message history'),
  provider: z.string().describe('Provider name'),
  model: z.string().describe('Model name'),
  temperature: z.number().optional().describe('Temperature for this completion'),
  maxTokens: z.number().optional().describe('Max tokens for this completion'),
  topP: z.number().optional().describe('Top P for this completion'),
  streamToUser: z.boolean().optional().describe('Whether to stream output to user via shell:send'),
  tools: z.array(z.any()).optional().describe('Optional tool definitions'),
});

const MODEL_LLM_OUTPUT_SCHEMA = z.object({
  content: z.string(),
  toolCalls: z.array(z.any()).optional(),
  usage: z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
  }).optional(),
});

const MODEL_LIST_LLM_INPUT_SCHEMA = z.object({});

const MODEL_LIST_LLM_OUTPUT_SCHEMA = z.object({
  providers: z.array(z.object({
    providerName: z.string(),
    models: z.array(z.string()),
  })),
  total: z.number(),
});

const MODEL_LIST_EMBED_INPUT_SCHEMA = z.object({});

const MODEL_LIST_EMBED_OUTPUT_SCHEMA = z.object({
  providers: z.array(z.object({
    providerName: z.string(),
    models: z.array(z.string()),
  })),
  total: z.number(),
});

// Type inference from schemas
type ModelLLMInput = z.infer<typeof MODEL_LLM_INPUT_SCHEMA>;
type ModelLLMOutput = z.infer<typeof MODEL_LLM_OUTPUT_SCHEMA>;
type ModelListLLMInput = z.infer<typeof MODEL_LIST_LLM_INPUT_SCHEMA>;
type ModelListLLMOutput = z.infer<typeof MODEL_LIST_LLM_OUTPUT_SCHEMA>;
type ModelListEmbedInput = z.infer<typeof MODEL_LIST_EMBED_INPUT_SCHEMA>;
type ModelListEmbedOutput = z.infer<typeof MODEL_LIST_EMBED_OUTPUT_SCHEMA>;

// Meta definitions
const MODEL_LLM_META: AbilityMeta<ModelLLMInput, ModelLLMOutput> = {
  id: 'model:llm',
  moduleName: 'model',
  abilityName: 'llm',
  description: 'Invoke LLM for chat completion',
  inputSchema: MODEL_LLM_INPUT_SCHEMA,
  outputSchema: MODEL_LLM_OUTPUT_SCHEMA,
};

const MODEL_LIST_LLM_META: AbilityMeta<ModelListLLMInput, ModelListLLMOutput> = {
  id: 'model:listLLM',
  moduleName: 'model',
  abilityName: 'listLLM',
  description: 'List all LLM providers and available models',
  inputSchema: MODEL_LIST_LLM_INPUT_SCHEMA,
  outputSchema: MODEL_LIST_LLM_OUTPUT_SCHEMA,
};

const MODEL_LIST_EMBED_META: AbilityMeta<ModelListEmbedInput, ModelListEmbedOutput> = {
  id: 'model:listEmbed',
  moduleName: 'model',
  abilityName: 'listEmbed',
  description: 'List all embedding providers and available models',
  inputSchema: MODEL_LIST_EMBED_INPUT_SCHEMA,
  outputSchema: MODEL_LIST_EMBED_OUTPUT_SCHEMA,
};

const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const validateProviderAndModel = (
  provider: string,
  model: string,
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>
): { success: true; config: ProviderConfig; adapter: ProviderAdapter } | { success: false; error: string } => {
  const config = registry.get(provider);
  if (!config) {
    return { success: false, error: `Provider not found: ${provider}` };
  }

  const modelAvailable = config.models.some((m) => m.type === 'llm' && m.name === model);
  if (!modelAvailable) {
    return { success: false, error: `Model ${model} not available in provider ${provider}` };
  }

  const adapter = adapters.get(config.adapterType);
  if (!adapter) {
    return { success: false, error: `Adapter not found: ${config.adapterType}` };
  }

  return { success: true, config, adapter };
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
  input: ModelLLMInput,
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): Promise<AbilityResult<ModelLLMOutput, string>> => {
  const validation = validateProviderAndModel(input.provider, input.model, registry, adapters);
  if (!validation.success) {
    return { type: 'error', error: validation.error };
  }

  const { config, adapter } = validation;

  const options: CompletionOptions = {
    tools: input.tools,
    temperature: input.temperature,
    maxTokens: input.maxTokens,
    topP: input.topP,
  };

  if (input.streamToUser) {
    const result = await handleStreamCompletion(taskId, adapter, config, input.model, input.messages, options, bus);
    return { type: 'success', result: JSON.parse(result) };
  } else {
    const result = await adapter.completeNonStream(config, input.model, input.messages, options);
    return { type: 'success', result };
  }
};

const registerLLMAbility = (
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): void => {
  bus.register(MODEL_LLM_META, async (taskId, input) =>
    handleLLMInvoke(taskId, input, registry, adapters, bus)
  );
};

const handleListLLMInvoke = async (
  _taskId: string,
  _input: ModelListLLMInput,
  registry: ProviderRegistry
): Promise<AbilityResult<ModelListLLMOutput, string>> => {
  const providers = Array.from(registry.entries())
    .map(([providerName, config]) => ({
      providerName,
      models: config.models
        .filter((m) => m.type === 'llm')
        .map((m) => m.name),
    }))
    .filter((p) => p.models.length > 0);

  return {
    type: 'success',
    result: { providers, total: providers.length }
  };
};

const registerListLLMAbility = (registry: ProviderRegistry, bus: AgentBus): void => {
  bus.register(MODEL_LIST_LLM_META, async (taskId, input) =>
    handleListLLMInvoke(taskId, input, registry)
  );
};

const handleListEmbedInvoke = async (
  _taskId: string,
  _input: ModelListEmbedInput,
  registry: ProviderRegistry
): Promise<AbilityResult<ModelListEmbedOutput, string>> => {
  const providers = Array.from(registry.entries())
    .map(([providerName, config]) => ({
      providerName,
      models: config.models
        .filter((m) => m.type === 'embed')
        .map((m) => m.name),
    }))
    .filter((p) => p.models.length > 0);

  return {
    type: 'success',
    result: { providers, total: providers.length }
  };
};

const registerListEmbedAbility = (registry: ProviderRegistry, bus: AgentBus): void => {
  bus.register(MODEL_LIST_EMBED_META, async (taskId, input) =>
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
