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

// Meta definitions
const TASK_SPAWN_META: AbilityMeta = {
  id: 'task:spawn',
  moduleName: 'task',
  abilityName: 'spawn',
  description: 'Create a new task',
  inputSchema: TASK_SPAWN_INPUT_SCHEMA,
  outputSchema: TASK_SPAWN_OUTPUT_SCHEMA,
};

const TASK_SEND_META: AbilityMeta = {
  id: 'task:send',
  moduleName: 'task',
  abilityName: 'send',
  description: 'Send a message to a task (inter-task communication)',
  inputSchema: TASK_SEND_INPUT_SCHEMA,
  outputSchema: TASK_SEND_OUTPUT_SCHEMA,
};

const TASK_CANCEL_META: AbilityMeta = {
  id: 'task:cancel',
  moduleName: 'task',
  abilityName: 'cancel',
  description: 'Cancel a running task',
  inputSchema: TASK_CANCEL_INPUT_SCHEMA,
  outputSchema: TASK_CANCEL_OUTPUT_SCHEMA,
};

const TASK_ACTIVE_META: AbilityMeta = {
  id: 'task:active',
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
  task: Task,
  messages: Message[]
): Promise<void> => {
  unwrapInvokeResult(await bus.invoke('ldg:task:save', 'system', JSON.stringify({ task })));

  for (const message of messages) {
    unwrapInvokeResult(await bus.invoke('ldg:msg:save', 'system', JSON.stringify({ message })));
  }
};

const registerSpawnAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {

  bus.register(TASK_SPAWN_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { goal, parentTaskId, systemPrompt } = TASK_SPAWN_INPUT_SCHEMA.parse(JSON.parse(input));

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

      return {
        type: 'success',
        result: JSON.stringify({ taskId })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const handleTaskSend = async (
  receiverId: string,
  message: string,
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): Promise<{ success: boolean; error?: string }> => {
  const taskState = registry.get(receiverId);
  if (!taskState) {
    return { success: false, error: `Task not found: ${receiverId}` };
  }

  if (taskState.task.completionStatus !== undefined) {
    return { success: false, error: `Task ${receiverId} is already completed` };
  }

  const userMessage: Message = {
    id: `msg-${Date.now()}-usr`,
    taskId: receiverId,
    role: 'user',
    content: message,
    timestamp: Date.now(),
  };

  unwrapInvokeResult(await bus.invoke('ldg:msg:save', 'system', JSON.stringify({ message: userMessage })));

  taskState.messages.push(userMessage);
  taskState.lastActivityTime = Date.now();

  if (!taskState.isRunning) {
    executeTask(receiverId).catch((error) => {
      console.error(`Task ${receiverId} execution failed:`, error);
    });
  }

  return { success: true };
};

const registerSendAbility = (
  registry: TaskRegistry,
  bus: AgentBus,
  executeTask: (taskId: string) => Promise<void>
): void => {
  bus.register(TASK_SEND_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { receiverId, message } = TASK_SEND_INPUT_SCHEMA.parse(JSON.parse(input));
      const result = await handleTaskSend(receiverId, message, registry, bus, executeTask);
      return { type: 'success', result: JSON.stringify(result) };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerCancelAbility = (registry: TaskRegistry, bus: AgentBus): void => {

  bus.register(TASK_CANCEL_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { taskId, reason } = TASK_CANCEL_INPUT_SCHEMA.parse(JSON.parse(input));

      const taskState = registry.get(taskId);
      if (!taskState) {
        return {
          type: 'error',
          error: `Task not found: ${taskId}`
        };
      }

      taskState.task.completionStatus = 'cancelled';
      taskState.task.updatedAt = Date.now();

      unwrapInvokeResult(await bus.invoke('ldg:task:save', 'system', JSON.stringify({ task: taskState.task })));

      console.log(`Task ${taskId} cancelled: ${reason}`);

      return {
        type: 'success',
        result: JSON.stringify({ success: true })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerActiveAbility = (registry: TaskRegistry, bus: AgentBus): void => {

  bus.register(TASK_ACTIVE_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { limit } = TASK_ACTIVE_INPUT_SCHEMA.parse(JSON.parse(input));

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

      return {
        type: 'success',
        result: JSON.stringify({ tasks: activeTasks })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
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

