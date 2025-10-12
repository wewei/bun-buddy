// Bus Controller Abilities - Self-hosted introspection

import { z } from 'zod';

import { listModules, listAbilitiesForModule, getAbility } from './registry';

import type { AgentBus, AbilityMeta, AbilityResult } from '../types';
import type { BusState } from './types';

const registerListAbility = (state: BusState, bus: AgentBus): void => {
  const inputSchema = z.object({});
  
  const outputSchema = z.object({
    modules: z.array(z.object({
      name: z.string(),
      abilityCount: z.number(),
    })),
  });

  const listMeta: AbilityMeta = {
    id: 'bus:list',
    moduleName: 'bus',
    abilityName: 'list',
    description: 'List all registered modules',
    inputSchema,
    outputSchema,
  };

  bus.register(listMeta, async (): Promise<AbilityResult<string, string>> => {
    try {
      const modules = listModules(state);
      return { 
        type: 'success', 
        result: JSON.stringify({ modules }) 
      };
    } catch (error) {
      return { 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });
};

const registerAbilitiesAbility = (state: BusState, bus: AgentBus): void => {
  const inputSchema = z.object({
    moduleName: z.string().describe('Name of the module'),
  });
  
  const outputSchema = z.object({
    moduleName: z.string(),
    abilities: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
    })),
  });

  const abilitiesMeta: AbilityMeta = {
    id: 'bus:abilities',
    moduleName: 'bus',
    abilityName: 'abilities',
    description: 'List all abilities for a given module',
    inputSchema,
    outputSchema,
  };

  bus.register(abilitiesMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { moduleName } = JSON.parse(input);
      const abilities = listAbilitiesForModule(state, moduleName);
      return { 
        type: 'success', 
        result: JSON.stringify({ moduleName, abilities }) 
      };
    } catch (error) {
      return { 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });
};

const registerSchemaAbility = (state: BusState, bus: AgentBus): void => {
  const inputSchema = z.object({
    abilityId: z.string().describe('Ability ID'),
  });
  
  const outputSchema = z.object({
    abilityId: z.string(),
    inputSchema: z.any(),
    outputSchema: z.any(),
  });

  const schemaMeta: AbilityMeta = {
    id: 'bus:schema',
    moduleName: 'bus',
    abilityName: 'schema',
    description: 'Get input and output schemas for an ability',
    inputSchema,
    outputSchema,
  };

  bus.register(schemaMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { abilityId } = JSON.parse(input);
      const ability = getAbility(state, abilityId);

      if (!ability) {
        return { 
          type: 'error', 
          error: `Ability not found: ${abilityId}` 
        };
      }

      return { 
        type: 'success', 
        result: JSON.stringify({
          abilityId,
          inputSchema: ability.meta.inputSchema,
          outputSchema: ability.meta.outputSchema,
        })
      };
    } catch (error) {
      return { 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });
};

const registerInspectAbility = (state: BusState, bus: AgentBus): void => {
  const inputSchema = z.object({
    abilityId: z.string().describe('Ability ID'),
  });
  
  const outputSchema = z.object({
    meta: z.any(),
  });

  const inspectMeta: AbilityMeta = {
    id: 'bus:inspect',
    moduleName: 'bus',
    abilityName: 'inspect',
    description: 'Get full metadata for an ability',
    inputSchema,
    outputSchema,
  };

  bus.register(inspectMeta, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { abilityId } = JSON.parse(input);
      const ability = getAbility(state, abilityId);

      if (!ability) {
        return { 
          type: 'error', 
          error: `Ability not found: ${abilityId}` 
        };
      }

      return { 
        type: 'success', 
        result: JSON.stringify({ meta: ability.meta }) 
      };
    } catch (error) {
      return { 
        type: 'error', 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  });
};

export const registerBusControllerAbilities = (state: BusState, bus: AgentBus): void => {
  registerListAbility(state, bus);
  registerAbilitiesAbility(state, bus);
  registerSchemaAbility(state, bus);
  registerInspectAbility(state, bus);
};
