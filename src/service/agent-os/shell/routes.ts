// Shell HTTP Routes

import type { AgentBus } from '../types';
import type { SendRequest } from './types';
import { createSSEStream } from './sse';

const validateSendRequest = (body: any): SendRequest => {
  if (typeof body.message !== 'string' || body.message.trim() === '') {
    throw new Error('Invalid message: must be non-empty string');
  }

  if (body.taskId !== undefined && typeof body.taskId !== 'string') {
    throw new Error('Invalid taskId: must be string');
  }

  return body as SendRequest;
};

export const createRoutes = (bus: AgentBus) => {
  // POST /send - Receive user message
  const handleSend = async (req: Request): Promise<Response> => {
    try {
      const body = await req.json();
      const { message, taskId } = validateSendRequest(body);

      // For MVP: if no taskId, create a new task
      // If taskId is provided, send message to that task
      let targetTaskId: string;

      if (taskId) {
        // Send to existing task
        const result = await bus.invoke('shell', 'task:send', JSON.stringify({
          receiverId: taskId,
          message,
        }));
        const parsed = JSON.parse(result);
        if (!parsed.success) {
          return Response.json(
            { error: { code: 'SEND_FAILED', message: parsed.error } },
            { status: 400 }
          );
        }
        targetTaskId = taskId;
      } else {
        // Create new task
        const result = await bus.invoke('shell', 'task:spawn', JSON.stringify({
          goal: message,
        }));
        const parsed = JSON.parse(result);
        targetTaskId = parsed.taskId;
      }

      return Response.json({
        taskId: targetTaskId,
        status: 'running',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return Response.json(
        { error: { code: 'INTERNAL_ERROR', message: errorMessage } },
        { status: 500 }
      );
    }
  };

  // GET /stream/:taskId - SSE stream for task output
  const handleStream = (req: Request, params: { taskId: string }): Response => {
    const { taskId } = params;

    const stream = createSSEStream(taskId);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  };

  return {
    handleSend,
    handleStream,
  };
};

