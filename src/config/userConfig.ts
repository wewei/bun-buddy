import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { type Endpoint } from './index';

export interface UserConfig {
  server: {
    host: string;
    port: number;
  };
  llm: {
    endpoints: Record<string, Endpoint>;
    current: string;
  };
}

const DEFAULT_CONFIG: UserConfig = {
  server: {
    host: 'localhost',
    port: 3000
  },
  llm: {
    endpoints: {
      openai: {
        url: 'https://api.openai.com/v1',
        key: '',
        model: 'gpt-4'
      },
      claude: {
        url: 'https://api.anthropic.com/v1',
        key: '',
        model: 'claude-3-sonnet-20240229'
      }
    },
    current: 'openai'
  }
};

export class UserConfigManager {
  private configDir: string;
  private configFile: string;

  constructor() {
    this.configDir = join(homedir(), '.bun-buddy');
    this.configFile = join(this.configDir, 'config.json');
  }

  ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  loadConfig(): UserConfig {
    try {
      if (existsSync(this.configFile)) {
        const content = readFileSync(this.configFile, 'utf-8');
        const config = JSON.parse(content);
        // Merge with defaults to ensure all keys exist
        return { ...DEFAULT_CONFIG, ...config };
      }
    } catch (error) {
      console.warn('Failed to load config, using defaults:', error);
    }
    
    return DEFAULT_CONFIG;
  }

  saveConfig(config: UserConfig): void {
    this.ensureConfigDir();
    writeFileSync(this.configFile, JSON.stringify(config, null, 2));
  }

  getConfigValue(keyPath: string): any {
    const config = this.loadConfig();
    return this.getNestedValue(config, keyPath);
  }

  setConfigValue(keyPath: string, value: any): void {
    const config = this.loadConfig();
    this.setNestedValue(config, keyPath, value);
    this.saveConfig(config);
  }

  private getNestedValue(obj: any, keyPath: string): any {
    return keyPath.split('.').reduce((current, key) => {
      return current && current[key] !== undefined ? current[key] : undefined;
    }, obj);
  }

  private setNestedValue(obj: any, keyPath: string, value: any): void {
    const keys = keyPath.split('.');
    const lastKey = keys.pop()!;
    
    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }
}

export const userConfigManager = new UserConfigManager();