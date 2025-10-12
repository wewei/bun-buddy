// Task Execution Loop

import type { AgentBus, Message } from '../types';
import type { TaskRegistry } from './types';
import type { ChatMessage, ToolCall } from '../model/types';

const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const convertToLLMMessages = (messages: Message[]): ChatMessage[] => {
  return messages.map((msg) => ({
    role: msg.role as any,
    content: msg.content,
  }));
};

const streamContentToUser = async (
  taskId: string,
  content: string,
  bus: AgentBus
): Promise<void> => {
  const messageId = generateMessageId();
  const chunkSize = 50; // Characters per chunk
  
  if (content.length === 0) {
    // Send empty message
    await bus.invoke(
      taskId,
      'shell:send',
      JSON.stringify({
        taskId,
        content: '',
        messageId,
        index: -1,
      })
    );
    return;
  }

  // Split content into chunks
  const chunks: string[] = [];
  for (let i = 0; i < content.length; i += chunkSize) {
    chunks.push(content.slice(i, i + chunkSize));
  }

  // Send all chunks
  for (let i = 0; i < chunks.length; i++) {
    const isLast = i === chunks.length - 1;
    await bus.invoke(
      taskId,
      'shell:send',
      JSON.stringify({
        taskId,
        content: chunks[i],
        messageId,
        index: isLast ? -1 : i,
      })
    );
  }
};

const generateToolsFromBus = async (bus: AgentBus, taskId: string): Promise<any[]> => {
  // Get all modules
  const modulesResult = await bus.invoke(taskId, 'bus:list', '{}');
  const { modules } = JSON.parse(modulesResult);

  const tools: any[] = [];

  for (const module of modules) {
    // Skip bus and shell modules from tools
    if (module.name === 'bus' || module.name === 'shell') {
      continue;
    }

    const abilitiesResult = await bus.invoke(
      taskId,
      'bus:abilities',
      JSON.stringify({ moduleName: module.name })
    );
    const { abilities } = JSON.parse(abilitiesResult);

    for (const ability of abilities) {
      const schemaResult = await bus.invoke(
        taskId,
        'bus:schema',
        JSON.stringify({ abilityId: ability.id })
      );
      const { inputSchema } = JSON.parse(schemaResult);

      tools.push({
        type: 'function',
        function: {
          name: ability.id.replace(':', '_'), // 'task:spawn' -> 'task_spawn'
          description: ability.description,
          parameters: inputSchema,
        },
      });
    }
  }

  return tools;
};

export const createExecuteTask = (registry: TaskRegistry, bus: AgentBus) => {
  return async (taskId: string): Promise<void> => {
    const taskState = registry.get(taskId);
    if (!taskState) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (taskState.isRunning) {
      // Already running, skip
      return;
    }

    if (taskState.task.completionStatus !== undefined) {
      // Task already completed
      return;
    }

    taskState.isRunning = true;

    try {
      // Load task context from memory (Ledger would return empty in MVP)
      const messages = taskState.messages;

      // Generate tools from bus
      const tools = await generateToolsFromBus(bus, taskId);

      // Main execution loop
      let continueLoop = true;
      while (continueLoop) {
        // Call LLM
        const llmInput = {
          messages: convertToLLMMessages(messages),
          tools,
        };

        const llmResult = await bus.invoke(taskId, 'model:llm', JSON.stringify(llmInput));
        const { content, toolCalls, usage } = JSON.parse(llmResult);

        console.log(`Task ${taskId} - LLM response:`, {
          contentLength: content?.length || 0,
          toolCallsCount: toolCalls?.length || 0,
          usage,
        });

        // Stream content to user
        if (content && content.length > 0) {
          await streamContentToUser(taskId, content, bus);
        }

        // Save assistant message
        const assistantMessage: Message = {
          id: generateMessageId(),
          taskId,
          role: 'assistant',
          content: content || '',
          timestamp: Date.now(),
        };

        await bus.invoke(
          'system',
          'ldg:msg:save',
          JSON.stringify({ message: assistantMessage })
        );

        messages.push(assistantMessage);
        taskState.messages = messages;

        // Handle tool calls
        if (toolCalls && toolCalls.length > 0) {
          for (const toolCall of toolCalls as ToolCall[]) {
            const abilityId = toolCall.function.name.replace('_', ':'); // 'task_spawn' -> 'task:spawn'
            const args = toolCall.function.arguments;

            console.log(`Task ${taskId} - Executing tool: ${abilityId}`);

            try {
              // Execute tool
              const toolResult = await bus.invoke(taskId, abilityId, args);

              console.log(`Task ${taskId} - Tool result: ${toolResult.substring(0, 100)}...`);

              // Add tool result as a message
              const toolMessage: Message = {
                id: generateMessageId(),
                taskId,
                role: 'assistant',
                content: `Tool ${abilityId} result: ${toolResult}`,
                timestamp: Date.now(),
              };

              await bus.invoke(
                'system',
                'ldg:msg:save',
                JSON.stringify({ message: toolMessage })
              );

              messages.push(toolMessage);
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error(`Task ${taskId} - Tool execution failed:`, errorMessage);

              // Add error as a message
              const errorMsg: Message = {
                id: generateMessageId(),
                taskId,
                role: 'assistant',
                content: `Tool ${abilityId} failed: ${errorMessage}`,
                timestamp: Date.now(),
              };

              await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: errorMsg }));

              messages.push(errorMsg);
            }
          }

          // Continue loop to let LLM process tool results
          continueLoop = true;
        } else {
          // No tool calls, task is complete
          continueLoop = false;
        }
      }

      // Mark task as completed
      taskState.task.completionStatus = 'success';
      taskState.task.updatedAt = Date.now();

      await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));

      console.log(`Task ${taskId} completed successfully`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Task ${taskId} execution error:`, errorMessage);

      // Mark task as failed
      taskState.task.completionStatus = `failed: ${errorMessage}`;
      taskState.task.updatedAt = Date.now();

      await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));

      // Send error to user
      await streamContentToUser(taskId, `Error: ${errorMessage}`, bus);
    } finally {
      taskState.isRunning = false;
    }
  };
};

