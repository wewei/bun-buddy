// Agent 模块的公共类型定义

import type OpenAI from 'openai';

// ============= LLM 相关类型 =============

// 直接使用 OpenAI 的标准类型
export type ToolDefinition = OpenAI.Chat.Completions.ChatCompletionTool;
export type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
export type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall;

// LLM 配置
export type LLMConfig = {
  endpoint: {
    url: string;
    key: string;
    model: string;
  };
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
};

// 输出块（扩展支持 tool calls）
export type CompletionChunk = {
  trackingId: string;
  content: string;
  finished: boolean;
  error?: string;
  toolCalls?: ToolCall[];
};

// LLM 接口
export type LLM = {
  complete: (
    messages: ChatMessage[],
    config?: Partial<LLMConfig>
  ) => AsyncGenerator<CompletionChunk>;
};

// ============= Tool 相关类型 =============

// Tool 执行器
export type ToolExecutor = (args: Record<string, any>) => Promise<string>;

// Tool 定义
export type Tool = {
  definition: ToolDefinition;
  executor: ToolExecutor;
};

// 工具执行结果
export type ToolResult = {
  id: string;
  content: string;
  error?: string;
};

// Tool 注册表接口
export type ToolRegistry = {
  register: (tool: Tool) => void;
  getDefinitions: () => ToolDefinition[];
  execute: (toolCall: ToolCall) => Promise<ToolResult>;
};

// ============= Memory 相关类型 =============

// 单次迭代
export type Iteration = {
  userMessage?: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  response?: string;
  timestamp: number;
};

// Run Loop 定义
export type RunLoop = {
  id: string;
  goal: string;
  status: 'active' | 'completed' | 'failed';
  iterations: Iteration[];
  createdAt: number;
  completedAt?: number;
};

// 锚点（精确定位到 Run Loop 的某个位置）
export type MemoryAnchor = {
  runLoopId: string;
  iterationIndex: number;
  segmentIndex: number;
  segmentType: 'user_message' | 'reasoning' | 'tool_call' | 'tool_result' | 'response';
  timestamp: number;
};

// 记忆片段（可锚定）
export type MemoryChunk = {
  content: string;
  anchor: MemoryAnchor;
  relevance: number;
};

// 扩展上下文
export type ExpandedContext = {
  runLoop: RunLoop;
  focusChunk: MemoryChunk;
  beforeChunks: MemoryChunk[];
  afterChunks: MemoryChunk[];
};

// Memory 接口
export type Memory = {
  shortTerm: {
    getActive: () => RunLoop[];
    get: (runLoopId: string) => RunLoop | undefined;
    add: (runLoop: RunLoop) => void;
    update: (runLoopId: string, iteration: Iteration) => void;
    complete: (runLoopId: string) => Promise<void>;
  };
  longTerm: {
    retrieve: (query: string, limit?: number) => Promise<MemoryChunk[]>;
    expand: (anchor: MemoryAnchor, contextWindow?: number) => Promise<ExpandedContext>;
  };
};

// ============= Agent 相关类型 =============

// Agent 输出（流式）
export type AgentOutput = 
  | { type: 'run_loop_start'; runLoopId: string; goal: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_calling'; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; tool: string; result: string }
  | { type: 'response'; content: string }
  | { type: 'run_loop_end'; runLoopId: string };

// Agent 配置选项
export type AgentOptions = {
  maxIterations?: number;
  systemPrompt?: string;
  autoClassify?: boolean;
};

// Agent 接口
export type Agent = {
  send: (
    message: string, 
    runLoopId?: string
  ) => AsyncGenerator<AgentOutput>;
  getActiveRunLoops: () => RunLoop[];
  memory: Memory;
};

// Agent 工厂函数类型
export type CreateAgent = (
  llm: LLM,
  tools: ToolRegistry,
  memory: Memory,
  options?: AgentOptions
) => Agent;

