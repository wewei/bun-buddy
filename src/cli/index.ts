#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import { createServerCommands, createConfigCommands, createConnectCommand } from './commands/';
import config from '../config';

const program = new Command();

program
  .name('buddy')
  .description(chalk.blue.bold('� Bun Buddy - AI Agent toolkit built with Bun'))
  .version(config.cli.version);

// Add server management commands
program.addCommand(createServerCommands());

// Add config management commands
program.addCommand(createConfigCommands());

// Add connect command
program.addCommand(createConnectCommand());

// Help enhancement
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('  $ buddy server start           Start the service');
  console.log('  $ buddy server start -p 8080   Start on custom port');
  console.log('  $ buddy server state           Check service status');
  console.log('  $ buddy server stop            Stop the service');
  console.log('  $ buddy server restart         Restart the service');
  console.log('');
  console.log('  $ buddy config get             Show all configuration');
  console.log('  $ buddy config get server.host Get specific config value');
  console.log('  $ buddy config set server.port 8080  Set config value');
  console.log('');
  console.log('  $ buddy connect                Connect to local service');
  console.log('  $ buddy connect http://example.com  Connect to remote service');
  console.log('');
  console.log(chalk.cyan('📋 Configuration keys:'));
  console.log('  server.host                    Service host (default: localhost)');
  console.log('  server.port                    Service port (default: 3000)');
});

// Parse and execute
program.parse();

export default program;