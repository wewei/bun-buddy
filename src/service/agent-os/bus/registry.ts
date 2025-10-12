// Ability Registry

import type { AbilityMeta, AbilityHandler, RegisteredAbility } from '../types';
import type { BusState } from './types';

export const registerAbility = (
  state: BusState,
  meta: AbilityMeta,
  handler: AbilityHandler
): void => {
  if (state.abilities.has(meta.id)) {
    throw new Error(`Ability already registered: ${meta.id}`);
  }
  state.abilities.set(meta.id, { meta, handler });
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
        id: ability.meta.id,
        name: ability.meta.abilityName,
        description: ability.meta.description,
      });
    }
  }

  return abilities;
};

