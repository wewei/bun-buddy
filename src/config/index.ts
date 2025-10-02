import { userConfigManager } from './userConfig';

export interface Endpoint {
  url: string;
  key: string;
  model: string;
}

export interface Config {
  service: {
    port: number;
    host: string;
  };
  cli: {
    name: string;
    version: string;
  };
  llm: {
    endpoints: Record<string, Endpoint>;
    current: string;
  };
}

function createConfig(): Config {
  // Load user config
  const userConfig = userConfigManager.loadConfig();
  
  // Merge user config with environment variables and defaults
  const mergedEndpoints = { ...userConfig.llm.endpoints };
  
  // Override with environment variables if available
  if (process.env.OPENAI_API_KEY || process.env.OPENAI_BASE_URL || process.env.OPENAI_MODEL) {
    mergedEndpoints.openai = {
      url: process.env.OPENAI_BASE_URL || mergedEndpoints.openai?.url || 'https://api.openai.com/v1',
      key: process.env.OPENAI_API_KEY || mergedEndpoints.openai?.key || '',
      model: process.env.OPENAI_MODEL || mergedEndpoints.openai?.model || 'gpt-4'
    };
  }
  
  if (process.env.CLAUDE_API_KEY || process.env.CLAUDE_BASE_URL || process.env.CLAUDE_MODEL) {
    mergedEndpoints.claude = {
      url: process.env.CLAUDE_BASE_URL || mergedEndpoints.claude?.url || 'https://api.anthropic.com/v1',
      key: process.env.CLAUDE_API_KEY || mergedEndpoints.claude?.key || '',
      model: process.env.CLAUDE_MODEL || mergedEndpoints.claude?.model || 'claude-3-sonnet-20240229'
    };
  }

  return {
    service: {
      port: parseInt(process.env.PORT || userConfig.server.port.toString()),
      host: process.env.HOST || userConfig.server.host
    },
    cli: {
      name: 'buddy',
      version: '1.0.0'
    },
    llm: {
      endpoints: mergedEndpoints,
      current: process.env.LLM_CURRENT || userConfig.llm.current
    }
  };
}

const config: Config = createConfig();

export default config;