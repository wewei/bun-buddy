export type Endpoint = {
  url: string;
  key: string;
  model: string;
};

export type Config = {
  server: {
    host: string;
    port: number;
  };
  llm: {
    endpoints: Record<string, Endpoint>;
    current: string;
  };
  cli: {
    version: string;
  };
};
