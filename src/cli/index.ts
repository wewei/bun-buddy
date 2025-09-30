#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import { createServiceCommands, createDevCommands } from './commands';
import config from '../config';

const program = new Command();

program
  .name(config.cli.name)
  .description(chalk.blue.bold('🦄 Bun Buddy - A dummy service and CLI built with Bun'))
  .version(config.cli.version);

// Add service management commands
program.addCommand(createServiceCommands());

// Add developer utilities
program.addCommand(createDevCommands());

// Quick start command
program
  .command('start')
  .description('Quick start the service (alias for service start)')
  .option('-p, --port <port>', 'Port to run on', config.service.port.toString())
  .option('-h, --host <host>', 'Host to bind to', config.service.host)
  .action(async (options: { port?: string; host?: string }) => {
    try {
      // Set environment flag
      process.env.CLI_SERVICE_START = 'true';

      // Import service dynamically
      const { createServer } = await import('../service/server');

      // Override config with CLI options
      if (options.port) config.service.port = parseInt(options.port);
      if (options.host) config.service.host = options.host;

      console.log(chalk.blue.bold('🦄 Starting Bun Buddy...'));
      await createServer();
    } catch (error) {
      console.error(chalk.red('Failed to start service:'), error);
      process.exit(1);
    }
  });

// Status command (shortcut)
program
  .command('status')
  .description('Check service status (alias for service status)')
  .action(async () => {
    try {
      const response = await fetch(`http://${config.service.host}:${config.service.port}/health`);
      const data = await response.json() as { success: boolean; data?: { uptime: number } };

      if (data.success) {
        console.log(chalk.green('✓ Service is healthy'));
        console.log(chalk.cyan('Uptime:'), data.data?.uptime || 0, 'seconds');
        console.log(chalk.cyan('URL:'), `http://${config.service.host}:${config.service.port}`);
      } else {
        console.log(chalk.red('✗ Service is not healthy'));
      }
    } catch (error) {
      console.log(chalk.red('✗ Service is not running'));
      console.log(chalk.yellow('Tip:'), 'Use', chalk.cyan('bun-buddy start'), 'to start the service');
    }
  });

// Help enhancement
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('  $ bun-buddy start              Start the service on default port');
  console.log('  $ bun-buddy start -p 8080      Start the service on port 8080');
  console.log('  $ bun-buddy status             Check if service is running');
  console.log('  $ bun-buddy service start      Start service with full command');
  console.log('  $ bun-buddy dev info           Show development information');
  console.log('  $ bun-buddy dev test-api       Test all API endpoints');
  console.log('');
  console.log(chalk.cyan('🌐 Visit'), chalk.underline(`http://${config.service.host}:${config.service.port}`), chalk.cyan('when service is running'));
});

// Parse and execute
program.parse();

export default program;