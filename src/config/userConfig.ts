import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import type { Observable, Updatable } from '../utils/observable';
import { makeUpdatable } from '../utils/observable';

export type Endpoint = {
  url: string;
  key: string;
  model: string;
};

export type Config = {
  server: {
    host: string;
    port: number;
  };
  llm: {
    endpoints: Record<string, Endpoint>;
    current: string;
  };
};

const DEFAULT_CONFIG: Config = {
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
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1',
        key: '',
        model: 'deepseek-chat'
      },
      siliconflow: {
        url: 'https://api.siliconflow.cn/v1',
        key: '',
        model: 'deepseek-ai/DeepSeek-V3.1-Terminus'
      }
    },
    current: 'openai'
  }
};

// 配置文件路径相关函数
const getConfigDir = (): string => {
  return join(homedir(), '.bun-buddy');
};

const getConfigFilePath = (): string => {
  return join(getConfigDir(), 'config.json');
};

const ensureConfigDir = (): void => {
  const configDir = getConfigDir();
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
};

// 配置文件读写相关函数
const readConfigFile = async (): Promise<string> => {
  const configPath = getConfigFilePath();
  return readFileSync(configPath, 'utf-8');
};

const writeConfigFile = async (content: string): Promise<void> => {
  ensureConfigDir();
  const configPath = getConfigFilePath();
  writeFileSync(configPath, content, 'utf-8');
};

const loadConfig = async (): Promise<Config> => {
  try {
    const configPath = getConfigFilePath();
    if (existsSync(configPath)) {
      const content = await readConfigFile();
      const config = JSON.parse(content);
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_CONFIG, ...config };
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
  }
  
  return DEFAULT_CONFIG;
};

const saveConfig = async (config: Config): Promise<void> => {
  const content = JSON.stringify(config, null, 2);
  await writeConfigFile(content);
};

// 工具函数
const getNestedValue = (obj: any, keyPath: string): any => {
  return keyPath.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

const setNestedValue = (obj: any, keyPath: string, value: any): void => {
  const keys = keyPath.split('.');
  const lastKey = keys.pop()!;
  
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);

  target[lastKey] = value;
};

// 核心函数：创建 Updatable<Config>
export const createUpdatableConfig = async (): Promise<Updatable<Config>> => {
  const initialConfig = await loadConfig();
  
  const updatable = makeUpdatable(initialConfig);
  
  // 包装 update 方法，添加自动保存功能
  const originalUpdate = updatable.update;
  updatable.update = (updater: (currentValue: Config) => Config): void => {
    originalUpdate(updater);
    
    // 异步保存配置到文件
    saveConfig(updatable.observable(() => {})).catch(error => {
      console.warn('Failed to save config:', error);
    });
  };

  return updatable;
};

// 为了向后兼容，保留原来的函数名
export const createMutableConfig = createUpdatableConfig;

// 向后兼容的同步接口（已弃用，建议使用 createMutableConfig）
export const getConfigValue = (keyPath: string): any => {
  // 同步读取配置（仅用于向后兼容）
  try {
    const configPath = getConfigFilePath();
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);
      const mergedConfig = { ...DEFAULT_CONFIG, ...config };
      return getNestedValue(mergedConfig, keyPath);
    }
  } catch (error) {
    console.warn('Failed to load config:', error);
  }
  
  return getNestedValue(DEFAULT_CONFIG, keyPath);
};

// 导出默认配置实例（同步版本，用于向后兼容）
export const config = (() => {
  try {
    const configPath = getConfigFilePath();
    if (existsSync(configPath)) {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
  }
  return DEFAULT_CONFIG;
})();

export default config;
