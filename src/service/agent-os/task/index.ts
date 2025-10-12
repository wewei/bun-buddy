// Task Manager
import { registerTaskAbilities } from './abilities';
import { createExecuteTask } from './runloop';

import type { AgentBus } from '../types';
import type { TaskRegistry } from './types';

export type TaskManager = {
  registry: TaskRegistry;
};

export const createTaskManager = (bus: AgentBus): TaskManager => {
  const registry: TaskRegistry = new Map();

  // Create execute task function
  const executeTask = createExecuteTask(registry, bus);

  // Register task abilities
  registerTaskAbilities(registry, bus, executeTask);

  return {
    registry,
  };
};

export type { TaskRegistry, TaskState } from './types';

