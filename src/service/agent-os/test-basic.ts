// Basic functionality test for Agent OS

import { createAgentOS } from './index';

const testBasicFunctionality = async () => {
  console.log('🧪 Testing Agent OS Basic Functionality\n');

  // Create Agent OS
  console.log('1. Creating Agent OS...');
  const agentOS = await createAgentOS({
    port: 3001, // Use different port for testing
    models: {
      models: [
        {
          id: 'gpt4-test',
          type: 'llm',
          provider: 'openai',
          endpoint: 'https://api.openai.com/v1',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
        },
      ],
      defaultLLM: 'gpt4-test',
    },
  });

  console.log('✓ Agent OS created\n');

  // Test Bus abilities
  console.log('2. Testing Bus abilities...');
  const modules = await agentOS.bus.invoke('test', 'bus:list', '{}');
  const modulesData = JSON.parse(modules);
  console.log('✓ Modules:', modulesData.modules.map((m: any) => m.name).join(', '));

  // Test Model Manager
  console.log('\n3. Testing Model Manager...');
  const models = await agentOS.bus.invoke('test', 'model:list', '{}');
  const modelsData = JSON.parse(models);
  console.log('✓ Models:', modelsData.models.map((m: any) => `${m.id} (${m.provider})`).join(', '));

  // Test Task Manager
  console.log('\n4. Testing Task Manager...');
  const spawnResult = await agentOS.bus.invoke(
    'test',
    'task:spawn',
    JSON.stringify({
      goal: 'Test task - say hello',
    })
  );
  const spawnData = JSON.parse(spawnResult);
  console.log('✓ Task created:', spawnData.taskId);

  // Wait a bit for task to start
  await new Promise((resolve) => setTimeout(resolve, 1000));

  // Check active tasks
  const activeTasks = await agentOS.bus.invoke('test', 'task:active', '{}');
  const activeData = JSON.parse(activeTasks);
  console.log('✓ Active tasks:', activeData.tasks.length);

  console.log('\n✅ Basic functionality tests passed!\n');

  // Note: We don't start the server in tests, just verify initialization
  console.log('Note: Server not started in test mode');
  console.log('To run the full system, use example.ts');

  process.exit(0);
};

// Run test
testBasicFunctionality().catch((error) => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});

