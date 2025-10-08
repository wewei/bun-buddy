# Agent 模块设计文档

## 概述

Agent 是对 LLM、Memory 和 Tool 调用的封装。Agent 不是简单的问答系统，而是基于 **Run Loop** 的持续思考和行动系统。

## 核心概念：Run Loop

每个用户问题对应一个 **Run Loop**，它是一个迭代循环：

- 观察（用户输入、工具结果）→ 思考（LLM 推理）→ 行动（调用工具）→ 观察 → ...
- 用户可以在 Run Loop 执行过程中补充信息
- Run Loop 完成后，详细内容会被分段索引到长期记忆

## 组件接口设计

### 1. LLM 接口

LLM 负责理解和生成文本，支持工具调用。

```typescript
// 消息类型（扩展支持 tool calls）
type ChatMessage = 
  | { role: 'user' | 'system'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string };

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
};

// Tool Definition（OpenAI 格式）
type ToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>; // JSON Schema
  };
};

// LLM 配置
type LLMConfig = {
  endpoint: {
    url: string;
    key: string;
    model: string;
  };
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
};

// 输出块（扩展支持 tool calls）
type CompletionChunk = {
  trackingId: string;
  content: string;
  finished: boolean;
  error?: string;
  toolCalls?: ToolCall[];  // 新增：工具调用信息
};

// LLM 接口
type LLM = {
  complete: (
    messages: ChatMessage[],
    config?: Partial<LLMConfig>
  ) => AsyncGenerator<CompletionChunk>;
};
```

### 2. Tool 接口

Tool 是 Agent 可以调用的外部能力（网络搜索、脚本执行等）。

```typescript
// Tool 执行器
type ToolExecutor = (args: Record<string, any>) => Promise<string>;

// Tool 定义
type Tool = {
  definition: ToolDefinition;  // LLM 看到的工具描述
  executor: ToolExecutor;      // 实际执行函数
};

// 工具执行结果
type ToolResult = {
  id: string;         // 对应 ToolCall.id
  content: string;    // 执行结果
  error?: string;     // 错误信息
};

// Tool 注册表接口
type ToolRegistry = {
  // 注册工具
  register: (tool: Tool) => void;
  
  // 获取所有工具定义（给 LLM）
  getDefinitions: () => ToolDefinition[];
  
  // 执行工具调用
  execute: (toolCall: ToolCall) => Promise<ToolResult>;
};
```

### 3. Memory 接口

Memory 负责存储和检索 Run Loop 的历史，支持分段索引和锚定。

```typescript
// Run Loop 定义
type RunLoop = {
  id: string;
  goal: string;              // 用户的原始问题/目标
  status: 'active' | 'completed' | 'failed';
  iterations: Iteration[];   // 思考和工具调用的迭代历史
  createdAt: number;
  completedAt?: number;
};

// 单次迭代
type Iteration = {
  userMessage?: string;      // 用户补充的消息（如果有）
  reasoning?: string;        // AI 的思考
  toolCalls?: ToolCall[];    // 工具调用
  toolResults?: ToolResult[];// 工具结果
  response?: string;         // AI 给用户的回复
  timestamp: number;
};

// 记忆片段（可锚定）
type MemoryChunk = {
  content: string;           // 片段内容
  anchor: MemoryAnchor;      // 锚点信息（可精确定位回源）
  relevance: number;         // 相关性分数
};

// 锚点（精确定位到 Run Loop 的某个位置）
type MemoryAnchor = {
  runLoopId: string;         // 所属的 run loop
  iterationIndex: number;    // 第几次迭代
  segmentIndex: number;      // 该迭代中的第几个段落
  segmentType: 'user_message' | 'reasoning' | 'tool_call' | 'tool_result' | 'response';
  timestamp: number;
};

// Memory 接口
type Memory = {
  // 短期记忆：活跃的 run loops
  shortTerm: {
    // 获取活跃的 run loops
    getActive: () => RunLoop[];
    
    // 获取指定 run loop
    get: (runLoopId: string) => RunLoop | undefined;
    
    // 添加新的 run loop
    add: (runLoop: RunLoop) => void;
    
    // 更新 run loop（添加新的 iteration）
    update: (runLoopId: string, iteration: Iteration) => void;
    
    // 标记 run loop 为完成
    complete: (runLoopId: string) => Promise<void>;
  };
  
  // 长期记忆：分段索引的历史
  longTerm: {
    // 检索相关的记忆片段
    retrieve: (query: string, limit?: number) => Promise<MemoryChunk[]>;
    
    // 根据锚点获取完整上下文
    expand: (anchor: MemoryAnchor, contextWindow?: number) => Promise<ExpandedContext>;
  };
};

// 扩展上下文
type ExpandedContext = {
  runLoop: RunLoop;          // 完整的 run loop
  focusChunk: MemoryChunk;   // 检索到的片段
  beforeChunks: MemoryChunk[]; // 之前的片段
  afterChunks: MemoryChunk[];  // 之后的片段
};
```

### 4. Agent 接口

Agent 负责协调 LLM、Tool 和 Memory，管理 Run Loop 的生命周期。

```typescript
// Agent 输出（流式）
type AgentOutput = 
  | { type: 'run_loop_start'; runLoopId: string; goal: string }
  | { type: 'thinking'; content: string }
  | { type: 'tool_calling'; tool: string; args: Record<string, any> }
  | { type: 'tool_result'; tool: string; result: string }
  | { type: 'response'; content: string }
  | { type: 'run_loop_end'; runLoopId: string };

// Agent 接口
type Agent = {
  // 发送消息（可选指定 run loop ID）
  send: (
    message: string, 
    runLoopId?: string
  ) => AsyncGenerator<AgentOutput>;
  
  // 获取活跃的 run loops
  getActiveRunLoops: () => RunLoop[];
  
  // 获取 memory 引用
  memory: Memory;
};

// Agent 工厂函数
type CreateAgent = (
  llm: LLM,
  tools: ToolRegistry,
  memory: Memory,
  options?: AgentOptions
) => Agent;

// Agent 配置选项
type AgentOptions = {
  maxIterations?: number;    // 单个 run loop 最大迭代次数（默认 10）
  systemPrompt?: string;     // 系统提示词
  autoClassify?: boolean;    // 自动判断消息归属（默认 true）
};
```

## 核心流程

### 消息路由逻辑

当 Agent 接收到消息时：

1. **如果用户指定了 runLoopId**：
   - 该 run loop 是活跃的 → 直接加入该 run loop 的下一个 iteration
   - 该 run loop 已完成 → 从长期记忆检索相关上下文，创建新 run loop

2. **如果用户未指定 runLoopId**：
   - 如果有活跃的 run loops → 用 LLM 判断消息是否关联到某个 run loop
   - 如果判断有关联 → 加入该 run loop
   - 否则 → 创建新的 run loop

### Run Loop 执行流程

每个 Run Loop 迭代：

1. **观察**：收集当前上下文（用户消息、工具结果等）
2. **思考**：调用 LLM 生成推理和决策
3. **行动**：如果 LLM 返回 tool calls，执行工具
4. **判断**：
   - 如果 LLM 给出了最终答案 → 结束 run loop，归档到长期记忆
   - 如果还需要更多信息 → 继续下一次迭代
   - 如果达到最大迭代次数 → 强制结束

### 长期记忆归档流程

当 run loop 完成时：

1. 将 run loop 的每个 iteration 分段（按 segmentType）
2. 为每个段落生成 embedding
3. 存储到向量数据库（带上 anchor 信息）
4. 保存完整的 run loop 到文件系统
5. 从短期记忆中移除

## 目录结构

```
src/service/
├── agent/                # Agent 模块
│   ├── index.ts          # 导出主要 API
│   ├── types.ts          # 类型定义
│   ├── agent.ts          # Agent 核心实现
│   ├── router.ts         # 消息路由逻辑
│   ├── llm/              # LLM 实现
│   │   └── index.ts      # LLM 核心功能和 Tool calling 支持
│   ├── memory/           # Memory 实现
│   │   ├── index.ts
│   │   ├── shortTerm.ts  # 短期记忆（内存）
│   │   └── longTerm.ts   # 长期记忆（向量索引）
│   └── tools/            # Tool 系统
│       ├── index.ts      # Tool 注册表
│       └── builtins/     # 内置工具
│           ├── web.ts    # Tavily 网络搜索
│           └── script.ts # 脚本管理
├── server/               # HTTP 服务
└── index.ts              # 服务入口
```

## 使用示例

```typescript
import { createLLM, createToolRegistry, createMemory, createAgent } from './service/agent';
import { createWebSearchTool, createScriptTool } from './service/agent/tools/builtins';

// 1. 创建组件
const llm = createLLM(config.llm);
const tools = createToolRegistry();
tools.register(createWebSearchTool(config.tavily));
tools.register(createScriptTool(config.scriptRepo));

const memory = createMemory({
  vectorStore: config.chroma,
  storageDir: '~/.bun-buddy/memory'
});

// 2. 创建 Agent
const agent = createAgent(llm, tools, memory, {
  maxIterations: 10,
  systemPrompt: 'You are a helpful learning agent...'
});

// 3. 发送消息
for await (const output of agent.send('帮我查一下今天的天气')) {
  switch (output.type) {
    case 'run_loop_start':
      console.log(`🔄 Starting run loop: ${output.runLoopId}`);
      break;
    case 'thinking':
      console.log(`💭 ${output.content}`);
      break;
    case 'tool_calling':
      console.log(`🔧 Calling ${output.tool}...`);
      break;
    case 'response':
      process.stdout.write(output.content);
      break;
    case 'run_loop_end':
      console.log(`\n✅ Run loop completed`);
      break;
  }
}

// 4. 后续补充消息（关联到同一个 run loop）
const runLoopId = agent.getActiveRunLoops()[0]?.id;
for await (const output of agent.send('北京的呢？', runLoopId)) {
  // ...
}
```

## 待讨论的问题

### 1. LLM 消息分类
- 用专门的 prompt 让 LLM 判断消息是否关联现有 run loop？
- 还是用向量相似度计算？
- 置信度阈值设多少？

### 2. Tool 并发执行
- LLM 可能一次返回多个 tool calls，是否并发执行？
- 还是串行执行保证顺序？

### 3. 长期记忆的分段策略
- 当前设计：按 segmentType 分段
- 是否需要更细的粒度？如长文本自动分段？

### 4. 与 Observable 的集成
- Memory 的短期记忆是否用 Observable 实现？
- Agent 的活跃 run loops 是否暴露为 Observable？

### 5. 向量数据库选择
- 使用 Chroma 线上服务？
- 是否需要本地缓存？
- Embedding 模型用什么？

## 下一步

确认上述问题后，开始实现：
1. 扩展 LLM 模块支持 tool calling
2. 实现 Tool Registry
3. 实现 Memory（短期 + 长期）
4. 实现 Agent 核心逻辑和消息路由
5. 添加内置工具（web search, script）
6. 集成到现有的 HTTP service
