import { join } from 'path';
import { homedir } from 'os';
import { mkdirSync, existsSync, readFileSync, writeFileSync, watch } from 'fs';
import { merge } from 'lodash';
import type { Config } from './types';
import { DEFAULT_CONFIG } from './defaults';

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
const readConfigFile = (): string => {
  const configPath = getConfigFilePath();
  return readFileSync(configPath, 'utf-8');
};

const writeConfigFile = (content: string): void => {
  ensureConfigDir();
  const configPath = getConfigFilePath();
  writeFileSync(configPath, content, 'utf-8');
};

const loadConfig = (): Config => {
  try {
    const configPath = getConfigFilePath();
    if (existsSync(configPath)) {
      const content = readConfigFile();
      const config = JSON.parse(content);
      // 使用 lodash 的 merge 进行深度合并
      return merge({}, DEFAULT_CONFIG, config);
    }
  } catch (error) {
    console.warn('Failed to load config, using defaults:', error);
  }
  
  return DEFAULT_CONFIG;
};

const saveConfig = (config: Config): void => {
  const content = JSON.stringify(config, null, 2);
  writeConfigFile(content);
};

// 文件监听器相关函数
type ConfigWatcher = ReturnType<typeof watch> | null;

const startWatcher = (onChange: () => void): ConfigWatcher => {
  const configPath = getConfigFilePath();
  
  // 确保配置目录存在
  ensureConfigDir();
  
  try {
    const watcher = watch(configPath, { persistent: false }, (eventType) => {
      if (eventType === 'change' || eventType === 'rename') {
        try {
          // 停止监听（单次触发）
          if (watcher) {
            watcher.close();
          }
          
          // 调用变化回调
          onChange();
          
        } catch (error) {
          console.warn('Failed to handle config file change:', error);
        }
      }
    });
    
    return watcher;
  } catch (error) {
    console.warn('Failed to setup config file watcher:', error);
    return null;
  }
};

const stopWatcher = (watcher: ConfigWatcher): void => {
  if (watcher) {
    watcher.close();
  }
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

// 配置管理器
export const userConfigManager = {
  loadConfig,
  saveConfig,
  startWatcher,
  stopWatcher,
  getConfigValue: (keyPath: string): any => {
    const config = loadConfig();
    return getNestedValue(config, keyPath);
  },
  setConfigValue: (keyPath: string, value: any): void => {
    const config = loadConfig();
    setNestedValue(config, keyPath, value);
    saveConfig(config);
  }
};
