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
            console.log(chalk.yellow('Interactive mode - Type your messages and press Enter:'));
            console.log(chalk.gray('(Press Ctrl+C to exit)'));
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
    output: process.stdout,
    prompt: chalk.cyan('> ')
  });

  // Track connection state
  let isConnected = false;
  let sseController: AbortController | null = null;

  // Start SSE connection for receiving messages
  const connectSSE = () => {
    if (sseController) {
      sseController.abort();
    }
    
    sseController = new AbortController();
    
    console.log(chalk.gray('📡 Establishing SSE connection...'));
    
    fetch(`${serviceUrl}/`, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
      signal: sseController.signal
    })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body for SSE stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      isConnected = true;
      console.log(chalk.green('📡 SSE connection established'));

      try {
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            console.log(chalk.yellow('📡 SSE connection closed by server'));
            isConnected = false;
            break;
          }

          // Accumulate chunks and process complete messages
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const jsonData = line.substring(6).trim();
                if (jsonData) {
                  const data = JSON.parse(jsonData);
                  handleSSEMessage(data);
                }
              } catch (error) {
                console.log(chalk.gray('📡 Raw data:'), line.substring(6));
              }
            } else if (line.startsWith('event: ')) {
              const eventType = line.substring(7).trim();
              if (eventType) {
                console.log(chalk.blue('📡 Event:'), eventType);
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.log(chalk.red('📡 SSE read error:'), error.message);
        }
        isConnected = false;
      } finally {
        try {
          reader.releaseLock();
        } catch {}
      }
    })
    .catch((error) => {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.log(chalk.red('📡 SSE connection error:'), error.message);
        isConnected = false;
        
        // Attempt to reconnect after 3 seconds
        console.log(chalk.yellow('📡 Will retry connection in 3 seconds...'));
        setTimeout(() => {
          if (!isConnected) {
            console.log(chalk.yellow('📡 Attempting to reconnect SSE...'));
            connectSSE();
          }
        }, 3000);
      }
    });
  };

  // Handle incoming SSE messages
  const handleSSEMessage = (data: any) => {
    // Clear current line and move cursor to beginning
    process.stdout.write('\r\x1b[K');
    
    switch (data.type) {
      case 'welcome':
        console.log(chalk.green('📡 Server:'), data.message);
        break;
      case 'echo':
        console.log(chalk.magenta('📨 Echo:'), data.message);
        if (data.timestamp) {
          console.log(chalk.gray('   Time:'), new Date(data.timestamp).toLocaleTimeString());
        }
        break;
      case 'heartbeat':
        // Don't print heartbeats, just acknowledge connection is alive
        break;
      default:
        console.log(chalk.cyan('📡 Message:'), JSON.stringify(data));
    }
    
    // Re-display the prompt
    rl.prompt();
  };

  // Start SSE connection
  connectSSE();

  // Display initial prompt
  rl.prompt();

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
          console.log(chalk.red('❌ HTTP Error:'), response.status, response.statusText);
        } else {
          const data = await response.json() as { success: boolean; message?: string; data?: any };
          if (data.success) {
            console.log(chalk.blue('✅ Sent:'), message);
            if (data.data?.clientCount !== undefined) {
              console.log(chalk.gray('   Connected clients:'), data.data.clientCount);
            }
          } else {
            console.log(chalk.red('❌ Failed to send:'), data.message || 'Unknown error');
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.log(chalk.red('❌ Network error:'), errorMessage);
      }
    }
    rl.prompt();
  });

  // Handle cleanup on exit
  rl.on('close', () => {
    console.log(chalk.yellow('\n📡 Disconnecting from service...'));
    if (sseController) {
      sseController.abort();
    }
    process.exit(0);
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n📡 Received interrupt signal, disconnecting...'));
    if (sseController) {
      sseController.abort();
    }
    rl.close();
  });
}