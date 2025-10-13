// Agent OS Core Types

import type { z } from 'zod';

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

// Legacy JSONSchema type for compatibility
export type JSONSchema = {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  items?: unknown;
  enum?: string[];
  description?: string;
  [key: string]: unknown;
};

// Result types for standardized error handling
export type AbilityResult<R, E> = 
  | { type: 'success'; result: R }
  | { type: 'error'; error: E };

export type InvokeResult<R, E> = 
  | { type: 'invalid-ability'; message: string }
  | { type: 'invalid-input'; message: string }
  | { type: 'unknown-failure'; message: string }
  | AbilityResult<R, E>;

// Generic handler: receives parsed input of type TInput, returns TOutput
export type AbilityHandler<TInput = unknown, TOutput = unknown> = (
  callId: string,
  taskId: string,
  input: TInput
) => Promise<AbilityResult<TOutput, string>>;

// Internal handler: used by Bus internally, deals with strings
// Can return invalid-input for parse errors
export type InternalAbilityHandler = (
  callId: string,
  taskId: string,
  input: string
) => Promise<InvokeResult<string, string>>;

// Generic meta: carries type information via schemas
export type AbilityMeta<TInput = unknown, TOutput = unknown> = {
  moduleName: string; // e.g., 'task'
  abilityName: string; // e.g., 'spawn'
  description: string;
  inputSchema: z.ZodSchema<TInput>;
  outputSchema: z.ZodSchema<TOutput>;
  tags?: string[];
};

export type RegisteredAbility = {
  abilityId: string; // e.g., 'task:spawn'
  meta: AbilityMeta<unknown, unknown>;
  handler: InternalAbilityHandler;
};

// ============================================================================
// Agent Bus Types
// ============================================================================

export type AgentBus = {
  invoke: (abilityId: string, callId: string, callerId: string, input: string) => Promise<InvokeResult<string, string>>;
  register: <TInput, TOutput>(
    abilityId: string,
    meta: AbilityMeta<TInput, TOutput>,
    handler: AbilityHandler<TInput, TOutput>
  ) => void;
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

