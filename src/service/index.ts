import { createServer } from './server/index';

async function main() {
  try {
    const server = await createServer();

    // Keep the process alive by listening to the server
    console.log('Press Ctrl+C to stop the server');

    // Add a simple keep-alive mechanism
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down server gracefully...');
      server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n👋 Shutting down server gracefully...');
      server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (import.meta.main) {
  main();
}