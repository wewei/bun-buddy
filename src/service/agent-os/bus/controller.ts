// Bus Controller Abilities - Self-hosted introspection

import { listModules, listAbilitiesForModule, getAbility } from './registry';

import type { AgentBus, AbilityMeta } from '../types';
import type { BusState } from './types';

const registerListAbility = (state: BusState, bus: AgentBus): void => {
  const listMeta: AbilityMeta = {
    id: 'bus:list',
    moduleName: 'bus',
    abilityName: 'list',
    description: 'List all registered modules',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    outputSchema: {
      type: 'object',
      properties: {
        modules: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              abilityCount: { type: 'number' },
            },
          },
        },
      },
      required: ['modules'],
    },
  };

  bus.register(listMeta, async (taskId: string) => {
    void taskId; // Parameter required by handler signature but not used
    const modules = listModules(state);
    return JSON.stringify({ modules });
  });
};

const registerAbilitiesAbility = (state: BusState, bus: AgentBus): void => {
  const abilitiesMeta: AbilityMeta = {
    id: 'bus:abilities',
    moduleName: 'bus',
    abilityName: 'abilities',
    description: 'List all abilities for a given module',
    inputSchema: {
      type: 'object',
      properties: {
        moduleName: {
          type: 'string',
          description: 'Name of the module',
        },
      },
      required: ['moduleName'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        moduleName: { type: 'string' },
        abilities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
        },
      },
      required: ['moduleName', 'abilities'],
    },
  };

  bus.register(abilitiesMeta, async (_taskId: string, input: string) => {
    const { moduleName } = JSON.parse(input);
    const abilities = listAbilitiesForModule(state, moduleName);
    return JSON.stringify({ moduleName, abilities });
  });
};

const registerSchemaAbility = (state: BusState, bus: AgentBus): void => {
  const schemaMeta: AbilityMeta = {
    id: 'bus:schema',
    moduleName: 'bus',
    abilityName: 'schema',
    description: 'Get input and output schemas for an ability',
    inputSchema: {
      type: 'object',
      properties: {
        abilityId: {
          type: 'string',
          description: 'Ability ID',
        },
      },
      required: ['abilityId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        abilityId: { type: 'string' },
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
      required: ['abilityId', 'inputSchema', 'outputSchema'],
    },
  };

  bus.register(schemaMeta, async (_taskId: string, input: string) => {
    const { abilityId } = JSON.parse(input);
    const ability = getAbility(state, abilityId);

    if (!ability) {
      throw new Error(`Ability not found: ${abilityId}`);
    }

    return JSON.stringify({
      abilityId,
      inputSchema: ability.meta.inputSchema,
      outputSchema: ability.meta.outputSchema,
    });
  });
};

const registerInspectAbility = (state: BusState, bus: AgentBus): void => {
  const inspectMeta: AbilityMeta = {
    id: 'bus:inspect',
    moduleName: 'bus',
    abilityName: 'inspect',
    description: 'Get full metadata for an ability',
    inputSchema: {
      type: 'object',
      properties: {
        abilityId: {
          type: 'string',
          description: 'Ability ID',
        },
      },
      required: ['abilityId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        meta: { type: 'object' },
      },
      required: ['meta'],
    },
  };

  bus.register(inspectMeta, async (_taskId: string, input: string) => {
    const { abilityId } = JSON.parse(input);
    const ability = getAbility(state, abilityId);

    if (!ability) {
      throw new Error(`Ability not found: ${abilityId}`);
    }

    return JSON.stringify({ meta: ability.meta });
  });
};

export const registerBusControllerAbilities = (state: BusState, bus: AgentBus): void => {
  registerListAbility(state, bus);
  registerAbilitiesAbility(state, bus);
  registerSchemaAbility(state, bus);
  registerInspectAbility(state, bus);
};
