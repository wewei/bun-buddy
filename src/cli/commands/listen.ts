import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from '../utils';
import { userConfigManager } from '../../config/userConfig';

export function createListenCommand() {
  const listen = new Command('listen')
    .option('-u, --url <url>', 'Service endpoint URL')
    .description('Listen to SSE messages from the service')
    .action(async (options) => {
      try {
        let serviceUrl = options.url;
        if (!serviceUrl) {
          const userConfig = userConfigManager.loadConfig();
          serviceUrl = `http://${userConfig.server.host}:${userConfig.server.port}`;
        }

        console.log(chalk.blue.bold('👂 Listening to Bun Buddy Service'));
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
            console.log(chalk.gray('(Listening for messages... Press Ctrl+C to exit)'));
            console.log('');

            // Start listening mode
            await startListeningMode(serviceUrl);
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

  return listen;
}

async function startListeningMode(serviceUrl: string) {
  // Track connection state
  let isConnected = false;
  let eventSource: any = null;

  // Start SSE connection using eventsource package
  const connectSSE = () => {
    if (eventSource) {
      eventSource.close();
    }
    
    // Import eventsource dynamically
    import('eventsource').then(({ EventSource }) => {
      eventSource = new EventSource(`${serviceUrl}/`);
      
      eventSource.onopen = () => {
        isConnected = true;
        // Connection status will be shown via welcome message
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
        // Heartbeat received - connection is alive (silent)
        // Only show heartbeat in verbose mode
        if (process.env.DEBUG) {
          console.log(chalk.gray('💓 Heartbeat'));
        }
      });
      
      eventSource.onerror = (error: any) => {
        isConnected = false;
        
        if (eventSource.readyState === EventSource.CONNECTING) {
          console.log(chalk.yellow('🔄 Reconnecting...'));
        } else {
          console.error(chalk.red('❌ Connection error:'), error.message || 'Unknown error');
          
          // Auto-reconnect after 3 seconds
          setTimeout(() => {
            if (!isConnected) {
              console.log(chalk.blue('🔄 Attempting to reconnect...'));
              connectSSE();
            }
          }, 3000);
        }
      };
      
    }).catch((error) => {
      console.log(chalk.red('📡 Failed to load eventsource:'), error.message);
    });
  };

  // Track streaming state
  let streamingTrackingId: string | null = null;
  let isFirstChunk = true;

  // Handle incoming SSE messages
  const handleSSEMessage = (data: any) => {
    const timestamp = new Date().toLocaleTimeString();
    
    switch (data.type) {
      case 'welcome':
        console.log(chalk.green(`[${timestamp}] 🎉`), data.message || 'Connected to service');
        break;
        
      case 'user_message':
        const userDisplay = data.trackingId 
          ? `👤 User [${data.trackingId.substring(0, 8)}]:`
          : '👤 User:';
        console.log(chalk.blue(`[${timestamp}] ${userDisplay}`), chalk.white(data.message));
        break;
        
      case 'llm_chunk':
        // Handle streaming LLM responses
        if (streamingTrackingId !== data.trackingId) {
          // New streaming session
          streamingTrackingId = data.trackingId;
          isFirstChunk = true;
        }
        
        if (isFirstChunk) {
          const assistantDisplay = data.trackingId 
            ? `🤖 Assistant [${data.trackingId.substring(0, 8)}]: `
            : '🤖 Assistant: ';
          process.stdout.write(chalk.green(`[${timestamp}] ${assistantDisplay}`));
          isFirstChunk = false;
        }
        
        // Write chunk content directly to stdout for streaming effect
        if (data.content) {
          process.stdout.write(chalk.white(data.content));
        }
        break;
        
      case 'llm_complete':
        // End the streaming line
        if (streamingTrackingId === data.trackingId) {
          console.log(); // New line to end the stream
          streamingTrackingId = null;
          isFirstChunk = true;
        }
        break;
        
      case 'llm_error':
        if (streamingTrackingId) {
          console.log(); // End current stream if any
          streamingTrackingId = null;
          isFirstChunk = true;
        }
        console.log(chalk.red(`[${timestamp}] ❌ LLM Error:`), data.error);
        break;
        
      case 'echo':
        console.log(chalk.blue(`[${timestamp}] 📢 Echo:`), chalk.white(data.message));
        break;
        
      case 'heartbeat':
        // Heartbeat is handled silently, but can be enabled for debugging
        // console.log(chalk.gray(`[${timestamp}] 💓`));
        break;
        
      default:
        console.log(chalk.cyan(`[${timestamp}] 📨 Unknown:`), JSON.stringify(data, null, 2));
    }
  };

  // Start SSE connection
  connectSSE();

  // Handle cleanup on exit
  process.on('SIGINT', () => {
    console.log(chalk.yellow('\n👋 Disconnecting...'));
    if (eventSource) {
      eventSource.close();
    }
    process.exit(0);
  });

  // Keep the process alive
  process.stdin.resume();
}