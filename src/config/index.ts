import { merge } from 'lodash';
import type { Observable, Updatable, Invalidate } from '../utils/observable';
import { makeUpdatable } from '../utils/observable';
import type { Config } from './types';
import { DEFAULT_CONFIG } from './defaults';
import { userConfigManager } from './manager';
import { $B } from '../utils/combinators';

// 从文件系统读取配置，支持 deepMerge
const loadConfigFromFile = (): Config => {
  return userConfigManager.loadConfig();
};

// 核心函数：创建 Updatable<Config>
export const createUpdatableConfig = (): Updatable<Config> => {
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

// 为了向后兼容，保留原来的函数名
export const createMutableConfig = createUpdatableConfig;

// 导出默认配置实例（同步版本，用于向后兼容）
export const config = userConfigManager.loadConfig();

export { userConfigManager };
export default config;
