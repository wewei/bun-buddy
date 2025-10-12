// Agent Bus Implementation

import Ajv from 'ajv';

import { registerBusControllerAbilities } from './controller';
import { registerAbility, unregisterAbility, hasAbility, getAbility } from './registry';

import type { BusState } from './types';
import type { AgentBus, AbilityMeta, AbilityHandler, CallLogEntry, JSONSchema } from '../types';

const ajv = new Ajv();

const validateInput = (input: string, schema: JSONSchema): void => {
  let data: unknown;
  try {
    data = JSON.parse(input);
  } catch (error) {
    throw new Error(`Invalid JSON input: ${(error as Error).message}`);
  }

  const validate = ajv.compile(schema);
  if (!validate(data)) {
    const errors = ajv.errorsText(validate.errors);
    throw new Error(`Input validation failed: ${errors}`);
  }
};

const wrapHandler = (
  abilityId: string,
  handler: AbilityHandler,
  meta: AbilityMeta
): AbilityHandler => {
  return async (input: string) => {
    try {
      // Validate input against schema
      validateInput(input, meta.inputSchema);
      
      // Execute handler
      const result = await handler(input);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Ability ${abilityId} failed: ${errorMessage}`);
    }
  };
};

export const createAgentBus = (): AgentBus => {
  const state: BusState = {
    abilities: new Map(),
    callLog: [],
  };

  const bus: AgentBus = {
    invoke: async (callerId: string, abilityId: string, input: string): Promise<string> => {
      const startTime = Date.now();
      const logEntry: CallLogEntry = {
        callerId,
        abilityId,
        timestamp: startTime,
      };

      try {
        const ability = getAbility(state, abilityId);
        if (!ability) {
          throw new Error(`Ability not found: ${abilityId}`);
        }

        const result = await ability.handler(input);

        logEntry.duration = Date.now() - startTime;
        logEntry.success = true;
        state.callLog.push(logEntry);

        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logEntry.duration = Date.now() - startTime;
        logEntry.success = false;
        logEntry.error = errorMessage;
        state.callLog.push(logEntry);

        throw error;
      }
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

