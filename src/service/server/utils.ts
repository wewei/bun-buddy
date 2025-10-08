import { loadConfig } from '../../config';
import { createLLMConfigFromEndpoint } from '../agent/llm';

import type { ChatMessage } from '../agent/llm';
import type { ApiResponse, ChatHistoryManager } from './types';

// Utility function to create API responses
export const createResponse = <T>(
  success: boolean,
  data?: T,
  message?: string
): ApiResponse<T> => ({
  success,
  data,
  message,
  timestamp: new Date().toISOString()
});

// Create chat history manager
export const createChatHistoryManager = (): ChatHistoryManager => {
  const chatHistory: ChatMessage[] = [];
  
  return {
    addMessage: (message: ChatMessage) => {
      chatHistory.push(message);
    },
    getRecentHistory: (limit?: number) => {
      if (limit === undefined) {
        return [...chatHistory];
      }
      return chatHistory.slice(-limit);
    }
  };
};

// Initialize LLM configuration
export const initializeLLMConfig = (): ReturnType<typeof createLLMConfigFromEndpoint> | null => {
  try {
    const config = loadConfig();
    
    // Validate config structure
    if (!config?.llm?.current || !config.llm.endpoints) {
      console.log('⚠️ LLM Config not initialized - invalid config structure. Please check your configuration.');
      return null;
    }
    
    // Check if API key is configured
    const currentEndpoint = config.llm.current;
    const endpoint = config.llm.endpoints[currentEndpoint];
    
    if (!endpoint) {
      console.log(`⚠️ LLM Config not initialized - endpoint '${currentEndpoint}' not found in config.`);
      return null;
    }
    
    if (endpoint?.key?.trim()) {
      const llmConfig = createLLMConfigFromEndpoint(endpoint, {
        temperature: 0.7,
        maxTokens: 2000
      });
      console.log(`🤖 LLM Config initialized successfully with endpoint: ${currentEndpoint}`);
      return llmConfig;
    }
    
    console.log('⚠️ LLM Config not initialized - API key not configured. Set up .env file with API keys to enable LLM features.');
    return null;
  } catch (error) {
    console.warn('⚠️ LLM Config initialization failed:', error);
    return null;
  }
};
