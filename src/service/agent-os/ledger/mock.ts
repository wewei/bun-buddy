// Mock Ledger - accepts all saves but persists nothing, returns empty on queries

import type { Task, Call, Message } from '../types';
import type {
  Ledger,
  TaskQueryOptions,
  TaskQueryResult,
  CallListOptions,
  MessageListOptions,
  MessageListResult,
} from './types';

export const createMockLedger = (): Ledger => {
  return {
    // Task operations
    saveTask: async (_task: Task): Promise<void> => {
      // Accept but don't persist
      return Promise.resolve();
    },

    getTask: async (_taskId: string): Promise<Task | null> => {
      // Always return null (no tasks found)
      return Promise.resolve(null);
    },

    queryTasks: async (_options: TaskQueryOptions): Promise<TaskQueryResult> => {
      // Always return empty results
      return Promise.resolve({
        tasks: [],
        total: 0,
      });
    },

    // Call operations
    saveCall: async (_call: Call): Promise<void> => {
      // Accept but don't persist
      return Promise.resolve();
    },

    listCalls: async (_options: CallListOptions): Promise<Call[]> => {
      // Always return empty array
      return Promise.resolve([]);
    },

    // Message operations
    saveMessage: async (message: Message): Promise<string> => {
      // Accept but don't persist, return the message ID
      return Promise.resolve(message.id);
    },

    listMessages: async (_options: MessageListOptions): Promise<MessageListResult> => {
      // Always return empty results
      return Promise.resolve({
        messages: [],
        total: 0,
      });
    },
  };
};

