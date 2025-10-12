// Example: Starting Agent OS

import { createAgentOS, type AgentOSConfig } from './index';

const config: AgentOSConfig = {
  port: 3000,
  models: {
    models: [
      {
        id: 'gpt4',
        type: 'llm',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 4096,
      },
    ],
    defaultLLM: 'gpt4',
  },
};

const main = async () => {
  const agentOS = await createAgentOS(config);
  await agentOS.start();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nReceived SIGINT, shutting down gracefully...');
    await agentOS.stop();
    process.exit(0);
  });
};

main().catch((error) => {
  console.error('Failed to start Agent OS:', error);
  process.exit(1);
});

