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

const mergeToolCalls = (existing: ToolCall[], incoming: any[]): ToolCall[] => {
  const merged = [...existing];

  for (const incomingCall of incoming) {
    const existingIndex = merged.findIndex((c) => c.id === incomingCall.id);

    if (existingIndex >= 0) {
      // Merge with existing
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        function: {
          name: existing.function.name || incomingCall.function?.name || '',
          arguments:
            (existing.function.arguments || '') + (incomingCall.function?.arguments || ''),
        },
      };
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

export const createOpenAIAdapter = (): ProviderAdapter => ({
  complete: async function* (
    instance: ModelInstance,
    messages: ChatMessage[],
    options: CompletionOptions = {}
  ): AsyncGenerator<CompletionChunk> {
    const client = new OpenAI({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.OPENAI_API_KEY,
    });

    const stream = await client.chat.completions.create({
      model: instance.model,
      messages: messages as any,
      tools: options.tools as any,
      temperature: options.temperature ?? instance.temperature,
      max_tokens: options.maxTokens ?? instance.maxTokens,
      stream: true,
    });

    let accumulatedToolCalls: ToolCall[] = [];

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield {
          content: delta.content,
          finished: false,
        };
      }

      if (delta?.tool_calls) {
        accumulatedToolCalls = mergeToolCalls(accumulatedToolCalls, delta.tool_calls);
      }

      if (chunk.choices[0]?.finish_reason) {
        yield {
          content: '',
          toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
          finished: true,
          usage: chunk.usage
            ? {
                promptTokens: chunk.usage.prompt_tokens,
                completionTokens: chunk.usage.completion_tokens,
                totalTokens: chunk.usage.total_tokens,
              }
            : undefined,
        };
      }
    }
  },

  embed: async (instance: ModelInstance, text: string): Promise<EmbeddingResult> => {
    const client = new OpenAI({
      baseURL: instance.endpoint,
      apiKey: instance.apiKey || process.env.OPENAI_API_KEY,
    });

    const response = await client.embeddings.create({
      model: instance.model,
      input: text,
    });

    return {
      embedding: response.data[0].embedding,
      dimensions: response.data[0].embedding.length,
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  },
});

