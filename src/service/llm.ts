import OpenAI from 'openai';
import config, { type Endpoint } from '../config';
import { randomUUID } from 'crypto';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface StreamingResponse {
  trackingId: string;
  content: string;
  finished: boolean;
}

export class LLMClient {
  private endpoint: Endpoint;
  private openai: OpenAI;

  constructor(endpointName?: string) {
    const currentEndpoint = endpointName || config.llm.current;
    const endpoint = config.llm.endpoints[currentEndpoint];
    
    if (!endpoint) {
      throw new Error(`LLM endpoint "${currentEndpoint}" not found in configuration`);
    }
    
    this.endpoint = endpoint;
    
    if (!this.endpoint.key) {
      throw new Error(`API key not configured for endpoint "${currentEndpoint}"`);
    }

    // Initialize OpenAI client with custom base URL and API key
    this.openai = new OpenAI({
      apiKey: this.endpoint.key,
      baseURL: this.endpoint.url
    });
  }

  /**
   * Send a completion request and handle streaming response
   */
  async *streamCompletion(
    messages: ChatMessage[], 
    onChunk?: (chunk: StreamingResponse) => void,
    externalTrackingId?: string
  ): AsyncGenerator<StreamingResponse, void, unknown> {
    const trackingId = externalTrackingId || randomUUID();
    
    try {
      console.log(`🤖 Starting LLM completion request with tracking ID: ${trackingId}`);
      
      // Convert our ChatMessage format to OpenAI format
      const openaiMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const stream = await this.openai.chat.completions.create({
        model: this.endpoint.model,
        messages: openaiMessages,
        stream: true,
        temperature: 0.7,
        max_tokens: 2000
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content;
        
        if (content) {
          const streamResponse: StreamingResponse = {
            trackingId,
            content,
            finished: false
          };
          
          if (onChunk) {
            onChunk(streamResponse);
          }
          yield streamResponse;
        }
      }

      // Send final finished response
      const finalResponse: StreamingResponse = {
        trackingId,
        content: '',
        finished: true
      };
      
      if (onChunk) {
        onChunk(finalResponse);
      }
      yield finalResponse;
      
    } catch (error) {
      console.error(`🤖 LLM completion error (${trackingId}):`, error);
      const errorResponse: StreamingResponse = {
        trackingId,
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        finished: true
      };
      
      if (onChunk) {
        onChunk(errorResponse);
      }
      yield errorResponse;
    }
  }



  /**
   * Get the current endpoint configuration
   */
  getEndpoint(): Endpoint {
    return { ...this.endpoint };
  }

  /**
   * Get tracking ID for the next request
   */
  generateTrackingId(): string {
    return randomUUID();
  }
}

// Export a function to create default instance when needed
export function createDefaultLLMClient(): LLMClient {
  return new LLMClient();
}