import pm2 from 'pm2';
import { loadConfig } from '../config';

interface ServiceInfo {
  pid: number;
  host: string;
  port: number;
  startTime: string;
  status: string;
  memory?: number;
  cpu?: number;
}

interface ServiceStatus {
  isRunning: boolean;
  info?: ServiceInfo;
  healthy?: boolean;
}

export class ServiceManager {
  private readonly appName = 'bun-buddy-server';

  async startService(host?: string, port?: number): Promise<{ success: boolean; message: string; pid?: number }> {
    return new Promise((resolve) => {
      pm2.connect((err) => {
        if (err) {
          resolve({ success: false, message: `PM2 connection failed: ${err.message}` });
          return;
        }

        // Check if already running
        pm2.describe(this.appName, (err, processes) => {
          if (!err && processes && processes.length > 0) {
            const existingProcess = processes[0];
            if (existingProcess?.pm2_env?.status === 'online') {
              pm2.disconnect();
              resolve({
                success: false,
                message: `Service is already running (PID: ${existingProcess.pid})`
              });
              return;
            }
          }

          const userConfig = loadConfig();
          const serviceHost = host || userConfig.server.host;
          const servicePort = port || userConfig.server.port;

          const options = {
            name: this.appName,
            script: 'src/service/index.ts',
            interpreter: 'bun',
            interpreter_args: 'run',
            instances: 1,
            autorestart: true,
            env: {
              SERVICE_HOST: serviceHost,
              SERVICE_PORT: servicePort.toString(),
              CLI_MODE: 'false',
              NODE_ENV: process.env.NODE_ENV || 'development'
            }
          };

          pm2.start(options, (err, processes) => {
            pm2.disconnect();
            
            if (err) {
              resolve({ success: false, message: `Failed to start service: ${err.message}` });
              return;
            }

            const startedProcess = Array.isArray(processes) ? processes[0] : processes;
            resolve({
              success: true,
              message: `Service started successfully on ${serviceHost}:${servicePort}`,
              pid: startedProcess?.pid
            });
          });
        });
      });
    });
  }

  async stopService(): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve) => {
      pm2.connect((err) => {
        if (err) {
          resolve({ success: false, message: `PM2 connection failed: ${err.message}` });
          return;
        }

        // Check if service exists first
        pm2.describe(this.appName, (err, processes) => {
          if (err || !processes || !processes.length) {
            pm2.disconnect();
            resolve({ success: false, message: 'Service is not running' });
            return;
          }

          // Stop via PM2
          pm2.stop(this.appName, (err) => {
            if (err) {
              pm2.disconnect();
              resolve({ success: false, message: `Failed to stop service: ${err.message}` });
              return;
            }

            // Delete the process from PM2
            pm2.delete(this.appName, (err) => {
              pm2.disconnect();
              
              if (err) {
                resolve({ success: false, message: `Service stopped but failed to remove: ${err.message}` });
                return;
              }

              resolve({ success: true, message: 'Service stopped successfully' });
            });
          });
        });
      });
    });
  }

  async restartService(): Promise<{ success: boolean; message: string; pid?: number }> {
    return new Promise((resolve) => {
      pm2.connect((err) => {
        if (err) {
          resolve({ success: false, message: `PM2 connection failed: ${err.message}` });
          return;
        }

        pm2.describe(this.appName, (err, processes) => {
          // If service is not running, start it instead
          if (err || !processes || !processes.length) {
            pm2.disconnect();
            // Use the start service logic
            this.startService().then(startResult => {
              resolve({
                success: startResult.success,
                message: startResult.success ? 'Service started successfully' : startResult.message,
                pid: startResult.pid
              });
            }).catch(error => {
              resolve({ success: false, message: `Failed to start service: ${error.message}` });
            });
            return;
          }

          // Service is running, restart it via PM2
          pm2.restart(this.appName, (err, processes) => {
            pm2.disconnect();
            
            if (err) {
              resolve({ success: false, message: `Failed to restart service: ${err.message}` });
              return;
            }

            const restartedProcess = Array.isArray(processes) ? processes[0] : processes;
            resolve({
              success: true,
              message: 'Service restarted successfully',
              pid: restartedProcess?.pid
            });
          });
        });
      });
    });
  }

  async getServiceStatus(): Promise<ServiceStatus> {
    return new Promise((resolve) => {
      pm2.connect((err) => {
        if (err) {
          resolve({ isRunning: false });
          return;
        }

        pm2.describe(this.appName, async (err, processes) => {
          pm2.disconnect();
          
          if (err || !processes || !processes.length) {
            resolve({ isRunning: false });
            return;
          }

          const process = processes[0];
          const isOnline = process?.pm2_env?.status === 'online';
          
          if (!isOnline) {
            resolve({ isRunning: false });
            return;
          }

          const userConfig = loadConfig();
          const info: ServiceInfo = {
            pid: process.pid || 0,
            host: userConfig.server.host,
            port: userConfig.server.port,
            startTime: new Date((process.pm2_env as any)?.created_at || Date.now()).toISOString(),
            status: process.pm2_env?.status || 'unknown',
            memory: process.monit?.memory,
            cpu: process.monit?.cpu
          };

          // Check health by accessing the root SSE endpoint
          try {
            const response = await fetch(`http://${info.host}:${info.port}/`, {
              signal: AbortSignal.timeout(3000) // 3 second timeout
            });
            const isHealthy = response.ok && response.headers.get('content-type')?.includes('text/event-stream');
            resolve({
              isRunning: true,
              info,
              healthy: isHealthy
            });
          } catch {
            resolve({
              isRunning: true,
              info,
              healthy: false
            });
          }
        });
      });
    });
  }
}

export const serviceManager = new ServiceManager();