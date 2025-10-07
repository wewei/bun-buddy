import type { Config } from './types';

export const DEFAULT_CONFIG: Config = {
  server: {
    host: 'localhost',
    port: 3000
  },
  llm: {
    endpoints: {
      openai: {
        url: 'https://api.openai.com/v1',
        key: '',
        model: 'gpt-4'
      },
      claude: {
        url: 'https://api.anthropic.com/v1',
        key: '',
        model: 'claude-3-sonnet-20240229'
      },
      deepseek: {
        url: 'https://api.deepseek.com/v1',
        key: '',
        model: 'deepseek-chat'
      },
      siliconflow: {
        url: 'https://api.siliconflow.cn/v1',
        key: '',
        model: 'deepseek-ai/DeepSeek-V3.1-Terminus'
      }
    },
    current: 'openai'
  },
  cli: {}
};
