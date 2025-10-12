// Agent Bus Implementation

import { z } from 'zod';

import { registerBusControllerAbilities } from './controller';
import { registerAbility, unregisterAbility, hasAbility, getAbility } from './registry';

import type { BusState } from './types';
import type { AgentBus, AbilityMeta, AbilityHandler, CallLogEntry, AbilityResult } from '../types';

type ValidationResult = 
  | { success: true; data: unknown }
  | { success: false; error: string };

const validateInput = (input: string, schema: z.ZodSchema): ValidationResult => {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    return { 
      success: false, 
      error: `Invalid JSON input: ${(error as Error).message}` 
    };
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    return { 
      success: false, 
      error: `Input validation failed: ${result.error.message}` 
    };
  }

  return { success: true, data: result.data };
};

const wrapHandler = (
  abilityId: string,
  handler: AbilityHandler,
  meta: AbilityMeta
): AbilityHandler => {
  return async (taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      // Validate input against schema
      const validation = validateInput(input, meta.inputSchema);
      if (!validation.success) {
        return { 
          type: 'error', 
          error: `Input validation failed for ${abilityId}: ${validation.error}` 
        };
      }
      
      // Execute handler - it should return AbilityResult and never reject
      const result = await handler(taskId, input);
      
      return result;
    } catch (error) {
      // This should rarely happen since handlers should not throw
      // But we catch it as a safety net
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { 
        type: 'error', 
        error: `Unexpected error in ${abilityId}: ${errorMessage}` 
      };
    }
  };
};

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

const logInvokeSuccess = (
  state: BusState,
  logEntry: CallLogEntry,
  startTime: number,
  result: AbilityResult<string, string>
) => {
  logEntry.duration = Date.now() - startTime;
  logEntry.success = result.type === 'success';
  if (result.type === 'error') {
    logEntry.error = result.error;
  }
  state.callLog.push(logEntry);
  
  return result;
};

const executeInvoke = async (
  state: BusState,
  abilityId: string,
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

  const validation = validateInput(input, ability.meta.inputSchema);
  if (!validation.success) {
    return logInvokeFailure(state, logEntry, startTime, 'invalid-input', 
      validation.error);
  }

  try {
    const handlerResult = await ability.handler(callerId, input);
    return logInvokeSuccess(state, logEntry, startTime, handlerResult);
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
    invoke: async (abilityId: string, callerId: string, input: string) => {
      const startTime = Date.now();
      const logEntry: CallLogEntry = {
        callerId,
        abilityId,
        timestamp: startTime,
      };
      
      return executeInvoke(state, abilityId, callerId, input, startTime, logEntry);
    },

    register: (meta: AbilityMeta, handler: AbilityHandler): void => {
      const wrappedHandler = wrapHandler(meta.id, handler, meta);
      registerAbility(state, meta, wrappedHandler);
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

