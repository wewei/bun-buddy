import type { Config } from '../../config/types';
import { configUpdatable } from '../../config';
import { createChannel } from 'better-sse';
import { handleSSEConnection } from './sseHandler';
import { handlePostMessage } from './messageHandler';
import { createResponse, createChatHistoryManager, initializeLLMConfig } from './utils';

export async function createServer(config: Config) {
  const serviceHost = process.env.SERVICE_HOST || config.server.host;
  const servicePort = parseInt(process.env.SERVICE_PORT || '') || config.server.port;

  console.log(`🚀 Server running at http://${serviceHost}:${servicePort}`);
  console.log(`📋 SSE endpoint: http://${serviceHost}:${servicePort}/`);

  // Create shared instances
  const sseChannel = createChannel();
  const chatHistoryManager = createChatHistoryManager();
  const llmConfig = initializeLLMConfig();

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
          return handlePostMessage(request, sseChannel, chatHistoryManager, llmConfig);
        } else if (method === 'GET') {
          return handleSSEConnection(request, sseChannel);
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

  return server;
}
