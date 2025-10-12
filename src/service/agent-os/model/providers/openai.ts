// OpenAI Provider Adapter

import OpenAI from 'openai';

import type {
  ProviderAdapter,
  ModelInstance,
  ChatMessage,
  CompletionOptions,
  CompletionChunk,
  EmbeddingResult,
  ToolCall,
} from '../types';

type IncomingToolCall = {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

const mergeToolCalls = (existing: ToolCall[], incoming: IncomingToolCall[]): ToolCall[] => {
  const merged = [...existing];

  for (const incomingCall of incoming) {
    const existingIndex = merged.findIndex((c) => c.id === incomingCall.id);

    if (existingIndex >= 0) {
      // Merge with existing
      const existingCall = merged[existingIndex];
      if (existingCall) {
        merged[existingIndex] = {
          id: existingCall.id,
          type: 'function',
          function: {
            name: existingCall.function.name || incomingCall.function?.name || '',
            arguments:
              (existingCall.function.arguments || '') + (incomingCall.function?.arguments || ''),
          },
        };
      }
    } else {
      // Add new
      merged.push({
        id: incomingCall.id || '',
        type: 'function',
        function: {
          name: incomingCall.function?.name || '',
          arguments: incomingCall.function?.arguments || '',
        },
      });
    }
  }

  return merged;
};

const createOpenAIClient = (instance: ModelInstance): OpenAI => {
  return new OpenAI({
    baseURL: instance.endpoint,
    apiKey: instance.apiKey || process.env.OPENAI_API_KEY,
  });
};

const streamOpenAICompletion = async (
  client: OpenAI,
  instance: ModelInstance,
  messages: ChatMessage[],
  options: CompletionOptions
) => {
  return await client.chat.completions.create({
    model: instance.model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: options.tools as OpenAI.Chat.ChatCompletionTool[],
    temperature: options.temperature ?? instance.temperature,
    max_tokens: options.maxTokens ?? instance.maxTokens,
    stream: true,
  });
};

const processStreamChunk = (
  chunk: OpenAI.Chat.Completions.ChatCompletionChunk,
  accumulatedToolCalls: ToolCall[]
): { updatedToolCalls: ToolCall[]; completionChunk?: CompletionChunk } => {
  const delta = chunk.choices[0]?.delta;
  let updatedToolCalls = accumulatedToolCalls;

  if (delta?.tool_calls) {
    updatedToolCalls = mergeToolCalls(accumulatedToolCalls, delta.tool_calls);
  }

  if (delta?.content) {
    return {
      updatedToolCalls,
      completionChunk: {
        content: delta.content,
        finished: false,
      },
    };
  }

  if (chunk.choices[0]?.finish_reason) {
    return {
      updatedToolCalls,
      completionChunk: {
        content: '',
        toolCalls: updatedToolCalls.length > 0 ? updatedToolCalls : undefined,
        finished: true,
        usage: chunk.usage
          ? {
              promptTokens: chunk.usage.prompt_tokens,
              completionTokens: chunk.usage.completion_tokens,
              totalTokens: chunk.usage.total_tokens,
            }
          : undefined,
      },
    };
  }

  return { updatedToolCalls };
};

export const createOpenAIAdapter = (): ProviderAdapter => ({
  complete: async function* (
    instance: ModelInstance,
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<CompletionChunk> {
    const client = createOpenAIClient(instance);
    const stream = await streamOpenAICompletion(client, instance, messages, options);

    let accumulatedToolCalls: ToolCall[] = [];

    for await (const chunk of stream) {
      const result = processStreamChunk(chunk, accumulatedToolCalls);
      accumulatedToolCalls = result.updatedToolCalls;

      if (result.completionChunk) {
        yield result.completionChunk;
      }
    }
  },

  embed: async (instance: ModelInstance, text: string): Promise<EmbeddingResult> => {
    const client = createOpenAIClient(instance);

    const response = await client.embeddings.create({
      model: instance.model,
      input: text,
    });

    const embeddingData = response.data[0];
    if (!embeddingData || !response.usage) {
      throw new Error('Invalid embedding response from OpenAI');
    }

    return {
      embedding: embeddingData.embedding,
      dimensions: embeddingData.embedding.length,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  },
});
