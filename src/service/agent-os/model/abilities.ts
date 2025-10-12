// Model Manager Abilities

import { z } from 'zod';

import type { AgentBus, AbilityMeta, AbilityResult } from '../types';
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

const llmInputSchema = z.object({
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

const llmOutputSchema = z.object({
  content: z.string(),
  toolCalls: z.array(z.any()).optional(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }).optional(),
});

const createLLMMeta = (): AbilityMeta => ({
  id: 'model:llm',
  moduleName: 'model',
  abilityName: 'llm',
  description: 'Invoke LLM for chat completion',
  inputSchema: llmInputSchema,
  outputSchema: llmOutputSchema,
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
  input: string,
  registry: ProviderRegistry,
  adapters: Map<string, ProviderAdapter>,
  bus: AgentBus
): Promise<AbilityResult<string, string>> => {
  try {
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

    const validation = validateProviderAndModel(provider, model, registry, adapters);
    if (!validation.success) {
      return { type: 'error', error: validation.error };
    }

    const { config, adapter } = validation;

    const options: CompletionOptions = {
      tools,
      temperature,
      maxTokens,
      topP,
    };

    let result: string;
    if (streamToUser) {
      result = await handleStreamCompletion(taskId, adapter, config, model, messages, options, bus);
    } else {
      const completionResult = await adapter.completeNonStream(config, model, messages, options);
      result = JSON.stringify(completionResult);
    }

    return { type: 'success', result };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
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

const listLLMInputSchema = z.object({});

const listLLMOutputSchema = z.object({
  providers: z.array(z.object({
    providerName: z.string(),
    models: z.array(z.string()),
  })),
  total: z.number(),
});

const createListLLMMeta = (): AbilityMeta => ({
  id: 'model:listLLM',
  moduleName: 'model',
  abilityName: 'listLLM',
  description: 'List all LLM providers and available models',
  inputSchema: listLLMInputSchema,
  outputSchema: listLLMOutputSchema,
});

const handleListLLMInvoke = async (
  _taskId: string,
  _input: string,
  registry: ProviderRegistry
): Promise<AbilityResult<string, string>> => {
  try {
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
      result: JSON.stringify({ providers, total: providers.length })
    };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const registerListLLMAbility = (registry: ProviderRegistry, bus: AgentBus): void => {
  bus.register(createListLLMMeta(), async (taskId: string, input: string) =>
    handleListLLMInvoke(taskId, input, registry)
  );
};

// ============================================================================
// model:listEmbed - List embedding providers and models
// ============================================================================

const listEmbedInputSchema = z.object({});

const listEmbedOutputSchema = z.object({
  providers: z.array(z.object({
    providerName: z.string(),
    models: z.array(z.string()),
  })),
  total: z.number(),
});

const createListEmbedMeta = (): AbilityMeta => ({
  id: 'model:listEmbed',
  moduleName: 'model',
  abilityName: 'listEmbed',
  description: 'List all embedding providers and available models',
  inputSchema: listEmbedInputSchema,
  outputSchema: listEmbedOutputSchema,
});

const handleListEmbedInvoke = async (
  _taskId: string,
  _input: string,
  registry: ProviderRegistry
): Promise<AbilityResult<string, string>> => {
  try {
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
      result: JSON.stringify({ providers, total: providers.length })
    };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
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
