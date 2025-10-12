// Agent OS Core Types

// ============================================================================
// Entity Types (Task, Call, Message)
// ============================================================================

export type Task = {
  id: string;
  parentTaskId?: string;
  completionStatus?: string; // undefined = in progress, string = completed
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
};

export type CallStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type Call = {
  id: string;
  taskId: string;
  abilityName: string;
  parameters: string; // JSON encoded
  status: CallStatus;
  details: string; // JSON encoded
  createdAt: number;
  updatedAt: number;
  startMessageId: string;
  endMessageId?: string;
};

export type MessageRole = 'system' | 'user' | 'assistant';

export type Message = {
  id: string;
  taskId: string;
  role: MessageRole;
  content: string;
  timestamp: number;
};

// ============================================================================
// Ability Types
// ============================================================================

export type JSONSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  enum?: string[];
  description?: string;
  [key: string]: unknown;
};

export type AbilityHandler = (taskId: string, input: string) => Promise<string>;

export type AbilityMeta = {
  id: string; // e.g., 'task:spawn'
  moduleName: string; // e.g., 'task'
  abilityName: string; // e.g., 'spawn'
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  tags?: string[];
};

export type RegisteredAbility = {
  meta: AbilityMeta;
  handler: AbilityHandler;
};

// ============================================================================
// Agent Bus Types
// ============================================================================

export type AgentBus = {
  invoke: (abilityId: string, callerId: string, input: string) => Promise<string>;
  register: (meta: AbilityMeta, handler: AbilityHandler) => void;
  unregister: (abilityId: string) => void;
  has: (abilityId: string) => boolean;
};

// ============================================================================
// Call Log Entry
// ============================================================================

export type CallLogEntry = {
  callerId: string;
  abilityId: string;
  timestamp: number;
  duration?: number;
  success?: boolean;
  error?: string;
};

