# Agent 五元设计文档

## 概述

Agent 采用五元架构设计，将复杂的 AI 系统分解为五个核心模块：

1. **Model Manager (模型管理模块)** - 统一管理 LLM 和 Embedding 模型
2. **Instruction Set (指令集模块)** - 封装可复用的 AI 指令
3. **Task Manager (任务调度模块)** - 管理并发任务和执行循环
4. **Memory (记忆仓库)** - 双层记忆系统（知识图谱 + 原始记录）
5. **Agent Facade (门面模块)** - 统一对外接口

相比传统的单一 Agent 设计，五元架构具有更好的模块化、可扩展性和可维护性。

---

## 1. Model Manager (模型管理模块)

### 核心职责

- 统一管理 LLM 和 Embedding 模型实例
- 提供模型调用的统一接口
- 支持多模型配置和 fallback 机制
- 隔离 API key 等敏感信息

### 类型定义

```typescript
// 模型类型
type ModelType = 'llm' | 'embedding';

// 模型实例配置
type ModelInstance = {
  id: string;                    // 模型实例唯一标识
  type: ModelType;
  endpoint: string;              // API endpoint
  model: string;                 // 模型名称（如 gpt-4, text-embedding-3-small）
  apiKey?: string;               // API key（可选，支持从环境变量读取）
  temperature?: number;          // 温度参数
  maxTokens?: number;            // 最大 token 数
};

// LLM 调用配置
type LLMCallConfig = {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

// ChatMessage 类型（复用 OpenAI 格式）
type ChatMessage = 
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ToolCall[] }
  | { role: 'tool'; content: string; tool_call_id: string };

// Tool Call 和 Definition（复用 OpenAI 格式）
type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;  // JSON string
  };
};

type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;  // JSON Schema
  };
};

// LLM 输出块（流式）
type LLMChunk = {
  content: string;
  toolCalls?: ToolCall[];
  finished: boolean;
  error?: string;
};

// Embedding 输出
type EmbeddingOutput = {
  embedding: number[];
  error?: string;
};

// Model Manager 接口
type ModelManager = {
  // 注册模型实例
  registerModel: (model: ModelInstance) => void;
  
  // 获取模型实例
  getModel: (id: string) => ModelInstance | undefined;
  
  // LLM 调用（流式）
  callLLM: (modelId: string, config: LLMCallConfig) => AsyncGenerator<LLMChunk>;
  
  // Embedding 调用
  callEmbedding: (modelId: string, text: string) => Promise<EmbeddingOutput>;
  
  // 列出所有模型
  listModels: () => ModelInstance[];
};
```

### 设计要点

1. **API Key 管理**：优先从环境变量读取，支持实例级别覆盖
2. **错误处理**：统一错误格式，支持 fallback 到备用模型
3. **流式调用**：LLM 调用统一返回 AsyncGenerator，支持流式输出
4. **类型安全**：直接复用 OpenAI 的标准类型，保证兼容性

---

## 2. Instruction Set (指令集模块)

### 核心职责

- 将特定任务封装为可复用的指令
- 每个指令 = System Prompt + 工具集 + 模型配置
- 提供 `string -> JSON` 或 `string -> stream` 的执行接口
- 支持多轮 tool calling

### 类型定义

```typescript
// 指令输出模式
type InstructionOutputMode = 'json' | 'stream';

// 指令配置
type InstructionConfig<T = any> = {
  name: string;                          // 指令名称（唯一标识）
  description: string;                   // 指令描述
  systemPrompt: string;                  // System prompt
  tools: string[];                       // 可用工具名称列表
  modelId: string;                       // 使用的模型 ID
  outputMode: InstructionOutputMode;     // 输出模式
  outputSchema?: Record<string, any>;    // JSON 输出的 schema（outputMode=json 时必填）
  maxToolCallRounds?: number;            // 最大工具调用轮数（默认 5）
};

// 指令执行上下文
type InstructionContext = {
  input: string;                         // 用户输入
  modelManager: ModelManager;            // 模型管理器
  toolRegistry: ToolRegistry;            // 工具注册表
};

// 指令执行结果（JSON 模式）
type InstructionResultJSON<T = any> = {
  success: true;
  data: T;
  toolCallsHistory: ToolCallRecord[];    // 工具调用历史
} | {
  success: false;
  error: string;
  toolCallsHistory: ToolCallRecord[];
};

// 指令执行结果（Stream 模式）
type InstructionResultStream = AsyncGenerator<{
  type: 'content' | 'tool_call' | 'tool_result';
  content?: string;
  toolCall?: ToolCallRecord;
  toolResult?: ToolResult;
}>;

// 工具调用记录
type ToolCallRecord = {
  tool: string;
  args: Record<string, any>;
  result?: ToolResult;
  timestamp: number;
};

// 工具执行结果
type ToolResult = {
  id: string;
  content: string;
  error?: string;
};

// Instruction 实例
type Instruction<T = any> = {
  config: InstructionConfig<T>;
  
  // 执行指令（根据 outputMode 返回不同类型）
  execute: (
    input: string,
    context: InstructionContext
  ) => InstructionConfig<T>['outputMode'] extends 'json'
    ? Promise<InstructionResultJSON<T>>
    : InstructionResultStream;
};

// Instruction Registry
type InstructionRegistry = {
  // 注册指令
  register: <T>(config: InstructionConfig<T>) => void;
  
  // 获取指令
  get: <T>(name: string) => Instruction<T> | undefined;
  
  // 执行指令（便捷方法）
  execute: <T>(
    name: string,
    input: string,
    context: InstructionContext
  ) => Promise<InstructionResultJSON<T>> | InstructionResultStream;
  
  // 列出所有指令
  list: () => InstructionConfig[];
};
```

### 内置指令

系统预定义以下指令：

1. **router** - 消息路由指令
   - 输入：用户消息 + 当前活跃任务列表
   - 输出：`{ taskId: string | null, confidence: number, reason: string }`
   - 判断消息应该归属到哪个任务

2. **executor** - 任务执行指令
   - 输入：用户消息
   - 输出：流式响应
   - 执行具体任务，可调用各种工具

3. **memory_archiver** - 记忆归档指令
   - 输入：完成的任务上下文
   - 输出：`{ nodes: KnowledgeNode[], edges: KnowledgeEdge[] }`
   - 从任务中提取知识并构建图谱关系

4. **memory_retriever** - 记忆检索指令
   - 输入：查询字符串
   - 输出：`{ strategy: 'bfs' | 'dfs' | 'astar', startNodes: string[] }`
   - 决定如何在知识图谱中搜索

### 设计要点

1. **分离关注点**：每个指令专注于一个特定任务
2. **可配置性**：通过配置创建指令，易于调整和测试
3. **工具组合**：每个指令只暴露需要的工具，避免工具过多导致模型混乱
4. **类型安全**：使用泛型 `<T>` 约束输出类型

---

## 3. Task Manager (任务调度模块)

### 核心职责

- 维护多个并发执行的任务
- 为每个任务管理独立的上下文（messages）
- 执行消息路由，将新消息分配到正确的任务
- 提供任务生命周期管理

### 类型定义

```typescript
// 任务状态
type TaskStatus = 'pending' | 'active' | 'waiting' | 'completed' | 'failed' | 'cancelled';

// 任务上下文（一个任务的完整 message 历史）
type TaskContext = {
  messages: ChatMessage[];               // 完整的消息历史
  toolCallHistory: ToolCallRecord[];     // 工具调用历史
};

// 任务定义
type Task = {
  id: string;                            // 任务 ID
  goal: string;                          // 任务目标（首个用户消息）
  status: TaskStatus;
  context: TaskContext;
  instructionName: string;               // 使用的指令名称（默认 'executor'）
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  
  // 任务元数据
  metadata: {
    iterationCount: number;              // 迭代次数
    lastUserMessageAt?: number;          // 最后一条用户消息时间
  };
};

// 任务输出事件
type TaskOutput = 
  | { type: 'task_start'; taskId: string; goal: string }
  | { type: 'content'; taskId: string; content: string }
  | { type: 'tool_call'; taskId: string; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; taskId: string; tool: string; result: string; error?: string }
  | { type: 'task_end'; taskId: string; status: 'completed' | 'failed' }
  | { type: 'error'; taskId: string; error: string };

// 路由结果
type RouteResult = {
  taskId: string | null;                 // null 表示创建新任务
  confidence: number;                    // 置信度 0-1
  reason: string;                        // 路由原因
};

// Task Manager 接口
type TaskManager = {
  // 发送消息（核心方法）
  send: (
    message: string,
    taskId?: string                      // 可选：指定任务 ID
  ) => AsyncGenerator<TaskOutput>;
  
  // 任务管理
  getTask: (taskId: string) => Task | undefined;
  listTasks: (filter?: { status?: TaskStatus }) => Task[];
  cancelTask: (taskId: string) => void;
  
  // 手动控制
  createTask: (goal: string, instructionName?: string) => Task;
  appendToTask: (taskId: string, message: string) => AsyncGenerator<TaskOutput>;
};
```

### 任务执行流程

```
┌─────────────────────────────────────────────────────────────┐
│                     收到新消息                                 │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │ 用户指定了 taskId？     │
         └────────┬───────┬───────┘
                  │       │
            Yes   │       │  No
                  │       │
                  ▼       ▼
         ┌────────────┐  ┌─────────────────────┐
         │ 任务存在？  │  │  调用 router 指令    │
         └──┬────┬────┘  │  判断消息归属        │
            │    │       └──────────┬──────────┘
       Yes  │    │ No               │
            │    │                  ▼
            │    │       ┌──────────────────────┐
            │    │       │ 是否匹配现有任务？    │
            │    │       └────┬─────────┬───────┘
            │    │            │         │
            │    │       Yes  │         │  No
            │    │            │         │
            ▼    ▼            ▼         ▼
         ┌──────────────┐  ┌──────────────────┐
         │ 追加到任务    │  │   创建新任务      │
         └──────┬───────┘  └────────┬─────────┘
                │                   │
                └───────┬───────────┘
                        │
                        ▼
              ┌──────────────────────┐
              │  执行任务 Run Loop    │
              │  (调用指令执行)       │
              └──────────┬───────────┘
                         │
                         ▼
              ┌──────────────────────┐
              │  流式输出 TaskOutput  │
              └──────────────────────┘
```

### 任务 Run Loop

每个任务的执行循环：

1. **准备上下文**：将用户消息追加到 task.context.messages
2. **执行指令**：调用 instruction.execute()，传入完整上下文
3. **处理工具调用**：
   - 如果指令返回 tool_calls，执行工具
   - 将工具结果追加到上下文
   - 继续调用指令（最多 maxToolCallRounds 轮）
4. **输出响应**：流式输出内容给用户
5. **更新状态**：
   - 如果指令完成 → 任务状态改为 'completed'
   - 如果需要用户输入 → 任务状态改为 'waiting'
   - 如果出错 → 任务状态改为 'failed'

### 设计要点

1. **消息路由优先**：每条消息都先经过 router 指令判断归属
2. **上下文隔离**：每个任务有独立的 context，互不干扰
3. **流式输出**：使用 AsyncGenerator 实时推送任务输出
4. **并发支持**：可以同时运行多个任务

---

## 4. Memory (记忆仓库)

### 核心职责

- **下层记忆**：存储所有任务的原始消息和工具调用记录
- **上层记忆**：维护知识图谱，支持向量检索和图遍历
- 提供记忆归档和检索的 Instruction 和 Tool 接口
- 支持任务上下文的回忆和重建

### 类型定义

```typescript
// ============= 下层记忆：原始记录 =============

// 存储的任务记录
type StoredTask = Task & {
  archivedAt: number;
};

// 下层记忆接口
type LowerMemory = {
  // 保存任务
  saveTask: (task: Task) => Promise<void>;
  
  // 获取任务
  getTask: (taskId: string) => Promise<StoredTask | undefined>;
  
  // 查询任务
  queryTasks: (filter: {
    status?: TaskStatus;
    fromDate?: number;
    toDate?: number;
    limit?: number;
  }) => Promise<StoredTask[]>;
  
  // 获取任务的完整上下文
  getTaskContext: (taskId: string) => Promise<TaskContext | undefined>;
};

// ============= 上层记忆：知识图谱 =============

// 知识节点类型
type KnowledgeNodeType = 'concept' | 'fact' | 'procedure' | 'question' | 'answer';

// 知识节点
type KnowledgeNode = {
  id: string;
  type: KnowledgeNodeType;
  content: string;                       // 节点内容（文本）
  embedding?: number[];                  // 向量索引（可选）
  
  // 溯源信息
  source: {
    taskId: string;                      // 来源任务
    timestamp: number;                   // 创建时间
  };
  
  // 元数据
  metadata: Record<string, any>;
};

// 知识边类型
type KnowledgeEdgeType = 
  | 'related_to'      // 相关
  | 'followed_by'     // 因果/时序
  | 'contradicts'     // 矛盾
  | 'derived_from'    // 推导
  | 'part_of';        // 从属

// 知识边
type KnowledgeEdge = {
  id: string;
  type: KnowledgeEdgeType;
  from: string;                          // 源节点 ID
  to: string;                            // 目标节点 ID
  weight: number;                        // 边权重（0-1）
  metadata?: Record<string, any>;
};

// 图遍历策略
type GraphTraversalStrategy = 'bfs' | 'dfs' | 'astar';

// 检索结果
type RetrievalResult = {
  nodes: KnowledgeNode[];                // 检索到的节点
  paths?: KnowledgeEdge[][];             // 节点之间的路径（可选）
  relevanceScores: Record<string, number>; // 节点相关性分数
};

// 上层记忆接口
type UpperMemory = {
  // 添加节点
  addNode: (node: Omit<KnowledgeNode, 'id'>) => Promise<string>;
  
  // 添加边
  addEdge: (edge: Omit<KnowledgeEdge, 'id'>) => Promise<string>;
  
  // 向量检索（基于 embedding 相似度）
  vectorSearch: (
    query: string,
    limit?: number
  ) => Promise<KnowledgeNode[]>;
  
  // 图遍历（从起始节点开始遍历）
  traverse: (
    startNodeIds: string[],
    strategy: GraphTraversalStrategy,
    maxDepth?: number
  ) => AsyncGenerator<KnowledgeNode>;
  
  // 混合检索（向量检索 + 图遍历）
  retrieve: (
    query: string,
    options?: {
      vectorLimit?: number;
      traversalStrategy?: GraphTraversalStrategy;
      maxDepth?: number;
    }
  ) => Promise<RetrievalResult>;
  
  // 获取节点
  getNode: (nodeId: string) => Promise<KnowledgeNode | undefined>;
  
  // 获取节点的邻居
  getNeighbors: (
    nodeId: string,
    edgeType?: KnowledgeEdgeType
  ) => Promise<{ node: KnowledgeNode; edge: KnowledgeEdge }[]>;
};

// ============= Memory 总接口 =============

type Memory = {
  lower: LowerMemory;
  upper: UpperMemory;
  
  // 便捷方法：归档任务到知识图谱
  archiveTask: (task: Task) => Promise<void>;
  
  // 便捷方法：回忆相关上下文（用于任务开始时）
  recall: (query: string) => Promise<{
    relevantNodes: KnowledgeNode[];
    relatedTasks: StoredTask[];
  }>;
};
```

### 记忆归档流程

当任务完成时，通过 `memory_archiver` 指令归档：

1. **提取知识**：
   - LLM 分析任务的 context，提取关键概念、事实、步骤等
   - 为每个知识点创建 KnowledgeNode
   
2. **建立关联**：
   - LLM 判断新知识与现有知识的关系
   - 创建 KnowledgeEdge（related_to, derived_from 等）
   
3. **生成 Embedding**：
   - 为每个节点的 content 生成向量
   - 存储到向量数据库
   
4. **保存原始记录**：
   - 将完整的 Task 保存到下层记忆
   - 用于溯源和审计

### 记忆检索流程

在任务开始时，通过 `memory_retriever` 指令检索：

1. **向量检索**：
   - 将用户查询生成 embedding
   - 在向量数据库中找到最相关的 N 个节点
   
2. **图遍历**：
   - 从检索到的节点出发
   - 根据策略（BFS/DFS/A*）遍历图谱
   - 收集相关节点
   
3. **溯源任务**：
   - 根据节点的 source.taskId
   - 从下层记忆加载相关任务的上下文
   
4. **构建上下文**：
   - 将检索到的知识整理成上下文
   - 作为新任务的初始 system message

### 存储方案

- **下层记忆**：文件系统（JSON 文件）或 SQLite
- **上层记忆 - 向量数据库**：Chroma 或 Qdrant
- **上层记忆 - 图数据库**：Neo4j 或简单的邻接表（JSON）

### 设计要点

1. **双层分离**：原始记录和知识图谱分离存储，各司其职
2. **可溯源**：每个知识节点都记录来源任务，支持回溯
3. **渐进式**：知识图谱随着任务执行逐步构建
4. **多模检索**：结合向量相似度和图结构，提高检索质量

---

## 5. Agent Facade (门面模块)

### 核心职责

- 封装 Agent 的所有对外接口
- 协调五个模块的初始化和交互
- 提供统一的消息收发接口
- 暴露状态检查和调试接口

### 类型定义

```typescript
// Agent 配置
type AgentConfig = {
  // 模型配置
  models: ModelInstance[];
  defaultLLMId: string;
  defaultEmbeddingId: string;
  
  // 指令配置
  instructions?: InstructionConfig[];    // 自定义指令（可选）
  
  // 工具配置
  tools?: Tool[];                        // 自定义工具（可选）
  
  // 记忆配置
  memory: {
    lowerStoragePath: string;            // 下层记忆存储路径
    vectorStoreConfig: {
      type: 'chroma' | 'qdrant';
      endpoint: string;
      apiKey?: string;
    };
    graphStoreConfig?: {                 // 可选：图数据库配置
      type: 'neo4j' | 'json';
      endpoint?: string;
    };
  };
  
  // 任务配置
  task: {
    maxConcurrentTasks?: number;         // 最大并发任务数（默认 10）
    autoArchiveAfter?: number;           // 任务完成后自动归档时间（ms，默认 5 分钟）
  };
};

// Agent 输出（统一的输出事件类型）
type AgentOutput = TaskOutput;           // 直接复用 TaskOutput

// Agent Facade 接口
type AgentFacade = {
  // ============= 主接口 =============
  
  // 发送消息
  send: (
    message: string,
    taskId?: string
  ) => AsyncGenerator<AgentOutput>;
  
  // ============= 状态检查接口 =============
  
  inspection: {
    // 任务相关
    getTasks: (filter?: { status?: TaskStatus }) => Task[];
    getTask: (taskId: string) => Task | undefined;
    
    // 记忆相关
    getMemoryStats: () => Promise<{
      totalTasks: number;
      totalNodes: number;
      totalEdges: number;
    }>;
    
    searchMemory: (query: string) => Promise<RetrievalResult>;
    
    // 模型和指令
    listModels: () => ModelInstance[];
    listInstructions: () => InstructionConfig[];
    listTools: () => ToolDefinition[];
  };
  
  // ============= 管理接口 =============
  
  management: {
    // 任务管理
    cancelTask: (taskId: string) => void;
    archiveTask: (taskId: string) => Promise<void>;
    
    // 记忆管理
    addKnowledgeNode: (node: Omit<KnowledgeNode, 'id' | 'source'>) => Promise<string>;
    addKnowledgeEdge: (edge: Omit<KnowledgeEdge, 'id'>) => Promise<string>;
    
    // 动态注册
    registerModel: (model: ModelInstance) => void;
    registerInstruction: (instruction: InstructionConfig) => void;
    registerTool: (tool: Tool) => void;
  };
  
  // ============= 生命周期 =============
  
  // 关闭 Agent（清理资源）
  shutdown: () => Promise<void>;
};

// Agent 工厂函数
type CreateAgent = (config: AgentConfig) => Promise<AgentFacade>;
```

### Agent 初始化流程

```typescript
async function createAgent(config: AgentConfig): Promise<AgentFacade> {
  // 1. 初始化 Model Manager
  const modelManager = createModelManager();
  config.models.forEach(model => modelManager.registerModel(model));
  
  // 2. 初始化 Memory
  const memory = await createMemory({
    lowerStoragePath: config.memory.lowerStoragePath,
    vectorStore: config.memory.vectorStoreConfig,
    graphStore: config.memory.graphStoreConfig,
    modelManager, // 用于生成 embedding
    embeddingModelId: config.defaultEmbeddingId,
  });
  
  // 3. 初始化 Tool Registry
  const toolRegistry = createToolRegistry();
  
  // 注册内置工具
  registerBuiltinTools(toolRegistry, memory);
  
  // 注册自定义工具
  config.tools?.forEach(tool => toolRegistry.register(tool));
  
  // 4. 初始化 Instruction Registry
  const instructionRegistry = createInstructionRegistry();
  
  // 注册内置指令
  registerBuiltinInstructions(instructionRegistry, {
    modelManager,
    defaultLLMId: config.defaultLLMId,
  });
  
  // 注册自定义指令
  config.instructions?.forEach(inst => instructionRegistry.register(inst));
  
  // 5. 初始化 Task Manager
  const taskManager = createTaskManager({
    instructionRegistry,
    modelManager,
    toolRegistry,
    memory,
    maxConcurrentTasks: config.task.maxConcurrentTasks,
  });
  
  // 6. 组装 Facade
  return {
    send: taskManager.send,
    inspection: {
      getTasks: taskManager.listTasks,
      getTask: taskManager.getTask,
      getMemoryStats: async () => {
        // 实现统计逻辑
      },
      searchMemory: memory.upper.retrieve,
      listModels: modelManager.listModels,
      listInstructions: instructionRegistry.list,
      listTools: toolRegistry.getDefinitions,
    },
    management: {
      cancelTask: taskManager.cancelTask,
      archiveTask: memory.archiveTask,
      addKnowledgeNode: memory.upper.addNode,
      addKnowledgeEdge: memory.upper.addEdge,
      registerModel: modelManager.registerModel,
      registerInstruction: instructionRegistry.register,
      registerTool: toolRegistry.register,
    },
    shutdown: async () => {
      // 清理资源、保存状态等
    },
  };
}
```

### 使用示例

```typescript
import { createAgent } from './service/agent';

// 1. 创建 Agent
const agent = await createAgent({
  models: [
    {
      id: 'gpt4',
      type: 'llm',
      endpoint: 'https://api.openai.com/v1',
      model: 'gpt-4-turbo',
      temperature: 0.7,
    },
    {
      id: 'embedding',
      type: 'embedding',
      endpoint: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
    },
  ],
  defaultLLMId: 'gpt4',
  defaultEmbeddingId: 'embedding',
  memory: {
    lowerStoragePath: '~/.bun-buddy/tasks',
    vectorStoreConfig: {
      type: 'chroma',
      endpoint: 'http://localhost:8000',
    },
    graphStoreConfig: {
      type: 'json',
    },
  },
  task: {
    maxConcurrentTasks: 5,
  },
});

// 2. 发送消息
for await (const output of agent.send('帮我查一下今天的天气')) {
  switch (output.type) {
    case 'task_start':
      console.log(`🚀 Task started: ${output.taskId}`);
      break;
    case 'content':
      process.stdout.write(output.content);
      break;
    case 'tool_call':
      console.log(`🔧 Calling ${output.tool}`);
      break;
    case 'task_end':
      console.log(`\n✅ Task ${output.status}`);
      break;
  }
}

// 3. 检查状态
const tasks = agent.inspection.getTasks({ status: 'active' });
console.log(`Active tasks: ${tasks.length}`);

// 4. 搜索记忆
const memory = await agent.inspection.searchMemory('天气查询');
console.log(`Found ${memory.nodes.length} related knowledge nodes`);

// 5. 关闭
await agent.shutdown();
```

---

## 目录结构

```
src/service/agent/
├── index.ts                    # 导出主要 API
├── types.ts                    # 类型定义汇总
├── facade.ts                   # Agent Facade 实现
│
├── model/                      # Model Manager
│   ├── index.ts                # ModelManager 实现
│   └── providers/              # 不同模型提供商的适配器
│       ├── openai.ts
│       └── anthropic.ts
│
├── instruction/                # Instruction Set
│   ├── index.ts                # InstructionRegistry 实现
│   ├── executor.ts             # 指令执行引擎
│   └── builtins/               # 内置指令
│       ├── router.ts           # 路由指令
│       ├── executor.ts         # 执行指令
│       ├── archiver.ts         # 归档指令
│       └── retriever.ts        # 检索指令
│
├── task/                       # Task Manager
│   ├── index.ts                # TaskManager 实现
│   ├── runloop.ts              # Task Run Loop 逻辑
│   └── router.ts               # 消息路由逻辑
│
├── memory/                     # Memory
│   ├── index.ts                # Memory 总接口
│   ├── lower/                  # 下层记忆
│   │   ├── index.ts
│   │   └── storage.ts          # 文件存储或 SQLite
│   └── upper/                  # 上层记忆
│       ├── index.ts
│       ├── vector.ts           # 向量数据库接口
│       ├── graph.ts            # 图数据库接口
│       └── retrieval.ts        # 检索逻辑
│
└── tool/                       # Tool Registry
    ├── index.ts                # ToolRegistry 实现
    └── builtins/               # 内置工具
        ├── memory.ts           # 记忆相关工具
        ├── web.ts              # 网络搜索
        └── script.ts           # 脚本执行
```

---

## 实现路径

### Phase 1: 基础设施（1-2 周）

1. **Model Manager**
   - [ ] 实现基础的 ModelManager
   - [ ] 实现 OpenAI provider
   - [ ] 支持 LLM 和 Embedding 调用
   - [ ] 添加错误处理和重试逻辑

2. **Tool Registry**
   - [ ] 实现 ToolRegistry
   - [ ] 添加基础内置工具（echo, web_search）
   - [ ] 测试工具执行

3. **Instruction Set**
   - [ ] 实现 InstructionRegistry
   - [ ] 实现指令执行引擎（支持多轮 tool calling）
   - [ ] 实现 router 指令
   - [ ] 实现 executor 指令

### Phase 2: 任务管理（1-2 周）

4. **Task Manager**
   - [ ] 实现基础的 TaskManager
   - [ ] 实现消息路由逻辑
   - [ ] 实现 Task Run Loop
   - [ ] 支持并发任务

5. **集成测试**
   - [ ] 端到端测试：创建任务、执行、完成
   - [ ] 测试消息路由
   - [ ] 测试并发任务

### Phase 3: 记忆系统（2-3 周）

6. **下层记忆**
   - [ ] 实现文件存储
   - [ ] 任务保存和查询
   - [ ] 测试持久化

7. **上层记忆 - 向量检索**
   - [ ] 集成 Chroma 或 Qdrant
   - [ ] 实现向量检索
   - [ ] 测试检索质量

8. **上层记忆 - 知识图谱**
   - [ ] 实现简单的图结构（邻接表）
   - [ ] 实现图遍历算法（BFS, DFS）
   - [ ] 测试图检索

9. **记忆指令**
   - [ ] 实现 memory_archiver 指令
   - [ ] 实现 memory_retriever 指令
   - [ ] 实现记忆相关工具
   - [ ] 端到端测试归档和检索流程

### Phase 4: 对外接口（1 周）

10. **Agent Facade**
    - [ ] 实现 createAgent 工厂函数
    - [ ] 实现 inspection 接口
    - [ ] 实现 management 接口
    - [ ] 编写使用文档

11. **HTTP Server 集成**
    - [ ] 将 Agent 集成到现有 HTTP 服务
    - [ ] 实现 SSE 推送
    - [ ] 更新 API 文档

### Phase 5: 优化和完善（持续）

12. **性能优化**
    - [ ] 优化向量检索性能
    - [ ] 实现缓存机制
    - [ ] 优化并发任务调度

13. **功能增强**
    - [ ] 支持更多模型提供商（Anthropic, etc.）
    - [ ] 添加更多内置工具
    - [ ] 支持自定义指令模板

14. **监控和调试**
    - [ ] 添加日志和追踪
    - [ ] 实现可视化调试界面
    - [ ] 性能监控

---

## 待讨论的设计细节

### 1. Router 指令的判断策略

**选项 A：纯 LLM 判断**
- 优点：灵活，能理解语义
- 缺点：慢，成本高

**选项 B：向量相似度 + LLM 确认**
- 优点：快速筛选，LLM 最终确认
- 缺点：实现复杂

**选项 C：规则 + LLM**
- 优点：常见场景用规则，复杂场景用 LLM
- 缺点：规则维护成本

**建议**：采用 B，先用向量相似度筛选出 top-3 候选任务，再让 LLM 最终判断。

### 2. 工具并发执行

**场景**：LLM 一次返回多个 tool calls

**选项 A：串行执行**
- 优点：简单，可控
- 缺点：慢

**选项 B：并发执行**
- 优点：快
- 缺点：可能有依赖关系

**建议**：默认并发，但允许工具声明依赖关系（如 `dependsOn: ['tool_name']`）。

### 3. 知识图谱的构建策略

**问题**：如何决定节点之间的关系？

**选项 A：完全依赖 LLM**
- memory_archiver 指令分析任务，输出节点和边

**选项 B：混合策略**
- 简单关系用规则（如时序关系）
- 复杂关系用 LLM（如推导、矛盾）

**建议**：采用 A，让 LLM 完全控制，保证灵活性。

### 4. 任务生命周期管理

**问题**：
- 任务什么时候自动结束？
- 任务什么时候归档？
- 长时间不活跃的任务如何处理？

**建议**：
- LLM 通过特殊的 tool call（如 `complete_task`）标记任务完成
- 任务完成后 5 分钟自动归档到长期记忆
- 超过 24 小时不活跃的任务自动标记为 'stale'，提示用户确认

### 5. Observable 集成

**问题**：是否用 Observable 暴露 Agent 状态？

**建议**：
- Task 列表暴露为 Observable，方便 UI 订阅
- Memory stats 暴露为 Observable
- 实现 `agent.observe((state) => { ... })` 接口

---

## 总结

五元架构将 Agent 系统分解为五个职责清晰的模块：

1. **Model Manager** - 统一模型调用
2. **Instruction Set** - 可复用的 AI 指令
3. **Task Manager** - 并发任务调度
4. **Memory** - 双层记忆系统
5. **Agent Facade** - 统一对外接口

相比原有的 Run Loop 设计，五元架构具有：
- ✅ 更好的模块化和可测试性
- ✅ 更强的扩展性（易于添加新指令、工具、模型）
- ✅ 更清晰的关注点分离
- ✅ 更灵活的任务管理（支持并发、路由）
- ✅ 更智能的记忆系统（知识图谱 + 向量检索）

这个架构适合构建复杂的、长期运行的 AI Agent 系统。
