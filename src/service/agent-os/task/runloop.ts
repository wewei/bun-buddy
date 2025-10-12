// Task Execution Loop

import type { AgentBus, Message } from '../types';
import type { TaskRegistry, TaskState } from './types';
import type { ChatMessage, ToolCall } from '../model/types';

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
};

const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const convertToLLMMessages = (messages: Message[]): ChatMessage[] => {
  return messages.map((msg) => ({
    role: msg.role as ChatMessage['role'],
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

const generateToolsFromBus = async (bus: AgentBus, taskId: string): Promise<ToolDefinition[]> => {
  // Get all modules
  const modulesResult = await bus.invoke(taskId, 'bus:list', '{}');
  const { modules } = JSON.parse(modulesResult);

  const tools: ToolDefinition[] = [];

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

const executeToolCall = async (
  taskId: string,
  toolCall: ToolCall,
  messages: Message[],
  bus: AgentBus
): Promise<void> => {
  const abilityId = toolCall.function.name.replace('_', ':');
  const args = toolCall.function.arguments;

  console.log(`Task ${taskId} - Executing tool: ${abilityId}`);

  try {
    const toolResult = await bus.invoke(taskId, abilityId, args);
    console.log(`Task ${taskId} - Tool result: ${toolResult.substring(0, 100)}...`);

    const toolMessage: Message = {
      id: generateMessageId(),
      taskId,
      role: 'assistant',
      content: `Tool ${abilityId} result: ${toolResult}`,
      timestamp: Date.now(),
    };

    await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: toolMessage }));
    messages.push(toolMessage);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Task ${taskId} - Tool execution failed:`, errorMessage);

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
};

const processLLMResponse = async (
  taskId: string,
  llmResult: string,
  messages: Message[],
  bus: AgentBus
): Promise<boolean> => {
  const { content, toolCalls, usage } = JSON.parse(llmResult);

  console.log(`Task ${taskId} - LLM response:`, {
    contentLength: content?.length || 0,
    toolCallsCount: toolCalls?.length || 0,
    usage,
  });

  if (content && content.length > 0) {
    await streamContentToUser(taskId, content, bus);
  }

  const assistantMessage: Message = {
    id: generateMessageId(),
    taskId,
    role: 'assistant',
    content: content || '',
    timestamp: Date.now(),
  };

  await bus.invoke('system', 'ldg:msg:save', JSON.stringify({ message: assistantMessage }));
  messages.push(assistantMessage);

  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls as ToolCall[]) {
      await executeToolCall(taskId, toolCall, messages, bus);
    }
    return true; // Continue loop
  }

  return false; // Task complete
};

const completeTask = async (taskId: string, taskState: TaskState, bus: AgentBus): Promise<void> => {
  taskState.task.completionStatus = 'success';
  taskState.task.updatedAt = Date.now();
  await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));
  console.log(`Task ${taskId} completed successfully`);
};

const failTask = async (
  taskId: string,
  taskState: TaskState,
  error: unknown,
  bus: AgentBus
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Task ${taskId} execution error:`, errorMessage);

  taskState.task.completionStatus = `failed: ${errorMessage}`;
  taskState.task.updatedAt = Date.now();

  await bus.invoke('system', 'ldg:task:save', JSON.stringify({ task: taskState.task }));
  await streamContentToUser(taskId, `Error: ${errorMessage}`, bus);
};

const runExecutionLoop = async (
  taskId: string,
  messages: Message[],
  tools: ToolDefinition[],
  bus: AgentBus
): Promise<void> => {
  let continueLoop = true;

  while (continueLoop) {
    const llmInput = {
      messages: convertToLLMMessages(messages),
      tools,
    };

    const llmResult = await bus.invoke(taskId, 'model:llm', JSON.stringify(llmInput));
    continueLoop = await processLLMResponse(taskId, llmResult, messages, bus);
  }
};

export const createExecuteTask = (registry: TaskRegistry, bus: AgentBus) => {
  return async (taskId: string): Promise<void> => {
    const taskState = registry.get(taskId);
    if (!taskState) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (taskState.isRunning || taskState.task.completionStatus !== undefined) {
      return;
    }

    taskState.isRunning = true;

    try {
      const messages = taskState.messages;
      const tools = await generateToolsFromBus(bus, taskId);

      await runExecutionLoop(taskId, messages, tools, bus);
      taskState.messages = messages;

      await completeTask(taskId, taskState, bus);
    } catch (error) {
      await failTask(taskId, taskState, error, bus);
    } finally {
      taskState.isRunning = false;
    }
  };
};

