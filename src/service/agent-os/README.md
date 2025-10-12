# Agent OS MVP

Agent OS 是一个基于总线架构的 Agent 系统实现。

## 架构概览

```
┌──────────────────────────────────────────────────────────┐
│              Agent Bus Controller                        │
│  - invoke(callerId, abilityId, input)                    │
│  - Ability Discovery (list/schema/inspect)               │
└──────────────────────────────────────────────────────────┘
         ▲          ▲          ▲          ▲          ▲
         │          │          │          │          │
┌────────┴────┐ ┌──┴─────┐ ┌──┴───────┐ ┌┴──────┐ ┌─┴────────┐
│   Shell     │ │  Task  │ │  Model   │ │Ledger │ │   Bus    │
│  (HTTP API) │ │ Manager│ │ Manager  │ │(Mock) │ │   Ctrl   │
├─────────────┤ ├────────┤ ├──────────┤ ├───────┤ ├──────────┤
│shell:send   │ │task:   │ │model:llm │ │ldg:   │ │bus:list  │
│             │ │spawn   │ │model:list│ │task:* │ │bus:      │
│             │ │send    │ │model:    │ │msg:*  │ │abilities │
│             │ │cancel  │ │register  │ │call:* │ │bus:schema│
│             │ │active  │ │          │ │       │ │          │
└─────────────┘ └────────┘ └──────────┘ └───────┘ └──────────┘
```

## 已实现的模块

### ✅ Phase 1 完成：基础设施层

- **Agent Bus** (`/bus`)
  - 能力注册和调用
  - 调用者追踪
  - 输入验证（JSON Schema）
  - Bus Controller 能力（bus:list, bus:abilities, bus:schema, bus:inspect）

- **Mock Ledger** (`/ledger`)
  - 完整的 Ledger 接口实现
  - 所有查询返回空结果
  - 接受保存操作但不持久化
  - 能力：ldg:task:*, ldg:call:*, ldg:msg:*

### ✅ Phase 2 完成：Model Manager

- **Model Manager** (`/model`)
  - OpenAI 适配器
  - 流式响应累积
  - 模型注册和管理
  - 能力：model:llm, model:list, model:register

### ✅ Phase 3 完成：Shell

- **Shell** (`/shell`)
  - HTTP API (POST /send, GET /stream/:taskId)
  - SSE 连接管理
  - 消息片段化和流式输出
  - 能力：shell:send

### ✅ Phase 4 完成：Task Manager

- **Task Manager** (`/task`)
  - 任务生命周期管理
  - 执行循环（LLM 调用 → 工具执行 → 循环）
  - 内存中的任务注册表
  - 能力：task:spawn, task:send, task:cancel, task:active

### ✅ Phase 5 完成：系统集成

- **系统集成** (`/index.ts`)
  - createAgentOS() 工厂函数
  - 模块初始化顺序
  - 依赖验证
  - 启动/停止控制

## 快速开始

### 1. 环境设置

```bash
# 安装依赖
bun install

# 设置 OpenAI API Key
export OPENAI_API_KEY=your-api-key-here
```

### 2. 启动 Agent OS

```typescript
// example.ts
import { createAgentOS } from './src/service/agent-os';

const agentOS = await createAgentOS({
  port: 3000,
  models: {
    models: [
      {
        id: 'gpt4',
        type: 'llm',
        provider: 'openai',
        endpoint: 'https://api.openai.com/v1',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
      },
    ],
    defaultLLM: 'gpt4',
  },
});

await agentOS.start();
```

```bash
bun run src/service/agent-os/example.ts
```

### 3. 使用 HTTP API

**创建新任务：**
```bash
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, help me analyze some data"}'

# 响应：{"taskId": "task-...", "status": "running"}
```

**流式接收任务输出：**
```bash
curl -N http://localhost:3000/stream/task-xxx
```

这将建立 SSE 连接并实时接收任务的流式输出。

## API 文档

### POST /send

发送用户消息，创建或追加到任务。

**请求：**
```json
{
  "message": "用户消息内容",
  "taskId": "task-123"  // 可选，省略则创建新任务
}
```

**响应：**
```json
{
  "taskId": "task-123",
  "status": "running"
}
```

### GET /stream/:taskId

建立 SSE 连接以接收任务的流式输出。

**事件类型：**
- `start` - 连接建立
- `content` - 内容片段
- `tool_call` - 工具调用
- `tool_result` - 工具结果
- `message_complete` - 消息完成
- `end` - 任务结束

## MVP 限制

当前 MVP 版本的限制：

1. **无持久化**：使用 Mock Ledger，重启后所有状态丢失
2. **无智能路由**：每个新消息总是创建新任务
3. **单一 LLM 提供商**：只支持 OpenAI
4. **无 Memory**：没有跨任务知识共享
5. **无恢复能力**：不支持从崩溃中恢复

## 下一步

### 阶段二：智能路由

- 实现路由任务
- 维护内存中的活动任务映射
- 使用 LLM 进行智能路由决策

### 阶段三：真实 Ledger

- 实现 SQLite Ledger
- 任务持久化
- 崩溃恢复能力

### 阶段四：Memory

- Chroma 向量数据库集成
- Neo4j 图数据库集成
- 知识提取和语义搜索

## 目录结构

```
src/service/agent-os/
├── types.ts                 # 共享类型定义
├── index.ts                 # 系统集成入口
├── example.ts               # 使用示例
│
├── bus/                     # Agent Bus
│   ├── types.ts
│   ├── registry.ts
│   ├── controller.ts
│   └── index.ts
│
├── ledger/                  # Ledger (Mock)
│   ├── types.ts
│   ├── mock.ts
│   ├── abilities.ts
│   └── index.ts
│
├── model/                   # Model Manager
│   ├── types.ts
│   ├── abilities.ts
│   ├── providers/
│   │   └── openai.ts
│   └── index.ts
│
├── shell/                   # Shell (HTTP + SSE)
│   ├── types.ts
│   ├── sse.ts
│   ├── abilities.ts
│   ├── routes.ts
│   └── index.ts
│
└── task/                    # Task Manager
    ├── types.ts
    ├── abilities.ts
    ├── runloop.ts
    └── index.ts
```

## 设计原则

1. **总线优先通信**：所有模块通过 Agent Bus 通信，无直接依赖
2. **统一能力接口**：`invoke(callerId, abilityId, input) => Promise<string>`
3. **函数式风格**：优先使用纯函数，函数长度 ≤ 50 行
4. **类型安全**：使用 TypeScript `type` 而非 `interface`
5. **可发现性**：通过 bus:* 能力实现运行时内省

## 贡献

当前处于 MVP 阶段，欢迎贡献：

- Bug 修复
- 性能优化
- 文档改进
- 测试覆盖

## License

MIT

