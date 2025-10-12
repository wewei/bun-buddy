// Model Manager

import { registerModelAbilities } from './abilities';
import { createOpenAIAdapter } from './providers/openai';

import type { AgentBus } from '../types';
import type { ProviderRegistry, ProviderAdapter, ProviderConfig, AdapterType } from './types';

export type ModelManagerConfig = {
  providers: Record<
    string,
    {
      endpoint: string;
      apiKey: string;
      adapterType: AdapterType;
      models: Array<{ type: 'llm' | 'embed'; name: string }>;
    }
  >;
};

export type ModelManager = {
  registry: ProviderRegistry;
  adapters: Map<string, ProviderAdapter>;
};

const createAdapterRegistry = (): Map<string, ProviderAdapter> => {
  const registry = new Map<string, ProviderAdapter>();

  registry.set('openai', createOpenAIAdapter());
  // Add more adapters here (anthropic, custom, etc.)

  return registry;
};

export const createModelManager = (
  config: ModelManagerConfig,
  bus: AgentBus
): ModelManager => {
  const registry: ProviderRegistry = new Map();

  // Build provider registry from config
  for (const [providerName, providerConfig] of Object.entries(config.providers)) {
    const config: ProviderConfig = {
      endpoint: providerConfig.endpoint,
      apiKey: providerConfig.apiKey,
      adapterType: providerConfig.adapterType,
      models: providerConfig.models,
    };
    registry.set(providerName, config);
  }

  const adapters = createAdapterRegistry();

  const manager: ModelManager = {
    registry,
    adapters,
  };

  // Register model abilities
  registerModelAbilities(manager.registry, manager.adapters, bus);

  return manager;
};

export type { ChatMessage, ToolCall, ToolDefinition } from './types';
