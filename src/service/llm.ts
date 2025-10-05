import OpenAI from 'openai';
import { randomUUID } from 'crypto';

// 基础类型定义
export type ChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type CompletionChunk = {
  trackingId: string;
  content: string;
  finished: boolean;
  error?: string;
};

export type LLMConfig = {
  endpoint: {
    url: string;
    key: string;
    model: string;
  };
  temperature?: number;
  maxTokens?: number;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  stream?: boolean;
};

// 配置工厂函数
export const createLLMConfig = (config: Partial<LLMConfig> & { endpoint: LLMConfig['endpoint'] }): LLMConfig => ({
  temperature: 0.7,
  maxTokens: 2000,
  stream: true,
  ...config
});

// 验证配置
export const validateLLMConfig = (config: LLMConfig): void => {
  if (!config.endpoint.url) {
    throw new Error('LLM endpoint URL is required');
  }
  if (!config.endpoint.key) {
    throw new Error('LLM API key is required');
  }
  if (!config.endpoint.model) {
    throw new Error('LLM model is required');
  }
};

// 创建 OpenAI 客户端
export const createOpenAIClient = (config: LLMConfig): OpenAI => {
  validateLLMConfig(config);
  return new OpenAI({
    apiKey: config.endpoint.key,
    baseURL: config.endpoint.url
  });
};

// 转换消息格式
export const convertToOpenAIMessages = (messages: ChatMessage[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] =>
  messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));

// 生成追踪 ID
export const generateTrackingId = (): string => randomUUID();

// 创建完成块
export const createCompletionChunk = (
  trackingId: string,
  content: string,
  finished: boolean = false,
  error?: string
): CompletionChunk => ({
  trackingId,
  content,
  finished,
  ...(error && { error })
});

// 主 LLM 流式请求函数
export const streamLLMCompletion = async function* (
  config: LLMConfig,
  messages: ChatMessage[],
  trackingId?: string
): AsyncGenerator<CompletionChunk, void, unknown> {
  const id = trackingId || generateTrackingId();
  const client = createOpenAIClient(config);
  const openaiMessages = convertToOpenAIMessages(messages);

  try {
    console.log(`🤖 Starting LLM completion request with tracking ID: ${id}`);

    const stream = await client.chat.completions.create({
      model: config.endpoint.model,
      messages: openaiMessages,
      stream: config.stream ?? true,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
      ...(config.tools && { tools: config.tools })
    }) as AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      const content = delta?.content;
      
      if (content) {
        yield createCompletionChunk(id, content, false);
      }
    }

    // 发送完成信号
    yield createCompletionChunk(id, '', true);
    
  } catch (error) {
    console.error(`🤖 LLM completion error (${id}):`, error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    yield createCompletionChunk(id, '', true, errorMessage);
  }
};

// 辅助函数：从配置创建 LLM 配置
export const createLLMConfigFromEndpoint = (
  endpoint: { url: string; key: string; model: string },
  options?: Partial<LLMConfig>
): LLMConfig => createLLMConfig({
  endpoint,
  ...options
});

// 辅助函数：处理流式响应的回调
export const withCallback = async function* (
  stream: AsyncGenerator<CompletionChunk, void, unknown>,
  onChunk?: (chunk: CompletionChunk) => void
): AsyncGenerator<CompletionChunk, void, unknown> {
  for await (const chunk of stream) {
    if (onChunk) {
      onChunk(chunk);
    }
    yield chunk;
  }
};


/*
使用示例：

// 1. 基本用法
const config = createLLMConfig({
  endpoint: {
    url: 'https://api.openai.com/v1',
    key: 'your-api-key',
    model: 'gpt-4'
  },
  temperature: 0.8,
  maxTokens: 1000
});

const messages: ChatMessage[] = [
  { role: 'user', content: 'Hello, how are you?' }
];

// 流式处理
for await (const chunk of streamLLMCompletion(config, messages)) {
  if (chunk.finished) {
    console.log('Completion finished');
    if (chunk.error) {
      console.error('Error:', chunk.error);
    }
  } else {
    process.stdout.write(chunk.content);
  }
}

// 2. 带回调的用法
const stream = streamLLMCompletion(config, messages);
const streamWithCallback = withCallback(stream, (chunk) => {
  console.log('Received chunk:', chunk);
});

for await (const chunk of streamWithCallback) {
  // 处理 chunk
}

// 3. 从现有配置创建
const endpoint = { url: 'https://api.openai.com/v1', key: 'key', model: 'gpt-4' };
const configFromEndpoint = createLLMConfigFromEndpoint(endpoint, {
  temperature: 0.5,
  tools: [] // 你的工具数组
});
*/