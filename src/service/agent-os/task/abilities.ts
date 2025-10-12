// Task Manager Abilities

import type { AgentBus, AbilityMeta, Task, Message } from '../types';
import type { TaskRegistry } from './types';

const generateId = (): string => {
  return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const registerTaskAbilities = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {
  // task:spawn - Create a new task
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

  bus.register(spawnMeta, async (input: string) => {
    const { goal, parentTaskId, systemPrompt } = JSON.parse(input);

    const taskId = generateId();
    const now = Date.now();

    const defaultSystemPrompt = `You are a helpful AI assistant. You can use tools to help accomplish tasks.`;

    const task: Task = {
      id: taskId,
      parentTaskId,
      completionStatus: undefined, // undefined = in progress
      systemPrompt: systemPrompt || defaultSystemPrompt,
      createdAt: now,
      updatedAt: now,
    };

    // Save task to Ledger (Mock will accept but not persist)
    await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task }));

    // Create system message
    const systemMessage: Message = {
      id: `msg-${Date.now()}-sys`,
      taskId,
      role: 'system',
      content: task.systemPrompt,
      timestamp: now,
    };

    // Create initial user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-usr`,
      taskId,
      role: 'user',
      content: goal,
      timestamp: now + 1,
    };

    // Save messages to Ledger
    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: systemMessage }));
    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: userMessage }));

    // Register task in memory
    registry.set(taskId, {
      task,
      messages: [systemMessage, userMessage],
      isRunning: false,
      goal,
      lastActivityTime: now,
    });

    // Start execution asynchronously
    executeTask(taskId).catch((error) => {
      console.error(`Task ${taskId} execution failed:`, error);
    });

    return JSON.stringify({ taskId });
  });

  // task:send - Send message to a task
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

    // Create user message
    const userMessage: Message = {
      id: `msg-${Date.now()}-usr`,
      taskId: receiverId,
      role: 'user',
      content: message,
      timestamp: Date.now(),
    };

    // Save message
    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: userMessage }));

    // Add to task state
    taskState.messages.push(userMessage);
    taskState.lastActivityTime = Date.now();

    // Trigger execution if not already running
    if (!taskState.isRunning) {
      executeTask(receiverId).catch((error) => {
        console.error(`Task ${receiverId} execution failed:`, error);
      });
    }

    return JSON.stringify({ success: true });
  });

  // task:cancel - Cancel a task
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

  bus.register(cancelMeta, async (input: string) => {
    const { taskId, reason } = JSON.parse(input);

    const taskState = registry.get(taskId);
    if (!taskState) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Update task status
    taskState.task.completionStatus = 'cancelled';
    taskState.task.updatedAt = Date.now();

    // Save to Ledger
    await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));

    console.log(`Task ${taskId} cancelled: ${reason}`);

    return JSON.stringify({ success: true });
  });

  // task:active - List active tasks
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

