// Shell Module - HTTP API and SSE

import { registerShellAbilities } from './abilities';
import { createRoutes } from './routes';

import type { AgentBus } from '../types';

export type Shell = {
  start: (port: number) => Promise<void>;
  stop: () => Promise<void>;
};

type BunServer = {
  stop: () => void;
};

export const createShell = (bus: AgentBus): Shell => {
  let server: BunServer | undefined;

  // Register shell abilities
  registerShellAbilities(bus);

  const routes = createRoutes(bus);

  const start = async (port: number): Promise<void> => {
    server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
          return new Response(null, {
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type',
            },
          });
        }

        // POST /send
        if (url.pathname === '/send' && req.method === 'POST') {
          return routes.handleSend(req);
        }

        // GET /stream/:taskId
        if (url.pathname.startsWith('/stream/') && req.method === 'GET') {
          const taskId = url.pathname.split('/stream/')[1];
          if (!taskId) {
            return Response.json({ error: 'Missing taskId' }, { status: 400 });
          }
          return routes.handleStream(req, { taskId });
        }

        // 404
        return Response.json({ error: 'Not found' }, { status: 404 });
      },
    });

    console.log(`Shell listening on http://localhost:${port}`);
  };

  const stop = async (): Promise<void> => {
    if (server) {
      server.stop();
      console.log('Shell stopped');
    }
  };

  return {
    start,
    stop,
  };
};

