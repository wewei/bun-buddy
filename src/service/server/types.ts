import type { ChatMessage } from '../llm';

export type ApiResponse<T = any> = {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

export type ChatHistoryManager = {
  addMessage: (message: ChatMessage) => void;
  getRecentHistory: (limit?: number) => ChatMessage[];
}

export type HandleSSEConnection = (
  request: Request,
  sseChannel: ReturnType<typeof import('better-sse').createChannel>
) => Promise<Response>

export type HandlePostMessage = (
  request: Request,
  sseChannel: ReturnType<typeof import('better-sse').createChannel>,
  chatHistoryManager: ChatHistoryManager,
  llmConfig: ReturnType<typeof import('../llm').createLLMConfigFromEndpoint> | null
) => Promise<Response>
