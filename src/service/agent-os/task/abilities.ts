// Task Manager Abilities

import type { AgentBus, AbilityMeta, Task, Message } from '../types';
import type { TaskRegistry } from './types';

const generateId = (): string => {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const createTask = (
  taskId: string,
  goal: string,
  parentTaskId: string | undefined,
  systemPrompt: string | undefined
): Task => {
  const now = Date.now();
  const defaultSystemPrompt = `You are a helpful AI assistant. You can use tools to help accomplish tasks.`;

  return {
    id: taskId,
    parentTaskId,
    completionStatus: undefined,
    systemPrompt: systemPrompt || defaultSystemPrompt,
    createdAt: now,
    updatedAt: now,
  };
};

const createInitialMessages = (taskId: string, task: Task, goal: string): Message[] => {
  const now = Date.now();

  const systemMessage: Message = {
    id: `msg-${Date.now()}-sys`,
    taskId,
    role: 'system',
    content: task.systemPrompt,
    timestamp: now,
  };

  const userMessage: Message = {
    id: `msg-${Date.now()}-usr`,
    taskId,
    role: 'user',
    content: goal,
    timestamp: now + 1,
  };

  return [systemMessage, userMessage];
};

const saveTaskAndMessages = async (
  bus: AgentBus,
  task: Task,
  messages: Message[]
): Promise<void> => {
  await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task }));

  for (const message of messages) {
    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message }));
  }
};

const spawnMeta: AbilityMeta = {
  id: 'task:spawn',
  moduleName: 'task',
  abilityName: 'spawn',
  description: 'Create a new task',
  inputSchema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Task goal or initial message',
      },
      parentTaskId: {
        type: 'string',
        description: 'Optional parent task ID for subtasks',
      },
      systemPrompt: {
        type: 'string',
        description: 'Optional custom system prompt',
      },
    },
    required: ['goal'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Created task ID',
      },
    },
    required: ['taskId'],
  },
};

const registerSpawnAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {

  bus.register(spawnMeta, async (input: string) => {
    const { goal, parentTaskId, systemPrompt } = JSON.parse(input);

    const taskId = generateId();
    const task = createTask(taskId, goal, parentTaskId, systemPrompt);
    const messages = createInitialMessages(taskId, task, goal);

    await saveTaskAndMessages(bus, task, messages);

    registry.set(taskId, {
      task,
      messages,
      isRunning: false,
      goal,
      lastActivityTime: Date.now(),
    });

    executeTask(taskId).catch((error) => {
      console.error(`Task ${taskId} execution failed:`, error);
    });

    return JSON.stringify({ taskId });
  });
};

const sendMeta: AbilityMeta = {
  id: 'task:send',
  moduleName: 'task',
  abilityName: 'send',
  description: 'Send a message to a task (inter-task communication)',
  inputSchema: {
    type: 'object',
    properties: {
      receiverId: {
        type: 'string',
        description: 'Task ID to receive the message',
      },
      message: {
        type: 'string',
        description: 'Message content to send',
      },
    },
    required: ['receiverId', 'message'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the message was sent successfully',
      },
      error: {
        type: 'string',
        description: 'Error message if failed',
      },
    },
    required: ['success'],
  },
};

const registerSendAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {

  bus.register(sendMeta, async (input: string) => {
    const { receiverId, message } = JSON.parse(input);

    const taskState = registry.get(receiverId);
    if (!taskState) {
      return JSON.stringify({
        success: false,
        error: `Task not found: ${receiverId}`,
      });
    }

    if (taskState.task.completionStatus !== undefined) {
      return JSON.stringify({
        success: false,
        error: `Task ${receiverId} is already completed`,
      });
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}-usr`,
      taskId: receiverId,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: userMessage }));

    taskState.messages.push(userMessage);
    taskState.lastActivityTime = Date.now();

    if (!taskState.isRunning) {
      executeTask(receiverId).catch((error) => {
        console.error(`Task ${receiverId} execution failed:`, error);
      });
    }

    return JSON.stringify({ success: true });
  });
};

const cancelMeta: AbilityMeta = {
  id: 'task:cancel',
  moduleName: 'task',
  abilityName: 'cancel',
  description: 'Cancel a running task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task to cancel',
      },
      reason: {
        type: 'string',
        description: 'Cancellation reason',
      },
    },
    required: ['taskId', 'reason'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
      },
    },
    required: ['success'],
  },
};

const registerCancelAbility = (registry: TaskRegistry, bus: AgentBus): void => {

  bus.register(cancelMeta, async (input: string) => {
    const { taskId, reason } = JSON.parse(input);

    const taskState = registry.get(taskId);
    if (!taskState) {
      throw new Error(`Task not found: ${taskId}`);
    }

    taskState.task.completionStatus = 'cancelled';
    taskState.task.updatedAt = Date.now();

    await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));

    console.log(`Task ${taskId} cancelled: ${reason}`);

    return JSON.stringify({ success: true });
  });
};

const activeMeta: AbilityMeta = {
  id: 'task:active',
  moduleName: 'task',
  abilityName: 'active',
  description: 'List all active (in-progress) tasks',
  inputSchema: {
    type: 'object',
    properties: {
      limit: {
        type: 'number',
        description: 'Maximum number of tasks to return',
      },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            goal: { type: 'string' },
            parentTaskId: { type: 'string' },
            lastActivityTime: { type: 'number' },
            messageCount: { type: 'number' },
            createdAt: { type: 'number' },
          },
        },
      },
    },
    required: ['tasks'],
  },
};

const registerActiveAbility = (registry: TaskRegistry, bus: AgentBus): void => {

  bus.register(activeMeta, async (input: string) => {
    const { limit } = JSON.parse(input) as { limit?: number };

    const activeTasks = Array.from(registry.values())
      .filter((state) => state.task.completionStatus === undefined)
      .slice(0, limit || 100)
      .map((state) => ({
        id: state.task.id,
        goal: state.goal,
        parentTaskId: state.task.parentTaskId,
        lastActivityTime: state.lastActivityTime,
        messageCount: state.messages.length,
        createdAt: state.task.createdAt,
      }));

    return JSON.stringify({ tasks: activeTasks });
  });
};

export const registerTaskAbilities = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {
  registerSpawnAbility(registry, bus, executeTask);
  registerSendAbility(registry, bus, executeTask);
  registerCancelAbility(registry, bus);
  registerActiveAbility(registry, bus);
};

