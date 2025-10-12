// Shell types

export type SSEConnection = {
  taskId: string;
  controller: ReadableStreamDefaultController;
  messageBuffer: Map<string, Array<{ content: string; index: number }>>;
};

export type SendRequest = {
  message: string;
  taskId?: string;
};

export type SendResponse = {
  taskId: string;
  status: string;
};

export type SSEEvent = {
  type: 'start' | 'content' | 'tool_call' | 'tool_result' | 'message_complete' | 'end' | 'error';
  taskId?: string;
  content?: string;
  messageId?: string;
  index?: number;
  tool?: string;
  args?: any;
  result?: any;
  status?: string;
  error?: string;
};

