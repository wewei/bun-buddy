// Example: Starting Agent OS

import { createAgentOS, type AgentOSConfig } from './index';

const config: AgentOSConfig = {
  port: 3000,
  models: {
    providers: {
      'openai-main': {
        endpoint: 'https://api.openai.com/v1',
        apiKey: process.env.OPENAI_API_KEY || '',
        adapterType: 'openai',
        models: [
          { type: 'llm', name: 'gpt-4-turbo-preview' },
          { type: 'llm', name: 'gpt-3.5-turbo' },
          { type: 'embed', name: 'text-embedding-3-small' },
          { type: 'embed', name: 'text-embedding-3-large' },
        ],
      },
    },
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

