// Bus Controller Abilities - Self-hosted introspection

import { z } from 'zod';

import { listModules, listAbilitiesForModule, getAbility } from './registry';

import type { AgentBus, AbilityMeta } from '../types';
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

// Type inference from schemas
type BusListInput = z.infer<typeof BUS_LIST_INPUT_SCHEMA>;
type BusListOutput = z.infer<typeof BUS_LIST_OUTPUT_SCHEMA>;
type BusAbilitiesInput = z.infer<typeof BUS_ABILITIES_INPUT_SCHEMA>;
type BusAbilitiesOutput = z.infer<typeof BUS_ABILITIES_OUTPUT_SCHEMA>;
type BusSchemaInput = z.infer<typeof BUS_SCHEMA_INPUT_SCHEMA>;
type BusSchemaOutput = z.infer<typeof BUS_SCHEMA_OUTPUT_SCHEMA>;
type BusInspectInput = z.infer<typeof BUS_INSPECT_INPUT_SCHEMA>;
type BusInspectOutput = z.infer<typeof BUS_INSPECT_OUTPUT_SCHEMA>;

// Meta definitions
const BUS_LIST_META: AbilityMeta<BusListInput, BusListOutput> = {
  id: 'bus:list',
  moduleName: 'bus',
  abilityName: 'list',
  description: 'List all registered modules',
  inputSchema: BUS_LIST_INPUT_SCHEMA,
  outputSchema: BUS_LIST_OUTPUT_SCHEMA,
};

const BUS_ABILITIES_META: AbilityMeta<BusAbilitiesInput, BusAbilitiesOutput> = {
  id: 'bus:abilities',
  moduleName: 'bus',
  abilityName: 'abilities',
  description: 'List all abilities for a given module',
  inputSchema: BUS_ABILITIES_INPUT_SCHEMA,
  outputSchema: BUS_ABILITIES_OUTPUT_SCHEMA,
};

const BUS_SCHEMA_META: AbilityMeta<BusSchemaInput, BusSchemaOutput> = {
  id: 'bus:schema',
  moduleName: 'bus',
  abilityName: 'schema',
  description: 'Get input and output schemas for an ability',
  inputSchema: BUS_SCHEMA_INPUT_SCHEMA,
  outputSchema: BUS_SCHEMA_OUTPUT_SCHEMA,
};

const BUS_INSPECT_META: AbilityMeta<BusInspectInput, BusInspectOutput> = {
  id: 'bus:inspect',
  moduleName: 'bus',
  abilityName: 'inspect',
  description: 'Get full metadata for an ability',
  inputSchema: BUS_INSPECT_INPUT_SCHEMA,
  outputSchema: BUS_INSPECT_OUTPUT_SCHEMA,
};

const registerListAbility = (state: BusState, bus: AgentBus): void => {
  bus.register(BUS_LIST_META, async () => {
    const modules = listModules(state);
    return { type: 'success', result: { modules } };
  });
};

const registerAbilitiesAbility = (state: BusState, bus: AgentBus): void => {
  bus.register(BUS_ABILITIES_META, async (_taskId, input: BusAbilitiesInput) => {
    const abilities = listAbilitiesForModule(state, input.moduleName);
    return { type: 'success', result: { moduleName: input.moduleName, abilities } };
  });
};

const registerSchemaAbility = (state: BusState, bus: AgentBus): void => {
  bus.register(BUS_SCHEMA_META, async (_taskId, input: BusSchemaInput) => {
    const ability = getAbility(state, input.abilityId);

    if (!ability) {
      return { 
        type: 'error', 
        error: `Ability not found: ${input.abilityId}` 
      };
    }

    return { 
      type: 'success', 
      result: {
        abilityId: input.abilityId,
        inputSchema: ability.meta.inputSchema,
        outputSchema: ability.meta.outputSchema,
      }
    };
  });
};

const registerInspectAbility = (state: BusState, bus: AgentBus): void => {
  bus.register(BUS_INSPECT_META, async (_taskId, input: BusInspectInput) => {
    const ability = getAbility(state, input.abilityId);

    if (!ability) {
      return { 
        type: 'error', 
        error: `Ability not found: ${input.abilityId}` 
      };
    }

    return { 
      type: 'success', 
      result: { meta: ability.meta } 
    };
  });
};

export const registerBusControllerAbilities = (state: BusState, bus: AgentBus): void => {
  registerListAbility(state, bus);
  registerAbilitiesAbility(state, bus);
  registerSchemaAbility(state, bus);
  registerInspectAbility(state, bus);
};
