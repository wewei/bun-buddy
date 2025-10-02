import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from '../utils';
import { userConfigManager } from '../../config/userConfig';

export function createConnectCommand() {
  const connect = new Command('connect')
    .argument('[endpointUrl]', 'Service endpoint URL (defaults to config)')
    .description('Connect to service in interactive mode')
    .action(async (endpointUrl?: string) => {
      try {
        let serviceUrl = endpointUrl;
        if (!serviceUrl) {
          const userConfig = userConfigManager.loadConfig();
          serviceUrl = `http://${userConfig.server.host}:${userConfig.server.port}`;
        }

        console.log(chalk.blue.bold('🔌 Connecting to Bun Buddy Service'));
        console.log(chalk.cyan('URL:'), serviceUrl);
        console.log('');

        // Test connection first
        const spin = spinner('Testing connection...');
        spin.start();

        try {
          const testResponse = await fetch(`${serviceUrl}/`, {
            method: 'GET',
            headers: {
              'Accept': 'text/event-stream'
            }
          });
          
          if (testResponse.ok && testResponse.headers.get('content-type')?.includes('text/event-stream')) {
            spin.succeed(chalk.green('Connected successfully!'));
            console.log(chalk.gray('(Type messages and press Enter, Ctrl+C to exit)'));
            console.log('');

            // Start interactive mode
            await startInteractiveMode(serviceUrl);
          } else {
            spin.fail(chalk.red('Service is not responding correctly'));
            console.log(chalk.yellow('Expected SSE endpoint, but got:'), testResponse.headers.get('content-type'));
            process.exit(1);
          }
        } catch (error) {
          spin.fail(chalk.red('Failed to connect to service'));
          console.log(chalk.yellow('Make sure the service is running with:'), chalk.cyan('buddy server start'));
          console.log(chalk.gray('Error:'), error);
          process.exit(1);
        }
      } catch (error) {
        console.error(chalk.red('Connection error:'), error);
        process.exit(1);
      }
    });

  return connect;
}

async function startInteractiveMode(serviceUrl: string) {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  // Track connection state
  let isConnected = false;
  let eventSource: any = null;

  // Start SSE connection using eventsource package
  const connectSSE = () => {
    if (eventSource) {
      eventSource.close();
    }
    
    // Establish SSE connection silently
    
    // Import eventsource dynamically
    import('eventsource').then(({ EventSource }) => {
      eventSource = new EventSource(`${serviceUrl}/`);
      
      eventSource.onopen = () => {
        isConnected = true;
        // Connection established silently
      };
      
      eventSource.onmessage = (event: any) => {
        try {
          const data = JSON.parse(event.data);
          handleSSEMessage(data);
        } catch (error) {
          console.log(chalk.gray('📡 Raw data:'), event.data);
        }
      };
      
      // Handle specific event types
      eventSource.addEventListener('welcome', (event: any) => {
        try {
          const data = JSON.parse(event.data);
          handleSSEMessage({ ...data, type: 'welcome' });
        } catch (error) {
          console.log(chalk.green('📡 Welcome:'), event.data);
        }
      });
      
      eventSource.addEventListener('heartbeat', (event: any) => {
        // Heartbeat received - connection is alive
        // Don't print anything to keep output clean
      });
      
      eventSource.onerror = (error: any) => {
        isConnected = false;
        
        if (eventSource.readyState === EventSource.CONNECTING) {
          // Reconnecting - no output needed
        } else {
          console.error('Connection error:', error.message || 'Unknown error');
          
          // Auto-reconnect after 3 seconds
          setTimeout(() => {
            if (!isConnected) {
              connectSSE();
            }
          }, 3000);
        }
      };
      
    }).catch((error) => {
      console.log(chalk.red('📡 Failed to load eventsource:'), error.message);
    });
  };

  // Handle incoming SSE messages
  const handleSSEMessage = (data: any) => {
    switch (data.type) {
      case 'welcome':
        // Welcome message - don't print to keep output clean
        break;
      case 'echo':
        console.log(data.message);
        break;
      case 'heartbeat':
        // Don't print heartbeats, just acknowledge connection is alive
        break;
      default:
        console.log(JSON.stringify(data));
    }
  };

  // Start SSE connection
  connectSSE();

  // Handle user input
  rl.on('line', async (input) => {
    const message = input.trim();
    if (message) {
      try {
        const response = await fetch(`${serviceUrl}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        });

        if (!response.ok) {
          console.error('HTTP Error:', response.status, response.statusText);
        } else {
          const data = await response.json() as { success: boolean; message?: string; data?: any };
          if (!data.success) {
            console.error('Failed to send:', data.message || 'Unknown error');
          }
          // Success case - no output, message will be echoed back via SSE
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Network error:', errorMessage);
      }
    }
  });

  // Handle cleanup on exit
  rl.on('close', () => {
    if (eventSource) {
      eventSource.close();
    }
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    if (eventSource) {
      eventSource.close();
    }
    rl.close();
  });
}