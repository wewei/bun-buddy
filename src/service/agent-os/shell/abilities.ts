// Shell Abilities

import { z } from 'zod';
import { sendSSEEvent } from './sse';

import type { AgentBus, AbilityMeta, AbilityResult } from '../types';

const inputSchema = z.object({
  content: z.string().describe('Message content chunk'),
  messageId: z.string().describe('Unique message identifier for assembling multiple chunks'),
  index: z.number().describe('Chunk index. >= 0 means more chunks coming, < 0 means message end'),
});

const outputSchema = z.object({
  success: z.boolean().describe('Whether the message was successfully sent'),
  error: z.string().optional().describe('Error message if failed'),
});

const sendMeta: AbilityMeta = {
  id: 'shell:send',
  moduleName: 'shell',
  abilityName: 'send',
  description: 'Send message chunk to user via SSE',
  inputSchema,
  outputSchema,
};

const handleShellSend = async (taskId: string, input: string): Promise<AbilityResult<string, string>> => {
  try {
    const { content, messageId, index } = JSON.parse(input);

    const success = sendSSEEvent(taskId, {
      type: 'content',
      taskId,
      content,
      messageId,
      index,
    });

    if (!success) {
      return {
        type: 'success',
        result: JSON.stringify({
          success: false,
          error: `No active SSE connection for task ${taskId}`,
        })
      };
    }

    if (index < 0) {
      sendSSEEvent(taskId, {
        type: 'message_complete',
        taskId,
        messageId,
      });
    }

    return {
      type: 'success',
      result: JSON.stringify({ success: true })
    };
  } catch (error) {
    return {
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export const registerShellAbilities = (bus: AgentBus): void => {
  bus.register(sendMeta, handleShellSend);
};

