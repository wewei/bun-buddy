import { createServer } from './src/service/server';
import { configUpdatable } from './src/config';

async function main() {
  console.log('🦄 Bun Buddy - Starting in service mode...');

  try {
    await createServer();
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Only run server if this is the main module and not in CLI mode
if (import.meta.main && !process.env.CLI_MODE) {
  main();
}