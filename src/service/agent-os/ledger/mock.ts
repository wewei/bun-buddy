// Mock Ledger - accepts all saves but persists nothing, returns empty on queries

import type { Task, Call, Message } from '../types';
import type { Ledger, TaskQueryResult, MessageListResult } from './types';

export const createMockLedger = (): Ledger => {
  return {
    // Task operations
    saveTask: async (): Promise<void> => {
      // Accept but don't persist
      return Promise.resolve();
    },

    getTask: async (): Promise<Task | null> => {
      // Always return null (no tasks found)
      return Promise.resolve(null);
    },

    queryTasks: async (): Promise<TaskQueryResult> => {
      // Always return empty results
      return Promise.resolve({
        tasks: [],
        total: 0,
      });
    },

    // Call operations
    saveCall: async (): Promise<void> => {
      // Accept but don't persist
      return Promise.resolve();
    },

    listCalls: async (): Promise<Call[]> => {
      // Always return empty array
      return Promise.resolve([]);
    },

    // Message operations
    saveMessage: async (message: Message): Promise<string> => {
      // Accept but don't persist, return the message ID
      return Promise.resolve(message.id);
    },

    listMessages: async (): Promise<MessageListResult> => {
      // Always return empty results
      return Promise.resolve({
        messages: [],
        total: 0,
      });
    },
  };
};

