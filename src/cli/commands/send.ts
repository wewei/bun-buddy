import { Command } from 'commander';
import chalk from 'chalk';
import { spinner } from '../utils';
import { userConfigManager } from '../../config/manager';

export function createSendCommand() {
  const send = new Command('send')
    .argument('<message>', 'Message to send')
    .option('-u, --url <url>', 'Service endpoint URL')
    .option('-r, --response', 'Wait for and display response')
    .description('Send a message to the service')
    .action(async (message: string, options) => {
      try {
        let serviceUrl = options.url;
        if (!serviceUrl) {
          const userConfig = userConfigManager.loadConfig();
          serviceUrl = `http://${userConfig.server.host}:${userConfig.server.port}`;
        }

        console.log(chalk.blue.bold('📤 Sending message to Bun Buddy Service'));
        console.log(chalk.cyan('URL:'), serviceUrl);
        console.log(chalk.cyan('Message:'), message);
        if (options.response) {
          console.log(chalk.gray('Mode:'), 'Waiting for response');
        }
        console.log('');

        if (options.response) {
          // Mode with response waiting
          await sendWithResponse(serviceUrl, message);
        } else {
          // Simple send mode (existing behavior)
          await sendSimple(serviceUrl, message);
        }
      } catch (error) {
        console.error(chalk.red('Send error:'), error);
        process.exit(1);
      }
    });

  return send;
}

// Simple send without waiting for response
async function sendSimple(serviceUrl: string, message: string) {
  const spin = spinner('Sending message...');
  spin.start();

  try {
    const response = await fetch(`${serviceUrl}/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      spin.fail(chalk.red('Failed to send message'));
      console.error(chalk.red('HTTP Error:'), response.status, response.statusText);
      process.exit(1);
    } else {
      const data = await response.json() as { id: string };
      spin.succeed(chalk.green('Message sent successfully!'));
      console.log(chalk.gray('Tracking ID:'), chalk.cyan(data.id));
    }
  } catch (error) {
    spin.fail(chalk.red('Failed to connect to service'));
    console.log(chalk.yellow('Make sure the service is running with:'), chalk.cyan('buddy server start'));
    console.log(chalk.gray('Error:'), error);
    process.exit(1);
  }
}

// Send with response waiting
async function sendWithResponse(serviceUrl: string, message: string) {
  return new Promise<void>((resolve, reject) => {
    let eventSource: any = null;
    let messageTrackingId: string | null = null;
    let streamingTrackingId: string | null = null;
    let isFirstChunk = true;
    let hasReceivedUserMessage = false;
    
    const cleanup = () => {
      if (eventSource) {
        eventSource.close();
      }
    };

    const connectSSE = () => {
      // Import eventsource dynamically
      import('eventsource').then(({ EventSource }) => {
        eventSource = new EventSource(`${serviceUrl}/`);
        
        eventSource.onopen = () => {
          console.log(chalk.green('🔗 Connected to SSE stream'));
          
          // Wait a bit for connection to stabilize, then send message
          setTimeout(() => {
            sendMessage();
          }, 500);
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
          // Silent heartbeat handling
        });
        
        eventSource.addEventListener('user_message', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            handleSSEMessage(data);
          } catch (error) {
            console.log(chalk.gray('📡 Raw user_message data:'), event.data);
          }
        });
        
        eventSource.addEventListener('llm_response', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            handleSSEMessage(data);
          } catch (error) {
            console.log(chalk.gray('📡 Raw llm_response data:'), event.data);
          }
        });
        
        eventSource.addEventListener('llm_complete', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            handleSSEMessage(data);
          } catch (error) {
            console.log(chalk.gray('📡 Raw llm_complete data:'), event.data);
          }
        });
        
        eventSource.addEventListener('llm_error', (event: any) => {
          try {
            const data = JSON.parse(event.data);
            handleSSEMessage(data);
          } catch (error) {
            console.log(chalk.gray('📡 Raw llm_error data:'), event.data);
          }
        });
        
        eventSource.onerror = (error: any) => {
          // Only log error if we haven't completed successfully
          if (!hasReceivedUserMessage) {
            console.error(chalk.red('❌ SSE Connection error:'), error.message || 'Unknown error');
            cleanup();
            reject(new Error('SSE connection failed'));
          } else {
            // If we've already received the user message, this might be normal disconnect
            console.log(chalk.yellow('⚠️ SSE connection ended'));
          }
        };
        
      }).catch((error) => {
        console.log(chalk.red('📡 Failed to load eventsource:'), error.message);
        reject(error);
      });
    };

    const sendMessage = async () => {
      const spin = spinner('Sending message...');
      spin.start();

      try {
        const response = await fetch(`${serviceUrl}/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message })
        });

        if (!response.ok) {
          spin.fail(chalk.red('Failed to send message'));
          console.error(chalk.red('HTTP Error:'), response.status, response.statusText);
          cleanup();
          reject(new Error(`HTTP ${response.status}: ${response.statusText}`));
          return;
        }

        const data = await response.json() as { id: string };
        messageTrackingId = data.id;
        spin.succeed(chalk.green('Message sent successfully!'));
        console.log(chalk.gray('Tracking ID:'), chalk.cyan(data.id));
        console.log(chalk.gray('Waiting for response...'));
        console.log('');
      } catch (error) {
        spin.fail(chalk.red('Failed to connect to service'));
        console.log(chalk.yellow('Make sure the service is running with:'), chalk.cyan('buddy server start'));
        console.log(chalk.gray('Error:'), error);
        cleanup();
        reject(error);
      }
    };

    const handleSSEMessage = (data: any) => {
      const timestamp = new Date().toLocaleTimeString();
      
      switch (data.type) {
        case 'welcome':
          console.log(chalk.green(`[${timestamp}] 🎉`), data.message || 'Connected to service');
          break;
          
        case 'user_message':
          // Only show user message if it matches our tracking ID
          if (data.trackingId === messageTrackingId) {
            const userDisplay = data.trackingId 
              ? `👤 User [${data.trackingId.substring(0, 8)}]:`
              : '👤 User:';
            console.log(chalk.blue(`[${timestamp}] ${userDisplay}`), chalk.white(data.message));
            hasReceivedUserMessage = true;
          }
          break;
          
        case 'llm_chunk':
          // Only handle LLM chunks for our message
          if (data.trackingId === messageTrackingId) {
            if (streamingTrackingId !== data.trackingId) {
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
            
            if (data.content) {
              process.stdout.write(chalk.white(data.content));
            }
          }
          break;
          
        case 'llm_complete':
          // Handle completion for our message
          if (data.trackingId === messageTrackingId) {
            if (streamingTrackingId === data.trackingId) {
              console.log(); // New line to end the stream
              console.log(chalk.green('✅ Response completed successfully'));
              cleanup();
              resolve();
            }
          }
          break;
          
        case 'llm_error':
          // Handle error for our message
          if (data.trackingId === messageTrackingId) {
            if (streamingTrackingId) {
              console.log(); // End current stream if any
            }
            console.log(chalk.red(`[${timestamp}] ❌ LLM Error:`), data.error);
            cleanup();
            reject(new Error(`LLM Error: ${data.error}`));
          }
          break;
          
        default:
          // Ignore other message types or show in debug mode
          if (process.env.DEBUG) {
            console.log(chalk.cyan(`[${timestamp}] 📨 Unknown:`), JSON.stringify(data, null, 2));
          }
      }
    };

    // Start SSE connection
    connectSSE();

    // Handle cleanup on exit
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n👋 Disconnecting...'));
      cleanup();
      process.exit(0);
    });
  });
}