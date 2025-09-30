export interface Config {
  service: {
    port: number;
    host: string;
  };
  cli: {
    name: string;
    version: string;
  };
}

const config: Config = {
  service: {
    port: parseInt(process.env.PORT || '3000'),
    host: process.env.HOST || 'localhost'
  },
  cli: {
    name: 'bun-buddy',
    version: '1.0.0'
  }
};

export default config;