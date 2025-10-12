# Agent OS Architecture Overview

## Introduction

Agent OS is a complete rewrite of the Agent system using an **Operating System Bus Architecture**. The design draws inspiration from OS concepts: Shell (user interface), Task Manager (process management), Ledger (transaction log), Memory (semantic index), Model Manager (ABI), and a central Agent Bus for inter-module communication.

## Core Concepts

### Bus Architecture

Unlike traditional layered architectures, Agent OS uses a **bus-based architecture** where all modules communicate through a central Agent Bus. This decouples dependencies and enables flexible module composition.

```
                 ┌────────────────────┐
                 │  Shell (HTTP API)  │  ← Above Bus
                 └──────────┬─────────┘
                            │ invoke/invokeStream
                            ▼
      ╔══════════════════════════════════════════════════════════╗
      ║              Agent Bus Controller                        ║
      ║  - invoke(abilityId)(input)                              ║
      ║  - invokeStream(abilityId)(input)                        ║
      ║  - Ability Discovery (list/schema/inspect)               ║
      ╚══════════════════════════════════════════════════════════╝
               ▲          ▲          ▲          ▲          ▲
      ┌────────┘          │          │          │          └────────┐
      │                   │          │          │                   │
┌─────▼──────┐  ┌─────────▼───┐  ┌──▼───────┐  ┌────▼─────┐  ┌────▼─────┐
│   Task     │  │    Model    │  │  Ledger  │  │  Memory  │  │  Bus     │
│  Manager   │  │   Manager   │  │ (SQLite) │  │(Semantic)│  │  Ctrl    │
├────────────┤  ├─────────────┤  ├──────────┤  ├──────────┤  ├──────────┤
│task:route  │  │model:llm    │  │ldg:task:*│  │mem:      │  │bus:list  │
│task:create │  │model:embed  │  │ldg:call:*│  │ retrieve │  │bus:schema│
│task:cancel │  │model:list   │  │ldg:msg:* │  │mem:graph │  │bus:      │
│task:active │  │             │  │          │  │mem:      │  │ inspect  │
│            │  │             │  │          │  │ archive  │  │          │
└────────────┘  └─────────────┘  └──────────┘  └──────────┘  └──────────┘
      ▲ Below Bus: Both call and register abilities
```

### Terminology

- **Above Bus**: Modules that only invoke abilities but do not register any (e.g., Shell)
- **Below Bus**: Modules that both invoke and register abilities (e.g., Task Manager, Ledger, Memory, Model Manager, Bus Controller)
- **Ability**: A callable capability with signature `(input: string) => Promise<string>` or `(input: string) => AsyncGenerator<string>`
- **Ability ID**: Unique identifier following pattern `${moduleName}:${abilityName}` (e.g., `task:route`, `ldg:task:save`, `mem:retrieve`)

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
- Route user messages to appropriate tasks
- Create and cancel tasks
- Execute task run loops with LLM
- Persist all execution state to Ledger

**Registered Abilities**:
- `task:route` - Route message to task
- `task:create` - Create new task
- `task:cancel` - Cancel task
- `task:active` - List active tasks

**Key Features**: 
- Persistence-first architecture with continuous state saving to Ledger
- Streaming message handling with completion-based timestamps
- Full crash recovery capability

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

### 5. Ledger (Below Bus)

**Purpose**: Persistent storage ledger for complete task history

**Responsibilities**:
- Store Task, Call, Message entities in SQLite
- Provide structured queries (by time, by task, by status)
- Ensure data consistency with ACID transactions
- Support crash recovery and audit trails
- Manage mutable state (Task/Call) and immutable records (Message)

**Registered Abilities**:
- `ldg:task:save`, `ldg:task:get`, `ldg:task:query` - Task operations
- `ldg:call:save`, `ldg:call:list` - Call operations
- `ldg:msg:save`, `ldg:msg:list` - Message operations

**Storage**: `$HOME/.bun-buddy/ledger.sqlite`

**Key Features**:
- Task and Call states are mutable (can be updated)
- Messages are immutable (append-only)
- Streaming messages saved only after complete reception

### 6. Memory (Below Bus)

**Purpose**: Semantic knowledge layer

**Responsibilities**:
- Extract knowledge from Ledger task records
- Build vector index (Chroma) for semantic search
- Maintain knowledge graph (Neo4j) for relationships
- Provide intelligent retrieval and discovery

**Registered Abilities**:
- `mem:retrieve` - Semantic similarity search
- `mem:graph` - Knowledge graph traversal
- `mem:archive` - Extract and index task knowledge
- `mem:related` - Find related tasks

**Storage Architecture**:
- **Chroma**: Vector database for semantic similarity
- **Neo4j**: Graph database for knowledge relationships

**Key Feature**: Optional enhancement layer that reads from Ledger for knowledge extraction

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
│   ├── abilities.ts            # Task abilities (route, create, etc)
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
├── ledger/                     # Ledger (SQLite persistence)
│   ├── index.ts                # Ledger implementation
│   ├── types.ts                # Ledger-specific types
│   ├── abilities.ts            # Ledger abilities (save, get, query, list)
│   ├── db.ts                   # SQLite connection and initialization
│   ├── schema.ts               # Table structure definitions
│   └── queries.ts              # SQL query encapsulation
│
└── memory/                     # Memory (Semantic index)
    ├── index.ts                # Memory implementation
    ├── types.ts                # Memory-specific types
    ├── abilities.ts            # Memory abilities (retrieve, graph, archive)
    ├── extract.ts              # Knowledge extraction logic
    ├── vector.ts               # Chroma integration
    └── graph.ts                # Neo4j integration
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
5. **Memory (Semantic Layer)** → `agent-os-06-memory.md`
6. **Ledger (Persistence Layer)** → `agent-os-07-ledger.md`

## Summary

Agent OS architecture provides:

✅ **Decoupled modules** via bus-based communication
✅ **Uniform interfaces** for all abilities
✅ **Discoverable capabilities** through introspection
✅ **Persistence-first design** with SQLite Ledger
✅ **Optional semantic layer** with Memory (vectors + graph)
✅ **Clear separation** of concerns (Shell, Task, Model, Ledger, Memory)
✅ **Parallel development** alongside existing system

The OS analogy makes the system intuitive: Shell for user interaction, Task Manager for processes, Ledger for transaction log, Memory for semantic index, Model Manager for hardware abstraction, and Agent Bus as the system bus connecting everything.

