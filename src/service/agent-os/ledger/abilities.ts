// Ledger Abilities

import { z } from 'zod';
import type { AgentBus, AbilityMeta, Task, Call, Message, AbilityResult } from '../types';
import type { Ledger } from './types';

const registerTaskSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    task: z.any().describe('Task entity to save'),
  });

  const outputSchema = z.object({
    success: z.boolean(),
  });

  const taskSaveMeta: AbilityMeta = {
    id: 'ldg:task:save',
    moduleName: 'ldg',
    abilityName: 'task:save',
    description: 'Save or update a task',
    inputSchema,
    outputSchema,
  };

  bus.register(taskSaveMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { task } = JSON.parse(input) as { task: Task };
      await ledger.saveTask(task);
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

const registerTaskGetAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    taskId: z.string(),
  });

  const outputSchema = z.object({
    task: z.any().nullable().describe('Task entity or null if not found'),
  });

  const taskGetMeta: AbilityMeta = {
    id: 'ldg:task:get',
    moduleName: 'ldg',
    abilityName: 'task:get',
    description: 'Get a task by ID',
    inputSchema,
    outputSchema,
  };

  bus.register(taskGetMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { taskId } = JSON.parse(input);
      const task = await ledger.getTask(taskId);
      return {
        type: 'success',
        result: JSON.stringify({ task })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerTaskQueryAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    completionStatus: z.string().optional(),
    parentTaskId: z.string().optional(),
    fromTime: z.number().optional(),
    toTime: z.number().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });

  const outputSchema = z.object({
    tasks: z.array(z.any()),
    total: z.number(),
  });

  const taskQueryMeta: AbilityMeta = {
    id: 'ldg:task:query',
    moduleName: 'ldg',
    abilityName: 'task:query',
    description: 'Query tasks with filters',
    inputSchema,
    outputSchema,
  };

  bus.register(taskQueryMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const options = JSON.parse(input);
      const result = await ledger.queryTasks(options);
      return {
        type: 'success',
        result: JSON.stringify(result)
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerCallSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    call: z.any().describe('Call entity to save'),
  });

  const outputSchema = z.object({
    success: z.boolean(),
  });

  const callSaveMeta: AbilityMeta = {
    id: 'ldg:call:save',
    moduleName: 'ldg',
    abilityName: 'call:save',
    description: 'Save or update a call',
    inputSchema,
    outputSchema,
  };

  bus.register(callSaveMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { call } = JSON.parse(input) as { call: Call };
      await ledger.saveCall(call);
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

const registerCallListAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    taskId: z.string(),
  });

  const outputSchema = z.object({
    calls: z.array(z.any()),
  });

  const callListMeta: AbilityMeta = {
    id: 'ldg:call:list',
    moduleName: 'ldg',
    abilityName: 'call:list',
    description: 'List calls for a task',
    inputSchema,
    outputSchema,
  };

  bus.register(callListMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { taskId } = JSON.parse(input);
      const calls = await ledger.listCalls({ taskId });
      return {
        type: 'success',
        result: JSON.stringify({ calls })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerMsgSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    message: z.any().describe('Message entity to save'),
  });

  const outputSchema = z.object({
    success: z.boolean(),
    messageId: z.string(),
  });

  const msgSaveMeta: AbilityMeta = {
    id: 'ldg:msg:save',
    moduleName: 'ldg',
    abilityName: 'msg:save',
    description: 'Save a message (immutable)',
    inputSchema,
    outputSchema,
  };

  bus.register(msgSaveMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { message } = JSON.parse(input) as { message: Message };
      const messageId = await ledger.saveMessage(message);
      return {
        type: 'success',
        result: JSON.stringify({ success: true, messageId })
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

const registerMsgListAbility = (ledger: Ledger, bus: AgentBus): void => {
  const inputSchema = z.object({
    taskId: z.string(),
    limit: z.number().optional(),
    offset: z.number().optional(),
  });

  const outputSchema = z.object({
    messages: z.array(z.any()),
    total: z.number(),
  });

  const msgListMeta: AbilityMeta = {
    id: 'ldg:msg:list',
    moduleName: 'ldg',
    abilityName: 'msg:list',
    description: 'List messages for a task',
    inputSchema,
    outputSchema,
  };

  bus.register(msgListMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const options = JSON.parse(input);
      const result = await ledger.listMessages(options);
      return {
        type: 'success',
        result: JSON.stringify(result)
      };
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  });
};

export const registerLedgerAbilities = (ledger: Ledger, bus: AgentBus): void => {
  registerTaskSaveAbility(ledger, bus);
  registerTaskGetAbility(ledger, bus);
  registerTaskQueryAbility(ledger, bus);
  registerCallSaveAbility(ledger, bus);
  registerCallListAbility(ledger, bus);
  registerMsgSaveAbility(ledger, bus);
  registerMsgListAbility(ledger, bus);
};
