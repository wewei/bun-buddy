// Model Manager types

export type ModelType = 'llm' | 'embedding';

export type ModelProvider = 'openai' | 'anthropic' | 'custom';

export type ModelInstance = {
  id: string; // e.g., 'gpt4'
  type: ModelType;
  provider: ModelProvider;
  endpoint: string;
  model: string; // e.g., 'gpt-4-turbo'
  apiKey?: string; // optional, can use environment variable
  temperature?: number;
  maxTokens?: number;
  topP?: number;
};

export type ModelRegistry = {
  instances: Map<string, ModelInstance>;
  defaultLLM?: string;
  defaultEmbedding?: string;
};

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
    parameters: any; // JSON Schema
  };
};

export type CompletionOptions = {
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
};

export type EmbeddingResult = {
  embedding: number[];
  dimensions: number;
  usage: TokenUsage;
};

export type ProviderAdapter = {
  complete: (
    instance: ModelInstance,
    messages: ChatMessage[],
    options?: CompletionOptions
  ) => AsyncGenerator<CompletionChunk>;

  embed: (instance: ModelInstance, text: string) => Promise<EmbeddingResult>;
};

