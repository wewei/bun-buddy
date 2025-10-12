// Bus-specific types

import type { RegisteredAbility, CallLogEntry } from '../types';

export type BusState = {
  abilities: Map<string, RegisteredAbility>;
  callLog: CallLogEntry[];
};

export type BusError = {
  code: 'NOT_FOUND' | 'INVALID_INPUT' | 'EXECUTION_ERROR' | 'ALREADY_REGISTERED';
  message: string;
  abilityId?: string;
  details?: unknown;
};

