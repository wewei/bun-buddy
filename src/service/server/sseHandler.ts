import { createResponse as createSSEResponse } from 'better-sse';
import type { HandleSSEConnection } from './types';

// Handle SSE connection
export const handleSSEConnection: HandleSSEConnection = async (request, sseChannel) => {
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
};
