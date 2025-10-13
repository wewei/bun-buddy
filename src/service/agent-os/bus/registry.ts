// Ability Registry

import type { AbilityMeta, AbilityHandler, RegisteredAbility, InternalAbilityHandler, InvokeResult } from '../types';
import type { BusState } from './types';

const createInternalHandler = <TInput, TOutput>(
  meta: AbilityMeta<TInput, TOutput>,
  handler: AbilityHandler<TInput, TOutput>
): InternalAbilityHandler => {
  return async (callId: string, taskId: string, input: string): Promise<InvokeResult<string, string>> => {
    try {
      // Parse JSON
      let jsonData: unknown;
      try {
        jsonData = JSON.parse(input);
      } catch (error) {
        return {
          type: 'invalid-input',
          message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`
        };
      }
      
      // Validate with Zod schema
      const parseResult = meta.inputSchema.safeParse(jsonData);
      if (!parseResult.success) {
        return {
          type: 'invalid-input',
          message: `Schema validation failed: ${parseResult.error.message}`
        };
      }
      
      // Call handler with parsed, typed input
      const handlerResult = await handler(callId, taskId, parseResult.data);
      
      // Serialize result
      if (handlerResult.type === 'success') {
        return {
          type: 'success',
          result: JSON.stringify(handlerResult.result)
        };
      } else {
        return handlerResult;
      }
    } catch (error) {
      return {
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  };
};

export const registerAbility = <TInput, TOutput>(
  state: BusState,
  abilityId: string,
  meta: AbilityMeta<TInput, TOutput>,
  handler: AbilityHandler<TInput, TOutput>
): void => {
  if (state.abilities.has(abilityId)) {
    throw new Error(`Ability already registered: ${abilityId}`);
  }
  
  const internalHandler = createInternalHandler(meta, handler);
  state.abilities.set(abilityId, { abilityId, meta, handler: internalHandler });
};

export const unregisterAbility = (state: BusState, abilityId: string): void => {
  state.abilities.delete(abilityId);
};

export const hasAbility = (state: BusState, abilityId: string): boolean => {
  return state.abilities.has(abilityId);
};

export const getAbility = (
  state: BusState,
  abilityId: string
): RegisteredAbility | undefined => {
  return state.abilities.get(abilityId);
};

export const listModules = (state: BusState): Array<{ name: string; abilityCount: number }> => {
  const moduleMap = new Map<string, number>();

  for (const ability of state.abilities.values()) {
    const moduleName = ability.meta.moduleName;
    moduleMap.set(moduleName, (moduleMap.get(moduleName) || 0) + 1);
  }

  return Array.from(moduleMap.entries()).map(([name, abilityCount]) => ({
    name,
    abilityCount,
  }));
};

export const listAbilitiesForModule = (
  state: BusState,
  moduleName: string
): Array<{ id: string; name: string; description: string }> => {
  const abilities: Array<{ id: string; name: string; description: string }> = [];

  for (const ability of state.abilities.values()) {
    if (ability.meta.moduleName === moduleName) {
      abilities.push({
        id: ability.abilityId,
        name: ability.meta.abilityName,
        description: ability.meta.description,
      });
    }
  }

  return abilities;
};

