// SSE Connection Management

import type { SSEConnection, SSEEvent } from './types';

const activeConnections = new Map<string, SSEConnection>();

export const formatSSE = (event: SSEEvent): Uint8Array => {
  const type = event.type || 'message';
  const json = JSON.stringify(event);
  const sse = `event: ${type}\ndata: ${json}\n\n`;
  return new TextEncoder().encode(sse);
};

export const createSSEStream = (taskId: string): ReadableStream => {
  let heartbeatInterval: Timer;

  const stream = new ReadableStream({
    start(controller) {
      // Register this SSE connection
      activeConnections.set(taskId, {
        taskId,
        controller,
        messageBuffer: new Map(),
      });

      // Send connection established event
      const startEvent = formatSSE({
        type: 'start',
        taskId,
      });
      controller.enqueue(startEvent);

      // Setup heartbeat
      heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
        } catch {
          // Connection closed, cleanup
          clearInterval(heartbeatInterval);
        }
      }, 30000);
    },

    cancel() {
      // Cleanup on connection close
      clearInterval(heartbeatInterval);
      activeConnections.delete(taskId);
    },
  });

  return stream;
};

export const sendSSEEvent = (taskId: string, event: SSEEvent): boolean => {
  const connection = activeConnections.get(taskId);
  if (!connection) {
    return false;
  }

  try {
    const formatted = formatSSE(event);
    connection.controller.enqueue(formatted);
    return true;
  } catch {
    // Connection closed or error
    activeConnections.delete(taskId);
    return false;
  }
};

export const hasActiveConnection = (taskId: string): boolean => {
  return activeConnections.has(taskId);
};

export const closeConnection = (taskId: string): void => {
  const connection = activeConnections.get(taskId);
  if (connection) {
    try {
      connection.controller.close();
    } catch {
      // Already closed
    }
    activeConnections.delete(taskId);
  }
};

