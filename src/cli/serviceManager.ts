import { join } from 'path';
import { homedir } from 'os';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { spawn } from 'child_process';
import { userConfigManager } from '../config/userConfig';

interface ProcessInfo {
  pid: number;
  host: string;
  port: number;
  startTime: string;
}

export class ServiceManager {
  private pidFile: string;

  constructor() {
    const configDir = join(homedir(), '.bun-buddy');
    this.pidFile = join(configDir, 'server.pid');
  }

  async startService(host?: string, port?: number): Promise<{ success: boolean; message: string; pid?: number }> {
    // Check if service is already running
    const running = await this.isServiceRunning();
    if (running.isRunning) {
      return {
        success: false,
        message: `Service is already running on ${running.info?.host}:${running.info?.port} (PID: ${running.info?.pid})`
      };
    }

    try {
      const userConfig = userConfigManager.loadConfig();
      const serviceHost = host || userConfig.server.host;
      const servicePort = port || userConfig.server.port;

      // Get the path to the service script
      const scriptPath = join(process.cwd(), 'src/service/server.ts');
      
      // Spawn service as detached process
      const child = spawn('bun', ['run', scriptPath], {
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'], // Ignore all stdio
        env: {
          ...process.env,
          SERVICE_HOST: serviceHost,
          SERVICE_PORT: servicePort.toString(),
          CLI_MODE: 'false'
        }
      });

      // Unref to allow parent process to exit
      child.unref();

      // Wait a moment to see if the process starts successfully
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (child.pid) {
        // Save process info
        const processInfo: ProcessInfo = {
          pid: child.pid,
          host: serviceHost,
          port: servicePort,
          startTime: new Date().toISOString()
        };

        userConfigManager.ensureConfigDir();
        writeFileSync(this.pidFile, JSON.stringify(processInfo, null, 2));

        return {
          success: true,
          message: `Service started successfully on ${serviceHost}:${servicePort}`,
          pid: child.pid
        };
      } else {
        return {
          success: false,
          message: 'Failed to start service - no PID assigned'
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to start service: ${error}`
      };
    }
  }

  async stopService(): Promise<{ success: boolean; message: string }> {
    const running = await this.isServiceRunning();
    
    if (!running.isRunning) {
      // Clean up stale PID file
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile);
      }
      return {
        success: false,
        message: 'Service is not running'
      };
    }

    try {
      const processInfo = running.info!;
      
      // Try to stop via API first
      try {
        const response = await fetch(`http://${processInfo.host}:${processInfo.port}/shutdown`, {
          method: 'POST'
        });
        
        if (response.ok) {
          // Wait for graceful shutdown
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Clean up PID file
          if (existsSync(this.pidFile)) {
            unlinkSync(this.pidFile);
          }
          
          return {
            success: true,
            message: 'Service stopped gracefully'
          };
        }
      } catch {
        // API call failed, try to kill process directly
      }

      // Force kill the process
      try {
        process.kill(processInfo.pid, 'SIGTERM');
        
        // Wait a moment then check if it's still running
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          process.kill(processInfo.pid, 0); // Check if process exists
          // Process still running, force kill
          process.kill(processInfo.pid, 'SIGKILL');
        } catch {
          // Process is dead
        }

        // Clean up PID file
        if (existsSync(this.pidFile)) {
          unlinkSync(this.pidFile);
        }

        return {
          success: true,
          message: 'Service stopped'
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to stop service: ${error}`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Error stopping service: ${error}`
      };
    }
  }

  async getServiceStatus(): Promise<{
    isRunning: boolean;
    info?: ProcessInfo;
    healthy?: boolean;
  }> {
    const running = await this.isServiceRunning();
    
    if (!running.isRunning) {
      return { isRunning: false };
    }

    // Test if service is healthy
    try {
      const processInfo = running.info!;
      const response = await fetch(`http://${processInfo.host}:${processInfo.port}/`);
      
      return {
        isRunning: true,
        info: processInfo,
        healthy: response.ok && response.headers.get('content-type')?.includes('text/event-stream')
      };
    } catch {
      return {
        isRunning: true,
        info: running.info,
        healthy: false
      };
    }
  }

  private async isServiceRunning(): Promise<{ isRunning: boolean; info?: ProcessInfo }> {
    if (!existsSync(this.pidFile)) {
      return { isRunning: false };
    }

    try {
      const content = readFileSync(this.pidFile, 'utf-8');
      const processInfo: ProcessInfo = JSON.parse(content);

      // Check if process is still running
      try {
        process.kill(processInfo.pid, 0); // Signal 0 just checks if process exists
        return { isRunning: true, info: processInfo };
      } catch {
        // Process is dead, clean up PID file
        unlinkSync(this.pidFile);
        return { isRunning: false };
      }
    } catch {
      // Invalid PID file, clean up
      if (existsSync(this.pidFile)) {
        unlinkSync(this.pidFile);
      }
      return { isRunning: false };
    }
  }
}

export const serviceManager = new ServiceManager();