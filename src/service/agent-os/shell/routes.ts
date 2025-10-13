// Shell HTTP Routes

import { v4 as uuidv4 } from 'uuid';

import { createSSEStream } from './sse';

import type { AgentBus, InvokeResult } from '../types';
import type { SendRequest } from './types';

const generateCallId = (): string => {
  return uuidv4().replace(/-/g, '');
};

const unwrapInvokeResult = (result: InvokeResult<string, string>): string => {
  if (result.type === 'success') {
    return result.result;
  }
  const errorMsg = result.type === 'error' ? result.error : result.message;
  throw new Error(`Invoke failed (${result.type}): ${errorMsg}`);
};

const validateSendRequest = (body: unknown): SendRequest => {
  if (typeof body !== 'object' || body === null) {
    throw new Error('Invalid request body: must be an object');
  }

  const obj = body as Record<string, unknown>;

  if (typeof obj.message !== 'string' || obj.message.trim() === '') {
    throw new Error('Invalid message: must be non-empty string');
  }

  if (obj.taskId !== undefined && typeof obj.taskId !== 'string') {
    throw new Error('Invalid taskId: must be string');
  }

  return obj as SendRequest;
};

const sendToExistingTask = async (
  callId: string,
  bus: AgentBus,
  taskId: string,
  message: string
): Promise<{ success: boolean; taskId: string; error?: string }> => {
  const result = unwrapInvokeResult(await bus.invoke(
    'task:send',
    callId,
    'shell',
    JSON.stringify({
      receiverId: taskId,
      message,
    })
  ));
  const parsed = JSON.parse(result);

  if (!parsed.success) {
    return { success: false, taskId, error: parsed.error };
  }

  return { success: true, taskId };
};

const createNewTask = async (callId: string, bus: AgentBus, message: string): Promise<string> => {
  const result = unwrapInvokeResult(await bus.invoke(
    'task:spawn',
    callId,
    'shell',
    JSON.stringify({
      goal: message,
    })
  ));
  const parsed = JSON.parse(result);
  return parsed.taskId;
};

export const createRoutes = (bus: AgentBus) => {
  // POST /send - Receive user message
  const handleSend = async (req: Request): Promise<Response> => {
    try {
      const body = await req.json();
      const { message, taskId } = validateSendRequest(body);
      const callId = generateCallId();

      let targetTaskId: string;

      if (taskId) {
        const result = await sendToExistingTask(callId, bus, taskId, message);
        if (!result.success) {
          return Response.json(
            { error: { code: 'SEND_FAILED', message: result.error } },
            { status: 400 }
          );
        }
        targetTaskId = result.taskId;
      } else {
        targetTaskId = await createNewTask(callId, bus, message);
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
