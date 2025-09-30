import ora from 'ora';
import chalk from 'chalk';

export function spinner(text: string) {
  return ora({
    text,
    color: 'cyan',
    spinner: 'dots'
  });
}

export function logSuccess(message: string) {
  console.log(chalk.green('✓'), message);
}

export function logError(message: string) {
  console.log(chalk.red('✗'), message);
}

export function logInfo(message: string) {
  console.log(chalk.blue('ℹ'), message);
}

export function logWarning(message: string) {
  console.log(chalk.yellow('⚠'), message);
}