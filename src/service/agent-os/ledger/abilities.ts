// Ledger Abilities

import { z } from 'zod';

import type { AgentBus, AbilityMeta, Task, Call, Message } from '../types';
import type { Ledger } from './types';

// Schema definitions
const LEDGER_TASK_SAVE_INPUT_SCHEMA = z.object({
  task: z.any().describe('Task entity to save'),
});

const LEDGER_TASK_SAVE_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
});

const LEDGER_TASK_GET_INPUT_SCHEMA = z.object({
  taskId: z.string(),
});

const LEDGER_TASK_GET_OUTPUT_SCHEMA = z.object({
  task: z.any().nullable().describe('Task entity or null if not found'),
});

const LEDGER_TASK_QUERY_INPUT_SCHEMA = z.object({
  completionStatus: z.string().optional(),
  parentTaskId: z.string().optional(),
  fromTime: z.number().optional(),
  toTime: z.number().optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const LEDGER_TASK_QUERY_OUTPUT_SCHEMA = z.object({
  tasks: z.array(z.any()),
  total: z.number(),
});

const LEDGER_CALL_SAVE_INPUT_SCHEMA = z.object({
  call: z.any().describe('Call entity to save'),
});

const LEDGER_CALL_SAVE_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
});

const LEDGER_CALL_LIST_INPUT_SCHEMA = z.object({
  taskId: z.string(),
});

const LEDGER_CALL_LIST_OUTPUT_SCHEMA = z.object({
  calls: z.array(z.any()),
});

const LEDGER_MSG_SAVE_INPUT_SCHEMA = z.object({
  message: z.any().describe('Message entity to save'),
});

const LEDGER_MSG_SAVE_OUTPUT_SCHEMA = z.object({
  success: z.boolean(),
  messageId: z.string(),
});

const LEDGER_MSG_LIST_INPUT_SCHEMA = z.object({
  taskId: z.string(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

const LEDGER_MSG_LIST_OUTPUT_SCHEMA = z.object({
  messages: z.array(z.any()),
  total: z.number(),
});

// Type inference from schemas
type LedgerTaskSaveInput = z.infer<typeof LEDGER_TASK_SAVE_INPUT_SCHEMA>;
type LedgerTaskSaveOutput = z.infer<typeof LEDGER_TASK_SAVE_OUTPUT_SCHEMA>;
type LedgerTaskGetInput = z.infer<typeof LEDGER_TASK_GET_INPUT_SCHEMA>;
type LedgerTaskGetOutput = z.infer<typeof LEDGER_TASK_GET_OUTPUT_SCHEMA>;
type LedgerTaskQueryInput = z.infer<typeof LEDGER_TASK_QUERY_INPUT_SCHEMA>;
type LedgerTaskQueryOutput = z.infer<typeof LEDGER_TASK_QUERY_OUTPUT_SCHEMA>;
type LedgerCallSaveInput = z.infer<typeof LEDGER_CALL_SAVE_INPUT_SCHEMA>;
type LedgerCallSaveOutput = z.infer<typeof LEDGER_CALL_SAVE_OUTPUT_SCHEMA>;
type LedgerCallListInput = z.infer<typeof LEDGER_CALL_LIST_INPUT_SCHEMA>;
type LedgerCallListOutput = z.infer<typeof LEDGER_CALL_LIST_OUTPUT_SCHEMA>;
type LedgerMsgSaveInput = z.infer<typeof LEDGER_MSG_SAVE_INPUT_SCHEMA>;
type LedgerMsgSaveOutput = z.infer<typeof LEDGER_MSG_SAVE_OUTPUT_SCHEMA>;
type LedgerMsgListInput = z.infer<typeof LEDGER_MSG_LIST_INPUT_SCHEMA>;
type LedgerMsgListOutput = z.infer<typeof LEDGER_MSG_LIST_OUTPUT_SCHEMA>;

// Meta definitions
const LEDGER_TASK_SAVE_META: AbilityMeta<LedgerTaskSaveInput, LedgerTaskSaveOutput> = {
  id: 'ldg:task:save',
  moduleName: 'ldg',
  abilityName: 'task:save',
  description: 'Save or update a task',
  inputSchema: LEDGER_TASK_SAVE_INPUT_SCHEMA,
  outputSchema: LEDGER_TASK_SAVE_OUTPUT_SCHEMA,
};

const LEDGER_TASK_GET_META: AbilityMeta<LedgerTaskGetInput, LedgerTaskGetOutput> = {
  id: 'ldg:task:get',
  moduleName: 'ldg',
  abilityName: 'task:get',
  description: 'Get a task by ID',
  inputSchema: LEDGER_TASK_GET_INPUT_SCHEMA,
  outputSchema: LEDGER_TASK_GET_OUTPUT_SCHEMA,
};

const LEDGER_TASK_QUERY_META: AbilityMeta<LedgerTaskQueryInput, LedgerTaskQueryOutput> = {
  id: 'ldg:task:query',
  moduleName: 'ldg',
  abilityName: 'task:query',
  description: 'Query tasks with filters',
  inputSchema: LEDGER_TASK_QUERY_INPUT_SCHEMA,
  outputSchema: LEDGER_TASK_QUERY_OUTPUT_SCHEMA,
};

const LEDGER_CALL_SAVE_META: AbilityMeta<LedgerCallSaveInput, LedgerCallSaveOutput> = {
  id: 'ldg:call:save',
  moduleName: 'ldg',
  abilityName: 'call:save',
  description: 'Save or update a call',
  inputSchema: LEDGER_CALL_SAVE_INPUT_SCHEMA,
  outputSchema: LEDGER_CALL_SAVE_OUTPUT_SCHEMA,
};

const LEDGER_CALL_LIST_META: AbilityMeta<LedgerCallListInput, LedgerCallListOutput> = {
  id: 'ldg:call:list',
  moduleName: 'ldg',
  abilityName: 'call:list',
  description: 'List calls for a task',
  inputSchema: LEDGER_CALL_LIST_INPUT_SCHEMA,
  outputSchema: LEDGER_CALL_LIST_OUTPUT_SCHEMA,
};

const LEDGER_MSG_SAVE_META: AbilityMeta<LedgerMsgSaveInput, LedgerMsgSaveOutput> = {
  id: 'ldg:msg:save',
  moduleName: 'ldg',
  abilityName: 'msg:save',
  description: 'Save a message (immutable)',
  inputSchema: LEDGER_MSG_SAVE_INPUT_SCHEMA,
  outputSchema: LEDGER_MSG_SAVE_OUTPUT_SCHEMA,
};

const LEDGER_MSG_LIST_META: AbilityMeta<LedgerMsgListInput, LedgerMsgListOutput> = {
  id: 'ldg:msg:list',
  moduleName: 'ldg',
  abilityName: 'msg:list',
  description: 'List messages for a task',
  inputSchema: LEDGER_MSG_LIST_INPUT_SCHEMA,
  outputSchema: LEDGER_MSG_LIST_OUTPUT_SCHEMA,
};

const registerTaskSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_TASK_SAVE_META, async (_taskId, input: LedgerTaskSaveInput) => {
    const { task } = input as { task: Task };
    await ledger.saveTask(task);
    return { type: 'success', result: { success: true } };
  });
};

const registerTaskGetAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_TASK_GET_META, async (_taskId, input: LedgerTaskGetInput) => {
    const task = await ledger.getTask(input.taskId);
    return { type: 'success', result: { task } };
  });
};

const registerTaskQueryAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_TASK_QUERY_META, async (_taskId, input: LedgerTaskQueryInput) => {
    const result = await ledger.queryTasks(input);
    return { type: 'success', result };
  });
};

const registerCallSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_CALL_SAVE_META, async (_taskId, input: LedgerCallSaveInput) => {
    const { call } = input as { call: Call };
    await ledger.saveCall(call);
    return { type: 'success', result: { success: true } };
  });
};

const registerCallListAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_CALL_LIST_META, async (_taskId, input: LedgerCallListInput) => {
    const calls = await ledger.listCalls({ taskId: input.taskId });
    return { type: 'success', result: { calls } };
  });
};

const registerMsgSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_MSG_SAVE_META, async (_taskId, input: LedgerMsgSaveInput) => {
    const { message } = input as { message: Message };
    const messageId = await ledger.saveMessage(message);
    return { type: 'success', result: { success: true, messageId } };
  });
};

const registerMsgListAbility = (ledger: Ledger, bus: AgentBus): void => {
  bus.register(LEDGER_MSG_LIST_META, async (_taskId, input: LedgerMsgListInput) => {
    const result = await ledger.listMessages(input);
    return { type: 'success', result };
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
