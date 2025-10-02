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
            
            // Echo back for now (future: process with AI Agent)
            return new Response(
              JSON.stringify(createResponse(true, { 
                echo: message,
                processed: `Processed: ${message}` 
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

          const stream = new ReadableStream({
            start(controller) {
              // Send initial connection message
              controller.enqueue(`data: ${JSON.stringify({ 
                type: 'connected', 
                message: 'Connected to Bun Buddy Service' 
              })}\n\n`);

              // Store client for broadcasting
              connectedClients.add(controller);

              // Send periodic heartbeat
              const heartbeat = setInterval(() => {
                try {
                  controller.enqueue(`data: ${JSON.stringify({ 
                    type: 'heartbeat', 
                    timestamp: new Date().toISOString() 
                  })}\n\n`);
                } catch {
                  clearInterval(heartbeat);
                  connectedClients.delete(controller);
                }
              }, 30000);

              // Cleanup on close
              request.signal?.addEventListener('abort', () => {
                clearInterval(heartbeat);
                connectedClients.delete(controller);
                controller.close();
              });
            }
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