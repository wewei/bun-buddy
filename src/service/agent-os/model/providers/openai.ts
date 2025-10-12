// OpenAI Provider Adapter

import OpenAI from 'openai';

import type {
  ProviderAdapter,
  ProviderConfig,
  ChatMessage,
  CompletionOptions,
  CompletionChunk,
  CompletionResult,
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

const createOpenAIClient = (config: ProviderConfig): OpenAI => {
  return new OpenAI({
    baseURL: config.endpoint,
    apiKey: config.apiKey || process.env.OPENAI_API_KEY,
  });
};

const streamOpenAICompletion = async (
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions
) => {
  return await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: options.tools as OpenAI.Chat.ChatCompletionTool[],
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    top_p: options.topP,
    stream: true,
  });
};

const nonStreamOpenAICompletion = async (
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions
) => {
  return await client.chat.completions.create({
    model,
    messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
    tools: options.tools as OpenAI.Chat.ChatCompletionTool[],
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    top_p: options.topP,
    stream: false,
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

const completeStreamImpl = async function* (
  config: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions = {}
): AsyncGenerator<CompletionChunk> {
  const client = createOpenAIClient(config);
  const stream = await streamOpenAICompletion(client, model, messages, options);

  let accumulatedToolCalls: ToolCall[] = [];

  for await (const chunk of stream) {
    const result = processStreamChunk(chunk, accumulatedToolCalls);
    accumulatedToolCalls = result.updatedToolCalls;

    if (result.completionChunk) {
      yield result.completionChunk;
    }
  }
};

const convertToolCalls = (toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[]): ToolCall[] => {
  return toolCalls.map((tc) => {
    if (tc.type !== 'function') {
      throw new Error(`Unsupported tool call type: ${tc.type}`);
    }
    return {
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    };
  });
};

const completeNonStreamImpl = async (
  config: ProviderConfig,
  model: string,
  messages: ChatMessage[],
  options: CompletionOptions = {}
): Promise<CompletionResult> => {
  const client = createOpenAIClient(config);
  const response = await nonStreamOpenAICompletion(client, model, messages, options);

  const choice = response.choices[0];
  if (!choice) {
    throw new Error('No response from OpenAI');
  }

  const toolCalls = choice.message.tool_calls ? convertToolCalls(choice.message.tool_calls) : undefined;

  return {
    content: choice.message.content || '',
    toolCalls,
    usage: response.usage
      ? {
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
        }
      : undefined,
  };
};

const embedImpl = async (
  config: ProviderConfig,
  model: string,
  text: string
): Promise<EmbeddingResult> => {
  const client = createOpenAIClient(config);

  const response = await client.embeddings.create({
    model,
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
};

export const createOpenAIAdapter = (): ProviderAdapter => ({
  completeStream: completeStreamImpl,
  completeNonStream: completeNonStreamImpl,
  embed: embedImpl,
});
