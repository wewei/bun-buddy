import config from '../config';
import { createChannel, createResponse as createSSEResponse } from 'better-sse';
import { LLMClient, type ChatMessage, type StreamingResponse } from './llm';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

// Utility function to create API responses
function createResponse<T>(success: boolean, data?: T, message?: string): ApiResponse<T> {
  return {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

// Create a better-sse channel for broadcasting messages
const sseChannel = createChannel();

// Chat history storage
const chatHistory: ChatMessage[] = [];

// Initialize LLM client
let llmClient: LLMClient | null = null;

function initializeLLMClient(): void {
  try {
    // Check if API key is configured
    const currentEndpoint = config.llm.current;
    const endpoint = config.llm.endpoints[currentEndpoint];
    
    if (endpoint && endpoint.key && endpoint.key.trim() !== '') {
      llmClient = new LLMClient();
      console.log(`🤖 LLM Client initialized successfully with endpoint: ${currentEndpoint}`);
    } else {
      console.log('⚠️ LLM Client not initialized - API key not configured. Set up .env file with API keys to enable LLM features.');
    }
  } catch (error) {
    console.warn('⚠️ LLM Client initialization failed:', error);
  }
}

// Initialize LLM client
initializeLLMClient();

export async function createServer(host?: string, port?: number) {
  const serviceHost = host || process.env.SERVICE_HOST || config.service.host;
  const servicePort = port || parseInt(process.env.SERVICE_PORT || '') || config.service.port;

  console.log(`🚀 Server running at http://${serviceHost}:${servicePort}`);
  console.log(`📋 SSE endpoint: http://${serviceHost}:${servicePort}/`);

  const server = Bun.serve({
    port: servicePort,
    hostname: serviceHost,
    idleTimeout: 255, // Maximum allowed timeout (255 seconds = 4.25 minutes)

    fetch(request: Request): Response | Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      // Root endpoint - Handle both POST and GET
      if (url.pathname === '/') {
        if (method === 'POST') {
          // Handle incoming messages from CLI
          return request.json().then(async (body: any) => {
            const message = body.message || body;
            console.log('📨 Received message:', message);
            
            // Generate tracking ID for this request
            const trackingId = llmClient?.generateTrackingId() || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            // Add user message to chat history
            const userMessage: ChatMessage = {
              role: 'user',
              content: message
            };
            chatHistory.push(userMessage);
            
            // Broadcast user message to all connected SSE clients
            const userBroadcastData = {
              type: 'user_message',
              message: message,
              trackingId: trackingId,
              timestamp: new Date().toISOString()
            };
            sseChannel.broadcast(userBroadcastData, 'message');
            
            // If LLM client is available, get AI response
            if (llmClient) {
              try {
                // Start streaming completion in background with our tracking ID
                (async () => {
                  let fullAssistantResponse = '';
                  
                  for await (const chunk of llmClient.streamCompletion(
                    chatHistory,
                    (response: StreamingResponse) => {
                      // Broadcast each chunk to all SSE clients
                      const chunkData = {
                        type: 'llm_chunk',
                        trackingId: trackingId, // Use our consistent tracking ID
                        content: response.content,
                        finished: response.finished,
                        timestamp: new Date().toISOString()
                      };
                      sseChannel.broadcast(chunkData, 'llm_response');
                    },
                    trackingId // Pass our tracking ID to LLM client
                  )) {
                    // Accumulate response content
                    if (!chunk.finished && chunk.content) {
                      fullAssistantResponse += chunk.content;
                    }
                    
                    // Handle final response
                    if (chunk.finished) {
                      console.log(`🤖 LLM completion finished for tracking ID: ${trackingId}`);
                      
                      // Add assistant response to chat history
                      if (fullAssistantResponse.trim()) {
                        const assistantMessage: ChatMessage = {
                          role: 'assistant',
                          content: fullAssistantResponse
                        };
                        chatHistory.push(assistantMessage);
                        console.log(`💬 Added assistant message to history: ${fullAssistantResponse.substring(0, 100)}...`);
                      }
                      
                      // Broadcast completion message
                      const completionData = {
                        type: 'llm_complete',
                        trackingId: trackingId, // Use our consistent tracking ID
                        fullResponse: fullAssistantResponse,
                        timestamp: new Date().toISOString()
                      };
                      sseChannel.broadcast(completionData, 'llm_complete');
                      break;
                    }
                  }
                })().catch((error) => {
                  console.error('🤖 Error in LLM streaming:', error);
                  const errorData = {
                    type: 'llm_error',
                    trackingId: trackingId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                  };
                  sseChannel.broadcast(errorData, 'llm_error');
                });
              } catch (error) {
                console.error('🤖 LLM request failed:', error);
              }
            }
            
            // Return simple response with tracking ID
            return new Response(
              JSON.stringify({ id: trackingId }),
              {
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        } else if (method === 'GET') {
          // SSE endpoint using better-sse
          return new Promise((resolve) => {
            // Use better-sse to create the SSE session
            const response = createSSEResponse(request, (session) => {
              console.log(
                `📡 SSE Client connected. Total clients: ${
                  sseChannel.sessionCount + 1
                }`
              );

              // Register session with channel for broadcasting
              sseChannel.register(session);

              // Send welcome message
              session.push(
                {
                  message: "Welcome to Bun Buddy Debug Server",
                  timestamp: new Date().toISOString(),
                },
                "welcome"
              );

              // Send periodic heartbeat (better-sse already handles keep-alive, but we want custom heartbeat)
              const heartbeatInterval = setInterval(() => {
                try {
                  if (session.isConnected) {
                    session.push(
                      {
                        type: "heartbeat",
                        timestamp: new Date().toISOString(),
                      },
                      "heartbeat"
                    );
                  } else {
                    clearInterval(heartbeatInterval);
                  }
                } catch (error) {
                  console.log("📡 Heartbeat failed, clearing interval");
                  clearInterval(heartbeatInterval);
                }
              }, 30000);

              // Handle session events
              session.on("disconnected", () => {
                console.log(
                  `📡 SSE Client disconnected. Total clients: ${sseChannel.sessionCount}`
                );
                clearInterval(heartbeatInterval);
              });
            });

            resolve(response);
          });
        }
      }

      // 404 for unmatched routes
      return new Response(
        JSON.stringify(createResponse(false, null, 'Not Found')),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    },

    error(error) {
      console.error('Server error:', error);
      return new Response(
        JSON.stringify(createResponse(false, null, 'Internal Server Error')),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }
  });

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server gracefully...');
    server.stop();
    process.exit(0);
  });

  return server;
}

// Auto-start when run directly (not in CLI mode)
if (process.env.CLI_MODE !== 'true') {
  createServer().catch(console.error);
}