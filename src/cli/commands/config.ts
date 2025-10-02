import { Command } from 'commander';
import chalk from 'chalk';
import { userConfigManager } from '../../config/userConfig';

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