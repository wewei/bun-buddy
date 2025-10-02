import config from '../config';

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

// Store for connected clients (for SSE implementation)
const connectedClients = new Set<ReadableStreamDefaultController>();
const activeConnections = new Set<any>();

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
            
            // Broadcast to all connected SSE clients
            const broadcastData = {
              type: 'echo',
              message: message,
              timestamp: new Date().toISOString()
            };
            
            connectedClients.forEach(controller => {
              try {
                const encoder = new TextEncoder();
                const sseData = `data: ${JSON.stringify(broadcastData)}\n\n`;
                controller.enqueue(encoder.encode(sseData));
              } catch (error) {
                console.log('📡 Broadcast error, removing client:', error);
                // Remove dead clients
                connectedClients.delete(controller);
                activeConnections.delete(controller);
              }
            });
            
            // Echo back response
            return new Response(
              JSON.stringify(createResponse(true, { 
                echo: message,
                broadcasted: connectedClients.size > 0,
                clientCount: connectedClients.size
              })),
              {
                headers: { 'Content-Type': 'application/json' }
              }
            );
          });
        } else if (method === 'GET') {
          // SSE endpoint for real-time communication
          const headers = new Headers({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Cache-Control'
          });

          const encoder = new TextEncoder();
          let heartbeatInterval: any = null;
          let clientController: ReadableStreamDefaultController | null = null;

          const cleanupClient = () => {
            if (clientController) {
              connectedClients.delete(clientController);
              activeConnections.delete(clientController);
              console.log(`📡 SSE Client cleaned up. Total clients: ${connectedClients.size}`);
            }
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
          };

          const stream = new ReadableStream({
            start(controller) {
              clientController = controller;
              try {
                // Send Welcome Event with proper SSE format
                const welcomeEvent = `event: welcome\ndata: ${JSON.stringify({ 
                  message: 'Welcome to Bun Buddy Debug Server',
                  timestamp: new Date().toISOString()
                })}\n\n`;
                controller.enqueue(encoder.encode(welcomeEvent));

                // Store client for broadcasting
                connectedClients.add(controller);
                activeConnections.add(controller);
                console.log(`📡 SSE Client connected. Total clients: ${connectedClients.size}`);

                // Send periodic heartbeat
                heartbeatInterval = setInterval(() => {
                  try {
                    const heartbeatData = `data: ${JSON.stringify({ 
                      type: 'heartbeat', 
                      timestamp: new Date().toISOString() 
                    })}\n\n`;
                    controller.enqueue(encoder.encode(heartbeatData));
                  } catch (error) {
                    console.log(`📡 Heartbeat failed, cleaning up client`);
                    cleanupClient();
                  }
                }, 30000);

              } catch (error) {
                console.log('📡 SSE Start error:', error);
                cleanupClient();
              }
            },
            
            cancel() {
              // This is called when the client cancels the stream
              console.log(`📡 SSE Client cancelled connection`);
              cleanupClient();
            }
          });

          // Handle connection close
          request.signal?.addEventListener('abort', () => {
            console.log(`📡 SSE Client aborted connection`);
            cleanupClient();
          });

          return new Response(stream, { headers });
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