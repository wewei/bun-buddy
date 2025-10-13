// Shell Abilities

import { z } from 'zod';

import { sendSSEEvent } from './sse';

import type { AgentBus, AbilityMeta } from '../types';

// Schema definitions
const SHELL_SEND_INPUT_SCHEMA = z.object({
  content: z.string().describe('Message content chunk'),
  messageId: z.string().describe('Unique message identifier for assembling multiple chunks'),
  index: z.number().describe('Chunk index. >= 0 means more chunks coming, < 0 means message end'),
});

const SHELL_SEND_OUTPUT_SCHEMA = z.object({
  success: z.boolean().describe('Whether the message was successfully sent'),
  error: z.string().optional().describe('Error message if failed'),
});

// Meta definitions
const SHELL_SEND_META: AbilityMeta<
  z.infer<typeof SHELL_SEND_INPUT_SCHEMA>,
  z.infer<typeof SHELL_SEND_OUTPUT_SCHEMA>
> = {
  moduleName: 'shell',
  abilityName: 'send',
  description: 'Send message chunk to user via SSE',
  inputSchema: SHELL_SEND_INPUT_SCHEMA,
  outputSchema: SHELL_SEND_OUTPUT_SCHEMA,
};

type ShellSendInput = z.infer<typeof SHELL_SEND_INPUT_SCHEMA>;

const handleShellSend = async (taskId: string, input: ShellSendInput) => {
  const success = sendSSEEvent(taskId, {
    type: 'content',
    taskId,
    content: input.content,
    messageId: input.messageId,
    index: input.index,
  });

  if (!success) {
    return {
      type: 'success' as const,
      result: {
        success: false,
        error: `No active SSE connection for task ${taskId}`,
      }
    };
  }

  if (input.index < 0) {
    sendSSEEvent(taskId, {
      type: 'message_complete',
      taskId,
      messageId: input.messageId,
    });
  }

  return {
    type: 'success' as const,
    result: { success: true }
  };
};

export const registerShellAbilities = (bus: AgentBus): void => {
  bus.register('shell:send', SHELL_SEND_META, async (_callId, taskId, input) => {
    return handleShellSend(taskId, input);
  });
};

