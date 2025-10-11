# Agent OS Architecture Overview

## Introduction

Agent OS is a complete rewrite of the Agent system using an **Operating System Bus Architecture**. The design draws inspiration from OS concepts: Shell (user interface), Task Manager (process management), Memory (file system), Model Manager (ABI), and a central Agent Bus for inter-module communication.

## Core Concepts

### Bus Architecture

Unlike traditional layered architectures, Agent OS uses a **bus-based architecture** where all modules communicate through a central Agent Bus. This decouples dependencies and enables flexible module composition.

```
                 ┌────────────────────┐
                 │  Shell (HTTP API)  │  ← Above Bus
                 └──────────┬─────────┘
                            │ invoke/invokeStream
                            ▼
      ╔══════════════════════════════════════════════╗
      ║         Agent Bus Controller                 ║
      ║  - invoke(abilityId)(input)                  ║
      ║  - invokeStream(abilityId)(input)            ║
      ║  - Ability Discovery (list/schema/inspect)   ║
      ╚══════════════════════════════════════════════╝
                  ▲         ▲         ▲         ▲
      ┌───────────┘         │         │         └──────────┐
      │                     │         │                    │
┌─────▼──────┐  ┌───────────▼──┐   ┌──▼────────┐  ┌────────▼─────┐
│   Task     │  │    Model     │   │  Memory   │  │  Bus Ctrl    │
│  Manager   │  │   Manager    │   │  (Store)  │  │ (Discovery)  │
├────────────┤  ├──────────────┤   ├───────────┤  ├──────────────┤
│task:spawn  │  │model:llm     │   │mem:save   │  │bus:list      │
│task:list   │  │model:embed   │   │mem:query  │  │bus:schema    │
│task:kill   │  │model:list    │   │mem:archive│  │bus:inspect   │
└────────────┘  └──────────────┘   └───────────┘  └──────────────┘
      ▲ Below Bus: Both call and register abilities
```

### Terminology

- **Above Bus**: Modules that only invoke abilities but do not register any (e.g., Shell)
- **Below Bus**: Modules that both invoke and register abilities (e.g., Task Manager, Memory, Model Manager, Bus Controller)
- **Ability**: A callable capability with signature `(input: string) => Promise<string>` or `(input: string) => AsyncGenerator<string>`
- **Ability ID**: Unique identifier following pattern `${moduleName}:${abilityName}` (e.g., `task:spawn`, `model:llm`)

## Module Responsibilities

### 1. Shell (Above Bus)

**Purpose**: User-facing HTTP API layer

**Responsibilities**:
- Accept incoming messages via `POST /send`
- Stream task output via `GET /stream/:taskId` using SSE
- Provide inspection endpoints (reserved for future use)
- Translate HTTP requests to Agent Bus invocations

**Key Characteristics**:
- Does not register any abilities
- Pure consumer of Agent Bus
- Stateless request handler

### 2. Agent Bus Controller (Below Bus)

**Purpose**: Central communication hub and ability registry

**Responsibilities**:
- Route ability invocations to registered modules
- Maintain ability registry with metadata
- Provide ability discovery mechanisms
- Handle both synchronous and streaming invocations

**Registered Abilities**:
- `bus:list` - List all registered modules
- `bus:abilities` - List abilities of a module
- `bus:schema` - Get ability input/output schema
- `bus:inspect` - Get ability metadata

### 3. Task Manager (Below Bus)

**Purpose**: Process/task lifecycle management

**Responsibilities**:
- Create and manage concurrent tasks
- Maintain isolated context per task
- Route messages to appropriate tasks
- Execute task run loops with LLM

**Registered Abilities**:
- `task:spawn` - Create new task
- `task:send` - Send message to task
- `task:list` - List tasks with filters
- `task:get` - Get task details
- `task:kill` - Terminate task

**Key Feature**: Task Manager can invoke `task:spawn` to create sub-tasks, enabling recursive task trees.

### 4. Model Manager (Below Bus)

**Purpose**: ABI (Application Binary Interface) for LLM providers

**Responsibilities**:
- Abstract LLM and Embedding API calls
- Manage model instances and configurations
- Provide unified interface across different providers
- Handle streaming responses

**Registered Abilities**:
- `model:llm` - Invoke LLM completion
- `model:embed` - Generate embeddings
- `model:list` - List available models
- `model:register` - Register model instance

### 5. Memory (Below Bus)

**Purpose**: Persistent storage and knowledge management

**Responsibilities**:
- Store complete task records (lower layer)
- Maintain semantic knowledge graph (upper layer)
- Support vector similarity search
- Enable graph traversal queries

**Registered Abilities**:
- `mem:save` - Save task record
- `mem:query` - Query historical tasks
- `mem:retrieve` - Semantic retrieval
- `mem:archive` - Archive to knowledge graph
- `mem:graph` - Graph traversal

**Storage Architecture**:
- **Lower Layer**: File system (complete task records)
- **Upper Layer**: Chroma (vectors) + Neo4j (graph)

## Code Structure

```
src/service/agent-os/
├── index.ts                    # Public API exports
├── types.ts                    # Shared type definitions
│
├── bus/                        # Agent Bus Controller
│   ├── index.ts                # Bus implementation
│   ├── types.ts                # Bus-specific types
│   ├── registry.ts             # Ability registry
│   └── controller.ts           # Bus controller abilities
│
├── shell/                      # Shell (HTTP API)
│   ├── index.ts                # Shell entry point
│   ├── routes.ts               # HTTP route handlers
│   └── types.ts                # Shell-specific types
│
├── task/                       # Task Manager
│   ├── index.ts                # Task manager implementation
│   ├── types.ts                # Task-specific types
│   ├── abilities.ts            # Task abilities (spawn, send, etc)
│   ├── runloop.ts              # Task execution loop
│   └── router.ts               # Message routing logic
│
├── model/                      # Model Manager
│   ├── index.ts                # Model manager implementation
│   ├── types.ts                # Model-specific types
│   ├── abilities.ts            # Model abilities (llm, embed, etc)
│   └── providers/              # Provider adapters
│       ├── openai.ts
│       └── anthropic.ts
│
└── memory/                     # Memory
    ├── index.ts                # Memory implementation
    ├── types.ts                # Memory-specific types
    ├── abilities.ts            # Memory abilities
    ├── lower/                  # Lower layer (file storage)
    │   ├── index.ts
    │   └── storage.ts
    └── upper/                  # Upper layer (semantic index)
        ├── index.ts
        ├── vector.ts           # Chroma integration
        └── graph.ts            # Neo4j integration
```

## Design Principles

### 1. Bus-First Communication

All inter-module communication goes through the Agent Bus. No direct module-to-module dependencies.

**Good**:
```typescript
// Module A calls Module B through bus
const result = await bus.invoke('moduleB:action')('input data');
```

**Bad**:
```typescript
// Module A directly imports Module B
import { moduleB } from '../moduleB';
const result = await moduleB.action('input data');
```

### 2. Uniform Ability Interface

Every ability follows one of two signatures:

```typescript
// Synchronous (single response)
type AbilitySync = (input: string) => Promise<string>;

// Streaming (multiple chunks)
type AbilityStream = (input: string) => AsyncGenerator<string>;
```

Input and output are always strings. Complex data structures are JSON-encoded.

### 3. Ability ID Naming Convention

Format: `${moduleName}:${abilityName}`

- Use lowercase
- Module name is singular (e.g., `task`, not `tasks`)
- Ability name is verb-based (e.g., `spawn`, `list`, `get`)

**Examples**:
- `task:spawn` - Create task
- `model:llm` - Invoke LLM
- `mem:retrieve` - Retrieve memory

### 4. Schema-First Design

Every ability must declare input/output schema using JSON Schema:

```typescript
type AbilityMeta = {
  id: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  isStream: boolean;
};
```

This enables:
- Runtime validation
- Auto-generated documentation
- Tool definition for LLM

### 5. Functional Style

- Prefer pure functions
- Avoid classes when possible
- Use `type` instead of `interface`
- Keep functions under 50 lines
- Extract subfunctions for clarity

## Ability Discovery Flow

The Bus Controller provides introspection capabilities:

```
┌─────────────────────────────────────────────────────┐
│ Client wants to call an ability                     │
└─────────────────┬───────────────────────────────────┘
                  │
                  ▼
         ┌────────────────────┐
         │ bus:list           │  → ['task', 'model', 'mem', 'bus']
         └─────────┬──────────┘
                   │
                   ▼
         ┌────────────────────┐
         │ bus:abilities      │  → ['task:spawn', 'task:send', ...]
         │   (module='task')  │
         └─────────┬──────────┘
                   │
                   ▼
         ┌────────────────────┐
         │ bus:schema         │  → { inputSchema: {...}, 
         │   (id='task:spawn')│      outputSchema: {...} }
         └─────────┬──────────┘
                   │
                   ▼
         ┌────────────────────┐
         │ bus:invoke         │  → Execute ability
         │   (id='task:spawn')│
         └────────────────────┘
```

## Task Execution Flow

High-level flow of a user message through the system:

```
┌──────────────────────────────────────────────────┐
│ User sends message via POST /send                │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Shell invokes bus:invoke('task:spawn')(message)  │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Manager creates task with goal=message      │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Run Loop invokes model:llm with context     │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ LLM returns tool calls (e.g., mem:retrieve)      │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Run Loop invokes abilities via bus          │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ LLM generates final response                     │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Shell streams output to user via SSE             │
└──────────────────────────────────────────────────┘
```

## Integration with Existing System

Agent OS is developed alongside the existing `agent/` implementation:

```
src/service/
├── agent/              # Existing implementation (unchanged)
├── agent-os/           # New OS architecture
└── server/             # Existing HTTP server (unchanged)
```

This allows:
- Parallel development without breaking existing code
- Gradual migration path
- Easy comparison between architectures
- Rollback capability if needed

## Next Steps

Each module is documented in detail:

1. **Shell Module** → `agent-os-02-shell.md`
2. **Agent Bus** → `agent-os-03-bus.md`
3. **Task Manager** → `agent-os-04-task.md`
4. **Model Manager** → `agent-os-05-model.md`
5. **Memory** → `agent-os-06-memory.md`

## Summary

Agent OS architecture provides:

✅ **Decoupled modules** via bus-based communication
✅ **Uniform interfaces** for all abilities
✅ **Discoverable capabilities** through introspection
✅ **Recursive task trees** with Task Manager as ability
✅ **Clean separation** of concerns (Shell, Task, Model, Memory)
✅ **Parallel development** alongside existing system

The OS analogy makes the system intuitive: Shell for user interaction, Tasks for processes, Memory for storage, Model Manager for hardware abstraction, and Agent Bus as the system bus connecting everything.

