import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from '../utils';
import { userConfigManager } from '../../config/userConfig';

export function createConnectCommand() {
  const connect = new Command('connect')
    .argument('[endpointUrl]', 'Service endpoint URL (defaults to config)')
    .description('Connect to service in interactive mode')
    .action(async (endpointUrl?: string) => {
      try {
        let serviceUrl = endpointUrl;
        if (!serviceUrl) {
          const userConfig = userConfigManager.loadConfig();
          serviceUrl = `http://${userConfig.server.host}:${userConfig.server.port}`;
        }

        console.log(chalk.blue.bold('🔌 Connecting to Bun Buddy Service'));
        console.log(chalk.cyan('URL:'), serviceUrl);
        console.log('');

        // Test connection first
        const spin = spinner('Testing connection...');
        spin.start();

        try {
          const response = await fetch(`${serviceUrl}/`);
          
          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            spin.succeed(chalk.green('Connected successfully!'));
            console.log(chalk.yellow('Interactive mode - Type your messages below:'));
            console.log(chalk.gray('(Press Ctrl+C to exit)'));
            console.log('');

            // Start interactive mode
            await startInteractiveMode(serviceUrl);
          } else {
            spin.fail(chalk.red('Service is not healthy'));
            process.exit(1);
          }
        } catch (error) {
          spin.fail(chalk.red('Failed to connect to service'));
          console.log(chalk.yellow('Make sure the service is running with:'), chalk.cyan('buddy server start'));
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Connection error:'), error);
        process.exit(1);
      }
    });

  return connect;
}

async function startInteractiveMode(serviceUrl: string) {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('> ')
  });

  // Note: SSE implementation would require additional setup in CLI environment
  console.log(chalk.yellow('Note: Real-time messaging will be implemented in future version'));

  rl.prompt();

  rl.on('line', async (input) => {
    const message = input.trim();
    if (message) {
      try {
        const response = await fetch(`${serviceUrl}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        });

        const data = await response.json() as { success: boolean; message?: string };
        if (data.success) {
          console.log(chalk.blue('Sent:'), message);
        } else {
          console.log(chalk.red('Failed to send message:'), data.message);
        }
      } catch (error) {
        console.log(chalk.red('Error sending message:'), error);
      }
    }
    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nDisconnected from service'));
    process.exit(0);
  });
}