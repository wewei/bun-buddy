import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from './utils';
import config from '../config';
import { userConfigManager } from '../config/userConfig';
import { serviceManager } from './serviceManager';

// Service related commands
export function createServerCommands() {
  const server = new Command('server')
    .description('Service management commands');

  server
    .command('start')
    .description('Start the Bun Buddy service in background')
    .option('-p, --port <port>', 'Port to run on')
    .option('-h, --host <host>', 'Host to bind to')
    .action(async (options: { port?: string; host?: string }) => {
      const spin = spinner('Starting service...');
      spin.start();

      try {
        const serviceHost = options.host;
        const servicePort = options.port ? parseInt(options.port) : undefined;

        const result = await serviceManager.startService(serviceHost, servicePort);
        
        if (result.success) {
          spin.succeed(chalk.green(result.message));
          if (result.pid) {
            console.log(chalk.cyan('PID:'), result.pid);
          }
        } else {
          spin.fail(chalk.red(result.message));
          process.exit(1);
        }
      } catch (error) {
        spin.fail(chalk.red('Failed to start service'));
        console.error(error);
        process.exit(1);
      }
    });

  server
    .command('state')
    .alias('status')
    .description('Check service status')
    .action(async () => {
      const spin = spinner('Checking service status...');
      spin.start();

      try {
        const status = await serviceManager.getServiceStatus();
        
        if (status.isRunning && status.info) {
          if (status.healthy) {
            spin.succeed(chalk.green('Service is running and healthy'));
          } else {
            spin.warn(chalk.yellow('Service is running but not responding'));
          }
          
          console.log(chalk.cyan('PID:'), status.info.pid);
          console.log(chalk.cyan('Host:'), status.info.host);
          console.log(chalk.cyan('Port:'), status.info.port);
          console.log(chalk.cyan('Started:'), new Date(status.info.startTime).toLocaleString());
          console.log(chalk.cyan('URL:'), `http://${status.info.host}:${status.info.port}`);
        } else {
          spin.fail(chalk.red('Service is not running'));
          console.log(chalk.yellow('Tip:'), 'Use', chalk.cyan('buddy server start'), 'to start the service');
        }
      } catch (error) {
        spin.fail(chalk.red('Error checking service status'));
        console.error(error);
      }
    });

  server
    .command('stop')
    .description('Stop the service')
    .action(async () => {
      const spin = spinner('Stopping service...');
      spin.start();

      try {
        const result = await serviceManager.stopService();
        
        if (result.success) {
          spin.succeed(chalk.green(result.message));
        } else {
          spin.fail(chalk.red(result.message));
        }
      } catch (error) {
        spin.fail(chalk.red('Error stopping service'));
        console.error(error);
      }
    });

  server
    .command('restart')
    .description('Restart the service')
    .action(async () => {
      console.log(chalk.blue('Restarting service...'));
      
      // Try to stop first
      console.log(chalk.yellow('Stopping existing service...'));
      const stopResult = await serviceManager.stopService();
      if (stopResult.success) {
        console.log(chalk.green(stopResult.message));
      } else {
        console.log(chalk.yellow(stopResult.message));
      }

      // Wait a moment for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Start the service
      const spin = spinner('Starting service...');
      spin.start();

      try {
        const startResult = await serviceManager.startService();
        
        if (startResult.success) {
          spin.succeed(chalk.green('Service restarted successfully!'));
          if (startResult.pid) {
            console.log(chalk.cyan('PID:'), startResult.pid);
          }
        } else {
          spin.fail(chalk.red(startResult.message));
          process.exit(1);
        }
      } catch (error) {
        spin.fail(chalk.red('Failed to restart service'));
        console.error(error);
        process.exit(1);
      }
    });

  return server;
}

// Config management commands
export function createConfigCommands() {
  const configCmd = new Command('config')
    .description('Configuration management commands');

  configCmd
    .command('get')
    .argument('[keyPath]', 'Configuration key path (e.g., server.host)')
    .description('Get configuration value')
    .action((keyPath?: string) => {
      try {
        if (keyPath) {
          const value = userConfigManager.getConfigValue(keyPath);
          if (value !== undefined) {
            console.log(chalk.cyan(keyPath + ':'), value);
          } else {
            console.log(chalk.red('Configuration key not found:'), keyPath);
            process.exit(1);
          }
        } else {
          const config = userConfigManager.loadConfig();
          console.log(chalk.blue.bold('Current Configuration:'));
          console.log(JSON.stringify(config, null, 2));
        }
      } catch (error) {
        console.error(chalk.red('Failed to get configuration:'), error);
        process.exit(1);
      }
    });

  configCmd
    .command('set')
    .argument('<keyPath>', 'Configuration key path (e.g., server.host)')
    .argument('<value>', 'Configuration value')
    .description('Set configuration value')
    .action((keyPath: string, value: string) => {
      try {
        // Try to parse as number if it looks like a number
        let parsedValue: any = value;
        if (/^\d+$/.test(value)) {
          parsedValue = parseInt(value);
        } else if (/^\d+\.\d+$/.test(value)) {
          parsedValue = parseFloat(value);
        } else if (value.toLowerCase() === 'true') {
          parsedValue = true;
        } else if (value.toLowerCase() === 'false') {
          parsedValue = false;
        }

        userConfigManager.setConfigValue(keyPath, parsedValue);
        console.log(chalk.green('Configuration updated:'), chalk.cyan(keyPath), '=', parsedValue);
      } catch (error) {
        console.error(chalk.red('Failed to set configuration:'), error);
        process.exit(1);
      }
    });

  return configCmd;
}

// Connect command
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