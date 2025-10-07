import type { Observable, Updatable } from '../utils/observable';
import { makeUpdatable } from '../utils/observable';
import type { Config } from './types';
import { userConfigManager } from './manager';
import { $B } from '../utils/combinators';

// 从文件系统读取配置，支持 deepMerge
const loadConfigFromFile = (): Config => {
  return userConfigManager.loadConfig();
};

// 全局唯一的配置 updatable 实例
const createGlobalUpdatableConfig = (): Updatable<Config> => {
  let currentConfig = loadConfigFromFile();
  
  // 使用 makeUpdatable 构建基础的 updatable
  const baseUpdatable = makeUpdatable(currentConfig);
  
  // 单例 watcher，确保同一时间只有一个监听器
  let activeWatcher: ReturnType<typeof userConfigManager.startWatcher> | null = null;
  
  // 启动文件监听器（单次监听）
  const startWatcher = (): void => {
    // 如果已经有活跃的 watcher，不重复创建
    if (activeWatcher) return;
    
    activeWatcher = userConfigManager.startWatcher(() => {
      // 重新加载配置
      currentConfig = loadConfigFromFile();
      
      // 更新 baseUpdatable 的值并通知所有订阅者
      baseUpdatable.update(() => currentConfig);
    });
  };

  // 停止文件监听器
  const stopWatcher = (): void => {
    if (activeWatcher) {
      userConfigManager.stopWatcher(activeWatcher);
      activeWatcher = null;
    }
  };

  // 使用 $B 包装 observable，添加 watch 启动逻辑
  const observable: Observable<Config> = $B(
    (config: Config) => {
      startWatcher();
      return config;
    }
  )(baseUpdatable.observable);

  // 使用 $B 包装 update 函数，添加 watch 停止和文件写入逻辑
  const update = $B(
    (config: Config) => {
      stopWatcher();
      try {
        userConfigManager.saveConfig(config);
      } catch (error) {
        console.warn('Failed to save config:', error);
      }
      return config;
    }
  )(baseUpdatable.update);
  
  return {
    observable,
    update
  };
};

// 创建全局唯一的配置 updatable 实例
export const configUpdatable = createGlobalUpdatableConfig();

// 辅助函数：获取嵌套配置值
const getNestedValue = (obj: any, keyPath: string): any => {
  return keyPath.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : undefined;
  }, obj);
};

// 辅助函数：设置嵌套配置值
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

// 配置操作函数
export const getConfigValue = (keyPath: string): any => {
  // 创建一个空的 invalidate 函数来获取当前值
  const invalidate = () => {};
  const currentConfig = configUpdatable.observable(invalidate);
  return getNestedValue(currentConfig, keyPath);
};

export const setConfigValue = (keyPath: string, value: any): void => {
  // 创建一个空的 invalidate 函数来获取当前值
  const invalidate = () => {};
  const currentConfig = configUpdatable.observable(invalidate);
  
  setNestedValue(currentConfig, keyPath, value);
  configUpdatable.update(() => currentConfig);
};

export const loadConfig = (): any => {
  // 创建一个空的 invalidate 函数来获取当前值
  const invalidate = () => {};
  return configUpdatable.observable(invalidate);
};
