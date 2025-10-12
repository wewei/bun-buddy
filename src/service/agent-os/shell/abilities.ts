// Shell Abilities

import { sendSSEEvent } from './sse';

import type { AgentBus, AbilityMeta } from '../types';

const sendMeta: AbilityMeta = {
  id: 'shell:send',
  moduleName: 'shell',
  abilityName: 'send',
  description: 'Send message chunk to user via SSE',
  inputSchema: {
    type: 'object',
    properties: {
      content: {
        type: 'string',
        description: 'Message content chunk',
      },
      messageId: {
        type: 'string',
        description: 'Unique message identifier for assembling multiple chunks',
      },
      index: {
        type: 'number',
        description: 'Chunk index. >= 0 means more chunks coming, < 0 means message end',
      },
    },
    required: ['content', 'messageId', 'index'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        description: 'Whether the message was successfully sent',
      },
      error: {
        type: 'string',
        description: 'Error message if failed',
      },
    },
    required: ['success'],
  },
};

const handleShellSend = async (taskId: string, input: string): Promise<string> => {
  const { content, messageId, index } = JSON.parse(input);

  const success = sendSSEEvent(taskId, {
    type: 'content',
    taskId,
    content,
    messageId,
    index,
  });

  if (!success) {
    return JSON.stringify({
      success: false,
      error: `No active SSE connection for task ${taskId}`,
    });
  }

  if (index < 0) {
    sendSSEEvent(taskId, {
      type: 'message_complete',
      taskId,
      messageId,
    });
  }

  return JSON.stringify({ success: true });
};

export const registerShellAbilities = (bus: AgentBus): void => {
  bus.register(sendMeta, handleShellSend);
};

