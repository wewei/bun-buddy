// Bus Controller Abilities - Self-hosted introspection

import { z } from 'zod';

import { listModules, listAbilitiesForModule, getAbility } from './registry';

import type { AgentBus, AbilityMeta, AbilityResult } from '../types';
import type { BusState } from './types';

// Schema definitions
const BUS_LIST_INPUT_SCHEMA = z.object({});

const BUS_LIST_OUTPUT_SCHEMA = z.object({
  modules: z.array(z.object({
    name: z.string(),
    abilityCount: z.number(),
  })),
});

const BUS_ABILITIES_INPUT_SCHEMA = z.object({
  moduleName: z.string().describe('Name of the module'),
});

const BUS_ABILITIES_OUTPUT_SCHEMA = z.object({
  moduleName: z.string(),
  abilities: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  })),
});

const BUS_SCHEMA_INPUT_SCHEMA = z.object({
  abilityId: z.string().describe('Ability ID'),
});

const BUS_SCHEMA_OUTPUT_SCHEMA = z.object({
  abilityId: z.string(),
  inputSchema: z.any(),
  outputSchema: z.any(),
});

const BUS_INSPECT_INPUT_SCHEMA = z.object({
  abilityId: z.string().describe('Ability ID'),
});

const BUS_INSPECT_OUTPUT_SCHEMA = z.object({
  meta: z.any(),
});

// Meta definitions
const BUS_LIST_META: AbilityMeta = {
  id: 'bus:list',
  moduleName: 'bus',
  abilityName: 'list',
  description: 'List all registered modules',
  inputSchema: BUS_LIST_INPUT_SCHEMA,
  outputSchema: BUS_LIST_OUTPUT_SCHEMA,
};

const BUS_ABILITIES_META: AbilityMeta = {
  id: 'bus:abilities',
  moduleName: 'bus',
  abilityName: 'abilities',
  description: 'List all abilities for a given module',
  inputSchema: BUS_ABILITIES_INPUT_SCHEMA,
  outputSchema: BUS_ABILITIES_OUTPUT_SCHEMA,
};

const BUS_SCHEMA_META: AbilityMeta = {
  id: 'bus:schema',
  moduleName: 'bus',
  abilityName: 'schema',
  description: 'Get input and output schemas for an ability',
  inputSchema: BUS_SCHEMA_INPUT_SCHEMA,
  outputSchema: BUS_SCHEMA_OUTPUT_SCHEMA,
};

const BUS_INSPECT_META: AbilityMeta = {
  id: 'bus:inspect',
  moduleName: 'bus',
  abilityName: 'inspect',
  description: 'Get full metadata for an ability',
  inputSchema: BUS_INSPECT_INPUT_SCHEMA,
  outputSchema: BUS_INSPECT_OUTPUT_SCHEMA,
};

const registerListAbility = (state: BusState, bus: AgentBus): void => {
  bus.register(BUS_LIST_META, async (): Promise<AbilityResult<string, string>> => {
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
  bus.register(BUS_ABILITIES_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { moduleName } = BUS_ABILITIES_INPUT_SCHEMA.parse(JSON.parse(input));
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
  bus.register(BUS_SCHEMA_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { abilityId } = BUS_SCHEMA_INPUT_SCHEMA.parse(JSON.parse(input));
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
  bus.register(BUS_INSPECT_META, async (_taskId: string, input: string): Promise<AbilityResult<string, string>> => {
    try {
      const { abilityId } = BUS_INSPECT_INPUT_SCHEMA.parse(JSON.parse(input));
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
