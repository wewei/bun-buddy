import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from '../utils';
import { serviceManager } from '../serviceManager';

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
          spin.succeed(chalk.green('Service is running'));
          
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
      const spin = spinner('Restarting service...');
      spin.start();

      try {
        const result = await serviceManager.restartService();
        
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
        spin.fail(chalk.red('Failed to restart service'));
        console.error(error);
        process.exit(1);
      }
    });

  return server;
}