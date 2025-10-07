#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import { createServerCommands, createConfigCommands, createListenCommand, createSendCommand } from './commands/';

const program = new Command();

program
  .name('buddy')
  .description(chalk.blue.bold('� Bun Buddy - AI Agent toolkit built with Bun'))
  .version('1.0.0');

// Add server management commands
program.addCommand(createServerCommands());

// Add config management commands
program.addCommand(createConfigCommands());

// Add listen command
program.addCommand(createListenCommand());

// Add send command
program.addCommand(createSendCommand());

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
  console.log('  $ buddy listen                 Listen to SSE messages from service');
  console.log('  $ buddy listen --url http://example.com  Listen from remote service');
  console.log('  $ buddy send "hello"           Send a message to service');
  console.log('  $ buddy send "hello" --url http://example.com  Send to remote service');
  console.log('');
  console.log(chalk.cyan('📋 Configuration keys:'));
  console.log('  server.host                    Service host (default: localhost)');
  console.log('  server.port                    Service port (default: 3000)');
});

// Parse and execute
program.parse();

export default program;