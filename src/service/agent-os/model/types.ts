// Model Manager types

export type ModelType = 'llm' | 'embed';

export type AdapterType = 'openai' | 'anthropic' | 'custom';

export type ProviderConfig = {
  endpoint: string; // API endpoint URL
  apiKey: string;
  adapterType: AdapterType;
  models: Array<{
    type: ModelType;
    name: string;
  }>;
};

export type ProviderRegistry = Map<string, ProviderConfig>; // key = provider name

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

export type CompletionChunk = {
  content: string;
  toolCalls?: ToolCall[];
  finished: boolean;
  usage?: TokenUsage;
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens?: number;
  totalTokens: number;
};

export type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>; // JSON Schema
  };
};

export type CompletionOptions = {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

export type EmbeddingResult = {
  embedding: number[];
  dimensions: number;
  usage: TokenUsage;
};

export type CompletionResult = {
  content: string;
  toolCalls?: ToolCall[];
  usage?: TokenUsage;
};

export type ProviderAdapter = {
  completeStream: (
    config: ProviderConfig,
    model: string,
    messages: ChatMessage[],
    options?: CompletionOptions
  ) => AsyncGenerator<CompletionChunk>;

  completeNonStream: (
    config: ProviderConfig,
    model: string,
    messages: ChatMessage[],
    options?: CompletionOptions
  ) => Promise<CompletionResult>;

  embed: (
    config: ProviderConfig,
    model: string,
    text: string
  ) => Promise<EmbeddingResult>;
};

