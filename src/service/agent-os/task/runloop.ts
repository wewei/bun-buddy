// Task Execution Loop

import { v4 as uuidv4 } from 'uuid';

import type { AgentBus, Message, InvokeResult } from '../types';
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

const convertToLLMMessages = (messages: Message[]): ChatMessage[] => {
  return messages.map((msg) => ({
    role: msg.role as ChatMessage['role'],
    content: msg.content,
  }));
};

const streamContentToUser = async (
  callId: string,
  taskId: string,
  content: string,
  bus: AgentBus
): Promise<void> => {
  const messageId = generateMessageId();
  const chunkSize = 50; // Characters per chunk
  
  if (content.length === 0) {
    // Send empty message
    await bus.invoke(
      'shell:send',
      callId,
      taskId,
      JSON.stringify({
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
      'shell:send',
      callId,
      taskId,
      JSON.stringify({
        content: chunks[i],
        messageId,
        index: isLast ? -1 : i,
      })
    );
  }
};

const generateToolsFromBus = async (callId: string, bus: AgentBus, taskId: string): Promise<ToolDefinition[]> => {
  // Get all modules
  const modulesResult = unwrapInvokeResult(await bus.invoke('bus:list', callId, taskId, '{}'));
  const { modules } = JSON.parse(modulesResult);

  const tools: ToolDefinition[] = [];

  for (const module of modules) {
    // Skip bus and shell modules from tools
    if (module.name === 'bus' || module.name === 'shell') {
      continue;
    }

    const abilitiesResult = unwrapInvokeResult(await bus.invoke(
      'bus:abilities',
      callId,
      taskId,
      JSON.stringify({ moduleName: module.name })
    ));
    const { abilities } = JSON.parse(abilitiesResult);

    for (const ability of abilities) {
      const schemaResult = unwrapInvokeResult(await bus.invoke(
        'bus:schema',
        callId,
        taskId,
        JSON.stringify({ abilityId: ability.id })
      ));
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
  callId: string,
  taskId: string,
  toolCall: ToolCall,
  messages: Message[],
  bus: AgentBus
): Promise<void> => {
  const abilityId = toolCall.function.name.replace('_', ':');
  const args = toolCall.function.arguments;

  console.log(`Task ${taskId} - Executing tool: ${abilityId}`);

  try {
    const toolResult = unwrapInvokeResult(await bus.invoke(abilityId, callId, taskId, args));
    console.log(`Task ${taskId} - Tool result: ${toolResult.substring(0, 100)}...`);

    const toolMessage: Message = {
      id: generateMessageId(),
      taskId,
      role: 'assistant',
      content: `Tool ${abilityId} result: ${toolResult}`,
      timestamp: Date.now(),
    };

    unwrapInvokeResult(await bus.invoke('ldg:msg:save', callId, 'system', JSON.stringify({ message: toolMessage })));
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

    unwrapInvokeResult(await bus.invoke('ldg:msg:save', callId, 'system', JSON.stringify({ message: errorMsg })));
    messages.push(errorMsg);
  }
};

const processLLMResponse = async (
  callId: string,
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
    await streamContentToUser(callId, taskId, content, bus);
  }

  const assistantMessage: Message = {
    id: generateMessageId(),
    taskId,
    role: 'assistant',
    content: content || '',
    timestamp: Date.now(),
  };

  unwrapInvokeResult(await bus.invoke('ldg:msg:save', callId, 'system', JSON.stringify({ message: assistantMessage })));
  messages.push(assistantMessage);

  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls as ToolCall[]) {
      await executeToolCall(callId, taskId, toolCall, messages, bus);
    }
    return true; // Continue loop
  }

  return false; // Task complete
};

const completeTask = async (callId: string, taskId: string, taskState: TaskState, bus: AgentBus): Promise<void> => {
  taskState.task.completionStatus = 'success';
  taskState.task.updatedAt = Date.now();
  unwrapInvokeResult(await bus.invoke('ldg:task:save', callId, 'system', JSON.stringify({ task: taskState.task })));
  console.log(`Task ${taskId} completed successfully`);
};

const failTask = async (
  callId: string,
  taskId: string,
  taskState: TaskState,
  error: unknown,
  bus: AgentBus
): Promise<void> => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  console.error(`Task ${taskId} execution error:`, errorMessage);

  taskState.task.completionStatus = `failed: ${errorMessage}`;
  taskState.task.updatedAt = Date.now();

  unwrapInvokeResult(await bus.invoke('ldg:task:save', callId, 'system', JSON.stringify({ task: taskState.task })));
  await streamContentToUser(callId, taskId, `Error: ${errorMessage}`, bus);
};

const getDefaultLLMProvider = async (
  callId: string,
  bus: AgentBus,
  taskId: string
): Promise<{ provider: string; model: string }> => {
  const result = unwrapInvokeResult(await bus.invoke('model:listLLM', callId, taskId, '{}'));
  const { providers } = JSON.parse(result) as {
    providers: Array<{ providerName: string; models: string[] }>;
  };

  if (!providers || providers.length === 0) {
    throw new Error('No LLM providers available');
  }

  const firstProvider = providers[0];
  if (!firstProvider || !firstProvider.models || firstProvider.models.length === 0) {
    throw new Error('No LLM models available');
  }

  const firstModel = firstProvider.models[0];
  if (!firstModel) {
    throw new Error('No LLM model found');
  }

  return {
    provider: firstProvider.providerName,
    model: firstModel,
  };
};

const runExecutionLoop = async (
  callId: string,
  taskId: string,
  messages: Message[],
  tools: ToolDefinition[],
  bus: AgentBus
): Promise<void> => {
  // Get default LLM provider and model
  const { provider, model } = await getDefaultLLMProvider(callId, bus, taskId);

  let continueLoop = true;

  while (continueLoop) {
    const llmInput = {
      messages: convertToLLMMessages(messages),
      provider,
      model,
      streamToUser: true, // Enable streaming to user
      tools,
    };

    const llmResult = unwrapInvokeResult(await bus.invoke('model:llm', callId, taskId, JSON.stringify(llmInput)));
    continueLoop = await processLLMResponse(callId, taskId, llmResult, messages, bus);
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
    const callId = generateCallId();

    try {
      const messages = taskState.messages;
      const tools = await generateToolsFromBus(callId, bus, taskId);

      await runExecutionLoop(callId, taskId, messages, tools, bus);
      taskState.messages = messages;

      await completeTask(callId, taskId, taskState, bus);
    } catch (error) {
      await failTask(callId, taskId, taskState, error, bus);
    } finally {
      taskState.isRunning = false;
    }
  };
};

