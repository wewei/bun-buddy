// Task Manager types

import type { Task, Message } from '../types';

export type TaskState = {
  task: Task;
  messages: Message[];
  isRunning: boolean;
  goal: string; // Short description for routing decisions
  lastActivityTime: number;
};

export type ExecutionContext = {
  taskId: string;
  messages: Message[];
};

export type TaskRegistry = Map<string, TaskState>;

