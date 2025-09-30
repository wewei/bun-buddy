import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from './utils';
import config from '../config';

// Service related commands
export function createServiceCommands() {
  const service = new Command('service')
    .description('Service management commands')
    .alias('svc');

  service
    .command('start')
    .description('Start the Bun Buddy service')
    .option('-p, --port <port>', 'Port to run on', config.service.port.toString())
    .option('-h, --host <host>', 'Host to bind to', config.service.host)
    .action(async (options: { port?: string; host?: string }) => {
      const spin = spinner('Starting service...');
      spin.start();

      try {
        // Set CLI mode to prevent auto-start in other modules
        process.env.CLI_SERVICE_START = 'true';

        // Import service dynamically to avoid loading it unless needed
        const { createServer } = await import('../service/server');

        // Override config with CLI options
        if (options.port) config.service.port = parseInt(options.port);
        if (options.host) config.service.host = options.host;

        await createServer();
        spin.succeed(chalk.green('Service started successfully!'));
      } catch (error) {
        spin.fail(chalk.red('Failed to start service'));
        console.error(error);
        process.exit(1);
      }
    });

  service
    .command('status')
    .description('Check service status')
    .action(async () => {
      const spin = spinner('Checking service status...');
      spin.start();

      try {
        const response = await fetch(`http://${config.service.host}:${config.service.port}/health`);
        const data = await response.json() as { success: boolean; data?: { uptime: number } };

        if (data.success) {
          spin.succeed(chalk.green('Service is healthy'));
          console.log(chalk.cyan('Uptime:'), data.data?.uptime || 0, 'seconds');
        } else {
          spin.fail(chalk.red('Service is not healthy'));
        }
      } catch (error) {
        spin.fail(chalk.red('Service is not running'));
        console.log(chalk.yellow('Tip:'), 'Use', chalk.cyan('bun-buddy service start'), 'to start the service');
      }
    });

  return service;
}

// Developer utility commands
export function createDevCommands() {
  const dev = new Command('dev')
    .description('Developer utilities');

  dev
    .command('info')
    .description('Show development information')
    .action(() => {
      console.log(chalk.blue.bold('🦄 Bun Buddy Development Info'));
      console.log('');
      console.log(chalk.cyan('Project:'), config.cli.name);
      console.log(chalk.cyan('Version:'), config.cli.version);
      console.log(chalk.cyan('Service URL:'), `http://${config.service.host}:${config.service.port}`);
      console.log(chalk.cyan('Bun Version:'), Bun.version);
      console.log('');
      console.log(chalk.yellow('Available endpoints:'));
      console.log('  GET  /', chalk.gray('- Welcome message'));
      console.log('  GET  /health', chalk.gray('- Health check'));
      console.log('  GET  /api/info', chalk.gray('- API information'));
      console.log('  GET  /api/users', chalk.gray('- List all users'));
      console.log('  GET  /api/users/:id', chalk.gray('- Get user by ID'));
      console.log('  POST /api/echo', chalk.gray('- Echo request body'));
    });

  dev
    .command('test-api')
    .description('Test API endpoints')
    .action(async () => {
      const baseUrl = `http://${config.service.host}:${config.service.port}`;

      console.log(chalk.blue.bold('🧪 Testing API Endpoints'));
      console.log('');

      const endpoints = [
        { method: 'GET', path: '/health', description: 'Health check' },
        { method: 'GET', path: '/api/info', description: 'API info' },
        { method: 'GET', path: '/api/users', description: 'List users' },
        { method: 'GET', path: '/api/users/1', description: 'Get user by ID' }
      ];

      for (const endpoint of endpoints) {
        const spin = spinner(`Testing ${endpoint.method} ${endpoint.path}`);
        spin.start();

        try {
          const response = await fetch(`${baseUrl}${endpoint.path}`);
          const data = await response.json() as { success: boolean };

          if (response.ok && data.success) {
            spin.succeed(chalk.green(`${endpoint.method} ${endpoint.path} - OK`));
          } else {
            spin.fail(chalk.red(`${endpoint.method} ${endpoint.path} - Failed`));
          }
        } catch (error) {
          spin.fail(chalk.red(`${endpoint.method} ${endpoint.path} - Error`));
        }
      }
    });

  return dev;
}