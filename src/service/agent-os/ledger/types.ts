// Ledger types

import type { Task, Call, Message } from '../types';

export type TaskQueryOptions = {
  completionStatus?: string | 'null'; // 'null' means active tasks
  parentTaskId?: string;
  fromTime?: number;
  toTime?: number;
  limit?: number;
  offset?: number;
};

export type TaskQueryResult = {
  tasks: Task[];
  total: number;
};

export type CallListOptions = {
  taskId: string;
};

export type MessageListOptions = {
  taskId: string;
  limit?: number;
  offset?: number;
};

export type MessageListResult = {
  messages: Message[];
  total: number;
};

export type Ledger = {
  // Task operations
  saveTask: (task: Task) => Promise<void>;
  getTask: (taskId: string) => Promise<Task | null>;
  queryTasks: (options: TaskQueryOptions) => Promise<TaskQueryResult>;

  // Call operations
  saveCall: (call: Call) => Promise<void>;
  listCalls: (options: CallListOptions) => Promise<Call[]>;

  // Message operations
  saveMessage: (message: Message) => Promise<string>; // returns messageId
  listMessages: (options: MessageListOptions) => Promise<MessageListResult>;
};

