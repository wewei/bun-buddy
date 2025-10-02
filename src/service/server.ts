import config from '../config';
import { createChannel } from 'better-sse';

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

export async function createServer(host?: string, port?: number) {
  const serviceHost = host || process.env.SERVICE_HOST || config.service.host;
  const servicePort = port || parseInt(process.env.SERVICE_PORT || '') || config.service.port;

  console.log(`🚀 Server running at http://${serviceHost}:${servicePort}`);
  console.log(`📋 SSE endpoint: http://${serviceHost}:${servicePort}/`);

  const server = Bun.serve({
    port: servicePort,
    hostname: serviceHost,

    fetch(request: Request): Response | Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      // Root endpoint - Handle both POST and GET
      if (url.pathname === '/') {
        if (method === 'POST') {
          // Handle incoming messages from CLI
          return request.json().then((body: any) => {
            const message = body.message || body;
            console.log('📨 Received message:', message);
            
            // Broadcast to all connected SSE clients using better-sse
            const broadcastData = {
              type: 'echo',
              message: message,
              timestamp: new Date().toISOString()
            };
            
            // Get client count before broadcasting
            const clientCount = sseChannel.sessionCount;
            
            // Broadcast the message
            sseChannel.broadcast(broadcastData, 'message');
            
            // Echo back response
            return new Response(
              JSON.stringify(createResponse(true, { 
                echo: message,
                broadcasted: clientCount > 0,
                clientCount: clientCount
              })),
              {
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        } else if (method === 'GET') {
          // SSE endpoint using better-sse
          return new Promise((resolve) => {
            // Use better-sse to create the SSE session
            import('better-sse').then(({ createResponse }) => {
              const response = createResponse(request, (session) => {
                console.log(`📡 SSE Client connected. Total clients: ${sseChannel.sessionCount + 1}`);
                
                // Register session with channel for broadcasting
                sseChannel.register(session);
                
                // Send welcome message
                session.push({
                  message: 'Welcome to Bun Buddy Debug Server',
                  timestamp: new Date().toISOString()
                }, 'welcome');

                // Send periodic heartbeat (better-sse already handles keep-alive, but we want custom heartbeat)
                const heartbeatInterval = setInterval(() => {
                  try {
                    if (session.isConnected) {
                      session.push({ 
                        type: 'heartbeat', 
                        timestamp: new Date().toISOString() 
                      }, 'heartbeat');
                    } else {
                      clearInterval(heartbeatInterval);
                    }
                  } catch (error) {
                    console.log('📡 Heartbeat failed, clearing interval');
                    clearInterval(heartbeatInterval);
                  }
                }, 30000);

                // Handle session events
                session.on('disconnected', () => {
                  console.log(`📡 SSE Client disconnected. Total clients: ${sseChannel.sessionCount}`);
                  clearInterval(heartbeatInterval);
                });
              });

              resolve(response);
            }).catch((error) => {
              console.error('📡 Failed to import better-sse:', error);
              resolve(new Response(
                JSON.stringify(createResponse(false, null, 'SSE not available')),
                {
                  status: 500,
                  headers: { 'Content-Type': 'application/json' }
                }
              ));
            });
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