import config from '../config';

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

// Utili  // Server is now running and will keep the process alivection to create API responses
function createResponse<T>(success: boolean, data?: T, message?: string): ApiResponse<T> {
  return {
    success,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

// Sample data for demonstration
const dummyUsers = [
  { id: 1, name: 'Alice', email: 'alice@example.com' },
  { id: 2, name: 'Bob', email: 'bob@example.com' },
  { id: 3, name: 'Charlie', email: 'charlie@example.com' }
];

export async function createServer() {
  console.log(`🚀 Server running at http://${config.service.host}:${config.service.port}`);
  console.log(`📋 Health check: http://${config.service.host}:${config.service.port}/health`);
  console.log(`📚 API docs: http://${config.service.host}:${config.service.port}/api/info`);

  const server = Bun.serve({
    port: config.service.port,
    hostname: config.service.host,

    fetch(request: Request): Response | Promise<Response> {
      const url = new URL(request.url);
      const method = request.method;

      // Health check endpoint
      if (url.pathname === '/health' && method === 'GET') {
        return new Response(
          JSON.stringify(createResponse(true, { status: 'healthy', uptime: process.uptime() })),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // API info endpoint
      if (url.pathname === '/api/info' && method === 'GET') {
        return new Response(
          JSON.stringify(createResponse(true, {
            name: 'Bun Buddy API',
            version: '1.0.0',
            endpoints: [
              'GET /health - Health check',
              'GET /api/info - API information',
              'GET /api/users - Get all users',
              'GET /api/users/:id - Get user by ID',
              'POST /api/echo - Echo request body'
            ]
          })),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Get all users
      if (url.pathname === '/api/users' && method === 'GET') {
        return new Response(
          JSON.stringify(createResponse(true, dummyUsers)),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
      }

      // Get user by ID
      if (url.pathname.startsWith('/api/users/') && method === 'GET') {
        const userIdStr = url.pathname.split('/')[3];
        if (!userIdStr) {
          return new Response(
            JSON.stringify(createResponse(false, null, 'Invalid user ID')),
            {
              status: 400,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
        const userId = parseInt(userIdStr);
        const user = dummyUsers.find(u => u.id === userId);

        if (user) {
          return new Response(
            JSON.stringify(createResponse(true, user)),
            {
              headers: { 'Content-Type': 'application/json' }
            }
          );
        } else {
          return new Response(
            JSON.stringify(createResponse(false, null, 'User not found')),
            {
              status: 404,
              headers: { 'Content-Type': 'application/json' }
            }
          );
        }
      }

      // Echo endpoint
      if (url.pathname === '/api/echo' && method === 'POST') {
        return request.json().then(body => {
          return new Response(
            JSON.stringify(createResponse(true, body, 'Echo response')),
            {
              headers: { 'Content-Type': 'application/json' }
            }
          );
        });
      }

      // Root endpoint
      if (url.pathname === '/' && method === 'GET') {
        return new Response(
          JSON.stringify(createResponse(true, {
            message: 'Welcome to Bun Buddy API!',
            documentation: '/api/info'
          })),
          {
            headers: { 'Content-Type': 'application/json' }
          }
        );
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
    console.log('\n� Shutting down server gracefully...');
    server.stop();
    process.exit(0);
  });

  return server;
}