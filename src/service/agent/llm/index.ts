import OpenAI from 'openai';
import { randomUUID } from 'crypto';
import type { 
  ChatMessage, 
  CompletionChunk, 
  LLMConfig, 
  ToolCall,
  ToolDefinition
} from '../types';

// 导出类型供外部使用
export type { 
  ChatMessage, 
  CompletionChunk, 
  LLMConfig, 
  ToolCall,
  ToolDefinition 
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


// 生成追踪 ID
export const generateTrackingId = (): string => randomUUID();

// 创建完成块（扩展支持 tool calls）
export const createCompletionChunk = (
  trackingId: string,
  content: string,
  finished: boolean = false,
  error?: string,
  toolCalls?: ToolCall[]
): CompletionChunk => ({
  trackingId,
  content,
  finished,
  ...(error && { error }),
  ...(toolCalls && { toolCalls })
});


// 创建 OpenAI 流式请求参数
const createStreamParams = (
  config: LLMConfig,
  messages: ChatMessage[]
): OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming => ({
  model: config.endpoint.model,
  messages,
  stream: true,
  temperature: config.temperature,
  max_tokens: config.maxTokens,
  ...(config.tools && { tools: config.tools })
});

// 累积 tool calls（处理流式 tool calls 的增量更新）
type ToolCallAccumulator = Map<number, { id: string; name: string; args: string }>;

const accumulateToolCall = (
  acc: ToolCallAccumulator,
  toolCall: OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall
): ToolCallAccumulator => {
  const index = toolCall.index;
  const existing = acc.get(index) || { id: '', name: '', args: '' };
  
  acc.set(index, {
    id: toolCall.id || existing.id,
    name: toolCall.function?.name || existing.name,
    args: existing.args + (toolCall.function?.arguments || '')
  });
  
  return acc;
};

// 转换累积的 tool calls 为最终格式
const finalizeToolCalls = (acc: ToolCallAccumulator): ToolCall[] =>
  Array.from(acc.values())
    .filter(tc => tc.id && tc.name && tc.args)
    .map(tc => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: tc.args
      }
    }));

// 主 LLM 流式请求函数
export const streamLLMCompletion = async function* (
  config: LLMConfig,
  messages: ChatMessage[],
  trackingId?: string
): AsyncGenerator<CompletionChunk, void, unknown> {
  const id = trackingId || generateTrackingId();
  const client = createOpenAIClient(config);
  const toolCallAcc: ToolCallAccumulator = new Map();

  try {
    console.log(`🤖 Starting LLM completion with tracking ID: ${id}`);
    
    const params = createStreamParams(config, messages);
    const stream = await client.chat.completions.create(params);

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      // 处理文本内容
      if (delta?.content) {
        yield createCompletionChunk(id, delta.content, false);
      }
      
      // 累积 tool calls
      if (delta?.tool_calls) {
        delta.tool_calls.forEach(tc => accumulateToolCall(toolCallAcc, tc));
      }
    }

    // 发送完成信号（包含最终的 tool calls）
    const finalToolCalls = finalizeToolCalls(toolCallAcc);
    yield createCompletionChunk(
      id, 
      '', 
      true, 
      undefined, 
      finalToolCalls.length > 0 ? finalToolCalls : undefined
    );
    
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
    if (chunk.toolCalls) {
      console.log('Tool calls:', chunk.toolCalls);
    }
  } else {
    process.stdout.write(chunk.content);
  }
}

// 2. 带 tool definitions 的用法
const configWithTools = createLLMConfig({
  endpoint: { url: 'https://api.openai.com/v1', key: 'key', model: 'gpt-4' },
  tools: [
    {
      type: 'function',
      function: {
        name: 'search_web',
        description: 'Search the web for information',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' }
          },
          required: ['query']
        }
      }
    }
  ]
});

// 3. 带回调的用法
const stream = streamLLMCompletion(config, messages);
const streamWithCallback = withCallback(stream, (chunk) => {
  console.log('Received chunk:', chunk);
});

for await (const chunk of streamWithCallback) {
  // 处理 chunk
}
*/

