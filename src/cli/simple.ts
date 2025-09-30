#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import config from '../config';

const program = new Command();

program
  .name(config.cli.name)
  .description(chalk.blue.bold('🦄 Bun Buddy - A dummy service and CLI built with Bun'))
  .version(config.cli.version);

// Status command (no service imports)
program
  .command('status')
  .description('Check service status')
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
      console.log(chalk.yellow('Tip:'), 'Use', chalk.cyan('bun run service'), 'to start the service');
    }
  });

// Dev info command (no service imports)
program
  .command('dev-info')
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

// Test API endpoints (no service imports)
program
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
      const spinner = ora(`Testing ${endpoint.method} ${endpoint.path}`).start();

      try {
        const response = await fetch(`${baseUrl}${endpoint.path}`);
        const data = await response.json() as { success: boolean };

        if (response.ok && data.success) {
          spinner.succeed(chalk.green(`${endpoint.method} ${endpoint.path} - OK`));
        } else {
          spinner.fail(chalk.red(`${endpoint.method} ${endpoint.path} - Failed`));
        }
      } catch (error) {
        spinner.fail(chalk.red(`${endpoint.method} ${endpoint.path} - Error`));
      }
    }
  });

// Help enhancement
program.on('--help', () => {
  console.log('');
  console.log(chalk.yellow('Examples:'));
  console.log('  $ bun-buddy status             Check if service is running');
  console.log('  $ bun-buddy dev-info           Show development information');
  console.log('  $ bun-buddy test-api           Test all API endpoints');
  console.log('');
  console.log(chalk.blue('Service Management:'));
  console.log('  $ bun run service              Start the service');
  console.log('  $ bun run cli                  Use this CLI tool');
  console.log('');
  console.log(chalk.cyan('🌐 Visit'), chalk.underline(`http://${config.service.host}:${config.service.port}`), chalk.cyan('when service is running'));
});

// Parse and execute
program.parse();

export default program;