// Task Manager Abilities

import { z } from 'zod';

import type { AgentBus, AbilityMeta, Task, Message, AbilityResult } from '../types';
import type { TaskRegistry } from './types';

// Schema definitions
const TASK_SPAWN_INPUT_SCHEMA = z.object({
  goal: z.string().describe('Task goal or initial message'),
  parentTaskId: z.string().optional().describe('Optional parent task ID for subtasks'),
  systemPrompt: z.string().optional().describe('Optional custom system prompt'),
});

const TASK_SPAWN_OUTPUT_SCHEMA = z.object({
  taskId: z.string().describe('Created task ID'),
});

const TASK_SEND_INPUT_SCHEMA = z.object({
  receiverId: z.string().describe('Task ID to receive the message'),
  message: z.string().describe('Message content to send'),
});

const TASK_SEND_OUTPUT_SCHEMA = z.object({
  success: z.boolean().describe('Whether the message was sent successfully'),
  error: z.string().optional().describe('Error message if failed'),
});

const TASK_CANCEL_INPUT_SCHEMA = z.object({
  taskId: z.string().describe('Task to cancel'),
  reason: z.string().describe('Cancellation reason'),
});

const TASK_CANCEL_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
});

const TASK_ACTIVE_INPUT_SCHEMA = z.object({
  limit: z.number().optional().describe('Maximum number of tasks to return'),
});

const TASK_ACTIVE_OUTPUT_SCHEMA = z.object({
  tasks: z.array(z.object({
    id: z.string(),
    goal: z.string(),
    parentTaskId: z.string().optional(),
    lastActivityTime: z.number(),
    messageCount: z.number(),
    createdAt: z.number(),
  })),
});

// Type inference from schemas
type TaskSpawnInput = z.infer<typeof TASK_SPAWN_INPUT_SCHEMA>;
type TaskSpawnOutput = z.infer<typeof TASK_SPAWN_OUTPUT_SCHEMA>;
type TaskSendInput = z.infer<typeof TASK_SEND_INPUT_SCHEMA>;
type TaskSendOutput = z.infer<typeof TASK_SEND_OUTPUT_SCHEMA>;
type TaskCancelInput = z.infer<typeof TASK_CANCEL_INPUT_SCHEMA>;
type TaskCancelOutput = z.infer<typeof TASK_CANCEL_OUTPUT_SCHEMA>;
type TaskActiveInput = z.infer<typeof TASK_ACTIVE_INPUT_SCHEMA>;
type TaskActiveOutput = z.infer<typeof TASK_ACTIVE_OUTPUT_SCHEMA>;

// Meta definitions
const TASK_SPAWN_META: AbilityMeta<TaskSpawnInput, TaskSpawnOutput> = {
  moduleName: 'task',
  abilityName: 'spawn',
  description: 'Create a new task',
  inputSchema: TASK_SPAWN_INPUT_SCHEMA,
  outputSchema: TASK_SPAWN_OUTPUT_SCHEMA,
};

const TASK_SEND_META: AbilityMeta<TaskSendInput, TaskSendOutput> = {
  moduleName: 'task',
  abilityName: 'send',
  description: 'Send a message to a task (inter-task communication)',
  inputSchema: TASK_SEND_INPUT_SCHEMA,
  outputSchema: TASK_SEND_OUTPUT_SCHEMA,
};

const TASK_CANCEL_META: AbilityMeta<TaskCancelInput, TaskCancelOutput> = {
  moduleName: 'task',
  abilityName: 'cancel',
  description: 'Cancel a running task',
  inputSchema: TASK_CANCEL_INPUT_SCHEMA,
  outputSchema: TASK_CANCEL_OUTPUT_SCHEMA,
};

const TASK_ACTIVE_META: AbilityMeta<TaskActiveInput, TaskActiveOutput> = {
  moduleName: 'task',
  abilityName: 'active',
  description: 'List all active (in-progress) tasks',
  inputSchema: TASK_ACTIVE_INPUT_SCHEMA,
  outputSchema: TASK_ACTIVE_OUTPUT_SCHEMA,
};

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

const unwrapInvokeResult = <R, E>(
  result: AbilityResult<R, E> | { type: string; message?: string; error?: E }
): R => {
  if (result.type === 'success') {
    return (result as AbilityResult<R, E> & { type: 'success' }).result;
  }
  const msg = 'message' in result && result.message 
    ? result.message 
    : 'error' in result && result.error 
    ? String(result.error) 
    : 'Unknown error';
  throw new Error(`Invoke failed (${result.type}): ${msg}`);
};

const saveTaskAndMessages = async (
  bus: AgentBus,
  callId: string,
  task: Task,
  messages: Message[]
): Promise<void> => {
  unwrapInvokeResult(await bus.invoke('ldg:task:save', callId, 'system', JSON.stringify({ task })));

  for (const message of messages) {
    unwrapInvokeResult(await bus.invoke('ldg:msg:save', callId, 'system', JSON.stringify({ message })));
  }
};

const registerSpawnAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {
  bus.register('task:spawn', TASK_SPAWN_META, async (callId, _taskId, input: TaskSpawnInput) => {
    const taskId = generateId();
    const task = createTask(taskId, input.goal, input.parentTaskId, input.systemPrompt);
    const messages = createInitialMessages(taskId, task, input.goal);

    await saveTaskAndMessages(bus, callId, task, messages);

    registry.set(taskId, {
      task,
      messages,
      isRunning: false,
      goal: input.goal,
      lastActivityTime: Date.now(),
    });

    executeTask(taskId).catch((error) => {
      console.error(`Task ${taskId} execution failed:`, error);
    });

    return { type: 'success', result: { taskId } };
  });
};

const registerSendAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {
  bus.register('task:send', TASK_SEND_META, async (callId, _taskId, input: TaskSendInput) => {
    const taskState = registry.get(input.receiverId);
    if (!taskState) {
      return {
        type: 'success' as const,
        result: {
          success: false,
          error: `Task not found: ${input.receiverId}`,
        }
      };
    }

    if (taskState.task.completionStatus !== undefined) {
      return {
        type: 'success' as const,
        result: {
          success: false,
          error: `Task ${input.receiverId} is already completed`,
        }
      };
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}-usr`,
      taskId: input.receiverId,
      role: 'user',
      content: input.message,
      timestamp: Date.now(),
    };

    unwrapInvokeResult(await bus.invoke('ldg:msg:save', callId, 'system', JSON.stringify({ message: userMessage })));

    taskState.messages.push(userMessage);
    taskState.lastActivityTime = Date.now();

    if (!taskState.isRunning) {
      executeTask(input.receiverId).catch((error) => {
        console.error(`Task ${input.receiverId} execution failed:`, error);
      });
    }

    return { type: 'success', result: { success: true } };
  });
};

const registerCancelAbility = (registry: TaskRegistry, bus: AgentBus): void => {
  bus.register('task:cancel', TASK_CANCEL_META, async (callId, _taskId, input: TaskCancelInput) => {
    const taskState = registry.get(input.taskId);
    if (!taskState) {
      return {
        type: 'error' as const,
        error: `Task not found: ${input.taskId}`
      };
    }

    taskState.task.completionStatus = 'cancelled';
    taskState.task.updatedAt = Date.now();

    unwrapInvokeResult(await bus.invoke('ldg:task:save', callId, 'system', JSON.stringify({ task: taskState.task })));

    console.log(`Task ${input.taskId} cancelled: ${input.reason}`);

    return { type: 'success', result: { success: true } };
  });
};

const registerActiveAbility = (registry: TaskRegistry, bus: AgentBus): void => {
  bus.register('task:active', TASK_ACTIVE_META, async (_callId, _taskId, input: TaskActiveInput) => {
    const activeTasks = Array.from(registry.values())
      .filter((state) => state.task.completionStatus === undefined)
      .slice(0, input.limit || 100)
      .map((state) => ({
        id: state.task.id,
        goal: state.goal,
        parentTaskId: state.task.parentTaskId,
        lastActivityTime: state.lastActivityTime,
        messageCount: state.messages.length,
        createdAt: state.task.createdAt,
      }));

    return { type: 'success', result: { tasks: activeTasks } };
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

