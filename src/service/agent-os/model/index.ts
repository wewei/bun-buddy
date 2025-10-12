// Model Manager

import type { AgentBus } from '../types';
import type { ModelRegistry, ProviderAdapter, ModelInstance } from './types';
import { createOpenAIAdapter } from './providers/openai';
import { registerModelAbilities } from './abilities';

export type ModelManagerConfig = {
  models: ModelInstance[];
  defaultLLM?: string;
  defaultEmbedding?: string;
};

export type ModelManager = {
  registry: ModelRegistry;
  adapters: Map<string, ProviderAdapter>;
};

const createAdapterRegistry = (): Map<string, ProviderAdapter> => {
  const registry = new Map<string, ProviderAdapter>();

  registry.set('openai', createOpenAIAdapter());
  // Add more adapters here (anthropic, custom, etc.)

  return registry;
};

export const createModelManager = (bus: AgentBus): ModelManager => {
  const manager: ModelManager = {
    registry: {
      instances: new Map(),
      defaultLLM: undefined,
      defaultEmbedding: undefined,
    },
    adapters: createAdapterRegistry(),
  };

  // Register model abilities
  registerModelAbilities(manager.registry, manager.adapters, bus);

  return manager;
};

export const initializeModelManager = async (
  config: ModelManagerConfig,
  bus: AgentBus
): Promise<ModelManager> => {
  const manager = createModelManager(bus);

  // Register model instances
  for (const model of config.models) {
    await bus.invoke(
      'system',
      'model:register',
      JSON.stringify({
        ...model,
        setAsDefault: model.id === config.defaultLLM || model.id === config.defaultEmbedding,
      })
    );
  }

  return manager;
};

export type { ModelInstance, ChatMessage, ToolCall, ToolDefinition } from './types';

