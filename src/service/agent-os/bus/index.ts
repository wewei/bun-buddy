// Agent Bus Implementation

import { registerBusControllerAbilities } from './controller';
import { registerAbility, unregisterAbility, hasAbility, getAbility } from './registry';

import type { BusState } from './types';
import type { AgentBus, CallLogEntry, InvokeResult } from '../types';

const logInvokeFailure = (
  state: BusState,
  logEntry: CallLogEntry,
  startTime: number,
  errorType: 'invalid-ability' | 'invalid-input' | 'unknown-failure',
  errorMessage: string
) => {
  logEntry.duration = Date.now() - startTime;
  logEntry.success = false;
  logEntry.error = errorMessage;
  state.callLog.push(logEntry);
  
  return { type: errorType, message: errorMessage };
};

const logInvokeResult = (
  state: BusState,
  logEntry: CallLogEntry,
  startTime: number,
  result: InvokeResult<string, string>
) => {
  logEntry.duration = Date.now() - startTime;
  logEntry.success = result.type === 'success';
  if (result.type === 'error') {
    logEntry.error = result.error;
  } else if ('message' in result) {
    logEntry.error = result.message;
  }
  state.callLog.push(logEntry);
  
  return result;
};

const executeInvoke = async (
  state: BusState,
  abilityId: string,
  callId: string,
  callerId: string,
  input: string,
  startTime: number,
  logEntry: CallLogEntry
) => {
  const ability = getAbility(state, abilityId);
  if (!ability) {
    return logInvokeFailure(state, logEntry, startTime, 'invalid-ability', 
      `Ability not found: ${abilityId}`);
  }

  // Validation happens inside the handler (createInternalHandler)
  // which can return invalid-input, success, or error
  try {
    const handlerResult = await ability.handler(callId, callerId, input);
    return logInvokeResult(state, logEntry, startTime, handlerResult);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return logInvokeFailure(state, logEntry, startTime, 'unknown-failure', 
      `Handler rejected unexpectedly: ${errorMessage}`);
  }
};

export const createAgentBus = (): AgentBus => {
  const state: BusState = {
    abilities: new Map(),
    callLog: [],
  };

  const bus: AgentBus = {
    invoke: async (abilityId: string, callId: string, callerId: string, input: string) => {
      const startTime = Date.now();
      const logEntry: CallLogEntry = {
        callerId,
        abilityId,
        timestamp: startTime,
      };
      
      return executeInvoke(state, abilityId, callId, callerId, input, startTime, logEntry);
    },

    register: (abilityId, meta, handler) => {
      registerAbility(state, abilityId, meta, handler);
    },

    unregister: (abilityId: string): void => {
      unregisterAbility(state, abilityId);
    },

    has: (abilityId: string): boolean => {
      return hasAbility(state, abilityId);
    },
  };

  // Register bus controller abilities
  registerBusControllerAbilities(state, bus);

  return bus;
};

export type { AgentBus } from '../types';

