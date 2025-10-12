// Ledger Abilities

import type { AgentBus, AbilityMeta, Task, Call, Message } from '../types';
import type { Ledger } from './types';

const registerTaskSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const taskSaveMeta: AbilityMeta = {
    id: 'ldg:task:save',
    moduleName: 'ldg',
    abilityName: 'task:save',
    description: 'Save or update a task',
    inputSchema: {
      type: 'object',
      properties: {
        task: {
          type: 'object',
          description: 'Task entity to save',
        },
      },
      required: ['task'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
      required: ['success'],
    },
  };

  bus.register(taskSaveMeta, async (_taskId: string, input: string) => {
    const { task } = JSON.parse(input) as { task: Task };
    await ledger.saveTask(task);
    return JSON.stringify({ success: true });
  });
};

const registerTaskGetAbility = (ledger: Ledger, bus: AgentBus): void => {
  const taskGetMeta: AbilityMeta = {
    id: 'ldg:task:get',
    moduleName: 'ldg',
    abilityName: 'task:get',
    description: 'Get a task by ID',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
      },
      required: ['taskId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        task: {
          type: ['object', 'null'],
          description: 'Task entity or null if not found',
        },
      },
      required: ['task'],
    },
  };

  bus.register(taskGetMeta, async (_taskId: string, input: string) => {
    const { taskId } = JSON.parse(input);
    const task = await ledger.getTask(taskId);
    return JSON.stringify({ task });
  });
};

const registerTaskQueryAbility = (ledger: Ledger, bus: AgentBus): void => {
  const taskQueryMeta: AbilityMeta = {
    id: 'ldg:task:query',
    moduleName: 'ldg',
    abilityName: 'task:query',
    description: 'Query tasks with filters',
    inputSchema: {
      type: 'object',
      properties: {
        completionStatus: { type: 'string' },
        parentTaskId: { type: 'string' },
        fromTime: { type: 'number' },
        toTime: { type: 'number' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
    },
    outputSchema: {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
      },
      required: ['tasks', 'total'],
    },
  };

  bus.register(taskQueryMeta, async (_taskId: string, input: string) => {
    const options = JSON.parse(input);
    const result = await ledger.queryTasks(options);
    return JSON.stringify(result);
  });
};

const registerCallSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const callSaveMeta: AbilityMeta = {
    id: 'ldg:call:save',
    moduleName: 'ldg',
    abilityName: 'call:save',
    description: 'Save or update a call',
    inputSchema: {
      type: 'object',
      properties: {
        call: {
          type: 'object',
          description: 'Call entity to save',
        },
      },
      required: ['call'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
      },
      required: ['success'],
    },
  };

  bus.register(callSaveMeta, async (_taskId: string, input: string) => {
    const { call } = JSON.parse(input) as { call: Call };
    await ledger.saveCall(call);
    return JSON.stringify({ success: true });
  });
};

const registerCallListAbility = (ledger: Ledger, bus: AgentBus): void => {
  const callListMeta: AbilityMeta = {
    id: 'ldg:call:list',
    moduleName: 'ldg',
    abilityName: 'call:list',
    description: 'List calls for a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
      },
      required: ['taskId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        calls: {
          type: 'array',
          items: { type: 'object' },
        },
      },
      required: ['calls'],
    },
  };

  bus.register(callListMeta, async (_taskId: string, input: string) => {
    const { taskId } = JSON.parse(input);
    const calls = await ledger.listCalls({ taskId });
    return JSON.stringify({ calls });
  });
};

const registerMsgSaveAbility = (ledger: Ledger, bus: AgentBus): void => {
  const msgSaveMeta: AbilityMeta = {
    id: 'ldg:msg:save',
    moduleName: 'ldg',
    abilityName: 'msg:save',
    description: 'Save a message (immutable)',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'object',
          description: 'Message entity to save',
        },
      },
      required: ['message'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        messageId: { type: 'string' },
      },
      required: ['success', 'messageId'],
    },
  };

  bus.register(msgSaveMeta, async (_taskId: string, input: string) => {
    const { message } = JSON.parse(input) as { message: Message };
    const messageId = await ledger.saveMessage(message);
    return JSON.stringify({ success: true, messageId });
  });
};

const registerMsgListAbility = (ledger: Ledger, bus: AgentBus): void => {
  const msgListMeta: AbilityMeta = {
    id: 'ldg:msg:list',
    moduleName: 'ldg',
    abilityName: 'msg:list',
    description: 'List messages for a task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string' },
        limit: { type: 'number' },
        offset: { type: 'number' },
      },
      required: ['taskId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        messages: {
          type: 'array',
          items: { type: 'object' },
        },
        total: { type: 'number' },
      },
      required: ['messages', 'total'],
    },
  };

  bus.register(msgListMeta, async (_taskId: string, input: string) => {
    const options = JSON.parse(input);
    const result = await ledger.listMessages(options);
    return JSON.stringify(result);
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
