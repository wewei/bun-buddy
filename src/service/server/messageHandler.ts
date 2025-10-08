import { 
  streamLLMCompletion, 
  type ChatMessage, 
  type CompletionChunk,
  generateTrackingId,
  withCallback
} from '../agent/llm';
import type { HandlePostMessage } from './types';

// Handle POST message
export const handlePostMessage: HandlePostMessage = async (request, sseChannel, chatHistoryManager, llmConfig) => {
  return request.json().then(async (body: any) => {
    const message = body.message || body;
    console.log('📨 Received message:', message);
    
    // Generate tracking ID for this request
    const trackingId = generateTrackingId();
    
    // Add user message to chat history
    const userMessage: ChatMessage = {
      role: 'user',
      content: message
    };
    chatHistoryManager.addMessage(userMessage);
    
    // Broadcast user message to all connected SSE clients
    const userBroadcastData = {
      type: 'user_message',
      message: message,
      trackingId: trackingId,
      timestamp: new Date().toISOString()
    };
    sseChannel.broadcast(userBroadcastData, 'user_message');
    
    // If LLM config is available, get AI response
    if (llmConfig) {
      try {
        // Start streaming completion in background with our tracking ID
        (async () => {
          let fullAssistantResponse = '';
          
          // Create stream with callback for broadcasting
          const stream = streamLLMCompletion(llmConfig, chatHistoryManager.getRecentHistory(), trackingId);
          const streamWithCallback = withCallback(stream, (chunk: CompletionChunk) => {
            // Broadcast each chunk to all SSE clients
            const chunkData = {
              type: 'llm_chunk',
              trackingId: trackingId,
              content: chunk.content,
              finished: chunk.finished,
              error: chunk.error,
              timestamp: new Date().toISOString()
            };
            sseChannel.broadcast(chunkData, 'llm_response');
          });
          
          for await (const chunk of streamWithCallback) {
            // Accumulate response content
            if (!chunk.finished && chunk.content) {
              fullAssistantResponse += chunk.content;
            }
            
            // Handle final response
            if (chunk.finished) {
              console.log(`🤖 LLM completion finished for tracking ID: ${trackingId}`);
              
              // Check for errors
              if (chunk.error) {
                console.error(`🤖 LLM error for tracking ID ${trackingId}:`, chunk.error);
                const errorData = {
                  type: 'llm_error',
                  trackingId: trackingId,
                  error: chunk.error,
                  timestamp: new Date().toISOString()
                };
                sseChannel.broadcast(errorData, 'llm_error');
                return;
              }
              
              // Add assistant response to chat history
              if (fullAssistantResponse.trim()) {
                const assistantMessage: ChatMessage = {
                  role: 'assistant',
                  content: fullAssistantResponse
                };
                chatHistoryManager.addMessage(assistantMessage);
                console.log(`💬 Added assistant message to history: ${fullAssistantResponse.substring(0, 100)}...`);
              }
              
              // Broadcast completion message
              const completionData = {
                type: 'llm_complete',
                trackingId: trackingId,
                fullResponse: fullAssistantResponse,
                timestamp: new Date().toISOString()
              };
              sseChannel.broadcast(completionData, 'llm_complete');
              break;
            }
          }
        })().catch((error) => {
          console.error('🤖 Error in LLM streaming:', error);
          const errorData = {
            type: 'llm_error',
            trackingId: trackingId,
            error: error.message,
            timestamp: new Date().toISOString()
          };
          sseChannel.broadcast(errorData, 'llm_error');
        });
      } catch (error) {
        console.error('🤖 LLM request failed:', error);
      }
    }
    
    // Return simple response with tracking ID
    return new Response(
      JSON.stringify({ id: trackingId }),
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );
  });
};
