import { createServer } from './server/index';
import { configUpdatable } from '../config';
import type { Config } from '../config/types';

let currentServer: ReturnType<typeof Bun.serve> | null = null;

async function startServer(config: Config) {
  if (currentServer) {
    console.log('🔄 Restarting server with new configuration...');
    currentServer.stop();
  }
  currentServer = await createServer(config);
}

async function stopServer() {
  if (currentServer) {
    console.log('🛑 Stopping server...');
    currentServer.stop();
    currentServer = null;
  }
}

async function restartServer() {
  await stopServer();
  
  // 重新设置配置监听 - 递归调用自身
  const configInvalidate = () => {
    console.log('📝 Configuration changed, restarting server...');
    restartServer();
  };
  
  // 读取最新配置
  const config = configUpdatable.observe(configInvalidate);
  
  // 启动服务器
  await startServer(config);
}

export async function main() {
  try {
    // 初始启动并设置配置监听
    await restartServer();

    console.log('Press Ctrl+C to stop the server');
    console.log('Server will automatically restart when configuration changes');

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// 优雅关闭处理
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  await stopServer();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server gracefully...');
  await stopServer();
  process.exit(0);
});

// Only run if this file is executed directly
if (import.meta.main) {
  main();
}