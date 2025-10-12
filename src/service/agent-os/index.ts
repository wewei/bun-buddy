// Agent OS - Main Entry Point

import { createAgentBus, type AgentBus } from './bus';
import { createMockLedger, registerLedgerAbilities, type Ledger } from './ledger';
import {
  initializeModelManager,
  type ModelManager,
  type ModelManagerConfig,
} from './model';
import { createShell, type Shell } from './shell';
import { createTaskManager, type TaskManager } from './task';

export type AgentOSConfig = {
  port?: number;
  models: ModelManagerConfig;
};

export type AgentOS = {
  bus: AgentBus;
  ledger: Ledger;
  modelManager: ModelManager;
  taskManager: TaskManager;
  shell: Shell;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

const verifyDependencies = (bus: AgentBus): void => {
  const required = [
    // Ledger abilities
    'ldg:task:save',
    'ldg:task:get',
    'ldg:msg:save',
    'ldg:msg:list',
    // Model abilities
    'model:llm',
    'model:register',
    // Task abilities
    'task:spawn',
    'task:send',
    // Shell abilities
    'shell:send',
    // Bus abilities
    'bus:list',
  ];

  for (const abilityId of required) {
    if (!bus.has(abilityId)) {
      throw new Error(`Required ability not registered: ${abilityId}`);
    }
  }

  console.log('✓ All required abilities verified');
};

export const createAgentOS = async (config: AgentOSConfig): Promise<AgentOS> => {
  console.log('Creating Agent OS...');

  // 1. Create Agent Bus
  console.log('- Creating Agent Bus...');
  const bus = createAgentBus();

  // 2. Create and register Ledger (Mock)
  console.log('- Creating Mock Ledger...');
  const ledger = createMockLedger();
  registerLedgerAbilities(ledger, bus);

  // 3. Create and initialize Model Manager
  console.log('- Creating Model Manager...');
  const modelManager = await initializeModelManager(config.models, bus);

  // 4. Create Shell
  console.log('- Creating Shell...');
  const shell = createShell(bus);

  // 5. Create Task Manager
  console.log('- Creating Task Manager...');
  const taskManager = createTaskManager(bus);

  // 6. Verify all dependencies
  console.log('- Verifying dependencies...');
  verifyDependencies(bus);

  console.log('✓ Agent OS created successfully');

  const start = async (): Promise<void> => {
    const port = config.port || 3000;
    console.log(`\nStarting Agent OS on port ${port}...`);
    await shell.start(port);
    console.log('✓ Agent OS started');
  };

  const stop = async (): Promise<void> => {
    console.log('\nStopping Agent OS...');
    await shell.stop();
    console.log('✓ Agent OS stopped');
  };

  return {
    bus,
    ledger,
    modelManager,
    taskManager,
    shell,
    start,
    stop,
  };
};

// Export types
export type { AgentBus } from './bus';
export type { Ledger } from './ledger';
export type { ModelManager, ModelInstance, ModelManagerConfig } from './model';
export type { TaskManager } from './task';
export type { Shell } from './shell';
export type { Task, Call, Message, MessageRole, CallStatus } from './types';

