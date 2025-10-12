# Agent OS 架构概览

## 简介

Agent OS 是使用**操作系统总线架构**对 Agent 系统的完全重写。该设计从操作系统概念中汲取灵感：Shell（用户界面）、Task Manager（进程管理）、Ledger（事务日志）、Memory（语义索引）、Model Manager（ABI），以及用于模块间通信的中央 Agent Bus。

## 核心概念

### 总线架构

与传统的分层架构不同，Agent OS 使用**基于总线的架构**，所有模块通过中央 Agent Bus 进行通信。这解耦了依赖关系，并支持灵活的模块组合。

```
                 ┌────────────────────┐
                 │  Shell (HTTP API)  │  ← 总线之上
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
      ▲ 总线之下：既调用也注册能力
```

### 术语

- **总线之上（Above Bus）**：仅调用能力但不注册任何能力的模块（例如 Shell）
- **总线之下（Below Bus）**：既调用又注册能力的模块（例如 Task Manager、Ledger、Memory、Model Manager、Bus Controller）
- **能力（Ability）**：具有签名 `(input: string) => Promise<string>` 或 `(input: string) => AsyncGenerator<string>` 的可调用功能
- **能力 ID（Ability ID）**：遵循 `${moduleName}:${abilityName}` 模式的唯一标识符（例如 `task:route`、`ldg:task:save`、`mem:retrieve`）

## 模块职责

### 1. Shell（总线之上）

**目的**：面向用户的 HTTP API 层

**职责**：
- 通过 `POST /send` 接收传入消息
- 通过 `GET /stream/:taskId` 使用 SSE 流式传输任务输出
- 提供检查端点（保留供将来使用）
- 将 HTTP 请求转换为 Agent Bus 调用

**关键特性**：
- 不注册任何能力
- Agent Bus 的纯消费者
- 无状态请求处理器

### 2. Agent Bus Controller（总线之下）

**目的**：中央通信枢纽和能力注册表

**职责**：
- 将能力调用路由到已注册的模块
- 维护带有元数据的能力注册表
- 提供能力发现机制
- 处理同步和流式调用

**注册的能力**：
- `bus:list` - 列出所有已注册的模块
- `bus:abilities` - 列出模块的能力
- `bus:schema` - 获取能力输入/输出模式
- `bus:inspect` - 获取能力元数据

### 3. Task Manager（总线之下）

**目的**：进程/任务生命周期管理

**职责**：
- 将用户消息路由到适当的任务
- 创建和取消任务
- 使用 LLM 执行任务运行循环
- 将所有执行状态持久化到 Ledger

**注册的能力**：
- `task:route` - 将消息路由到任务
- `task:create` - 创建新任务
- `task:cancel` - 取消任务
- `task:active` - 列出活动任务

**关键功能**： 
- 持久化优先的架构，持续保存状态到 Ledger
- 基于完成时间戳的流式消息处理
- 完整的崩溃恢复能力

### 4. Model Manager（总线之下）

**目的**：LLM 提供商的 ABI（应用程序二进制接口）

**职责**：
- 抽象 LLM 和 Embedding API 调用
- 管理模型实例和配置
- 提供跨不同提供商的统一接口
- 处理流式响应

**注册的能力**：
- `model:llm` - 调用 LLM 完成
- `model:embed` - 生成嵌入
- `model:list` - 列出可用模型
- `model:register` - 注册模型实例

### 5. Ledger（总线之下）

**目的**：完整任务历史的持久化存储账本

**职责**：
- 在 SQLite 中存储 Task、Call、Message 实体
- 提供结构化查询（按时间、按任务、按状态）
- 通过 ACID 事务确保数据一致性
- 支持崩溃恢复和审计跟踪
- 管理可变状态（Task/Call）和不可变记录（Message）

**注册的能力**：
- `ldg:task:save`、`ldg:task:get`、`ldg:task:query` - 任务操作
- `ldg:call:save`、`ldg:call:list` - 调用操作
- `ldg:msg:save`、`ldg:msg:list` - 消息操作

**存储位置**：`$HOME/.bun-buddy/ledger.sqlite`

**关键功能**：
- Task 和 Call 状态是可变的（可以更新）
- Message 是不可变的（仅追加）
- 流式消息仅在完全接收后保存

### 6. Memory（总线之下）

**目的**：语义知识层

**职责**：
- 从 Ledger 任务记录中提取知识
- 构建向量索引（Chroma）用于语义搜索
- 维护知识图谱（Neo4j）用于关系管理
- 提供智能检索和发现

**注册的能力**：
- `mem:retrieve` - 语义相似度搜索
- `mem:graph` - 知识图谱遍历
- `mem:archive` - 提取和索引任务知识
- `mem:related` - 查找相关任务

**存储架构**：
- **Chroma**：用于语义相似度的向量数据库
- **Neo4j**：用于知识关系的图数据库

**关键功能**：可选的增强层，从 Ledger 读取以提取知识

## 代码结构

```
src/service/agent-os/
├── index.ts                    # 公共 API 导出
├── types.ts                    # 共享类型定义
│
├── bus/                        # Agent Bus Controller
│   ├── index.ts                # Bus 实现
│   ├── types.ts                # Bus 特定类型
│   ├── registry.ts             # 能力注册表
│   └── controller.ts           # Bus 控制器能力
│
├── shell/                      # Shell (HTTP API)
│   ├── index.ts                # Shell 入口点
│   ├── routes.ts               # HTTP 路由处理器
│   └── types.ts                # Shell 特定类型
│
├── task/                       # Task Manager
│   ├── index.ts                # Task manager 实现
│   ├── types.ts                # Task 特定类型
│   ├── abilities.ts            # Task 能力（route、create 等）
│   ├── runloop.ts              # 任务执行循环
│   └── router.ts               # 消息路由逻辑
│
├── model/                      # Model Manager
│   ├── index.ts                # Model manager 实现
│   ├── types.ts                # Model 特定类型
│   ├── abilities.ts            # Model 能力（llm、embed 等）
│   └── providers/              # 提供商适配器
│       ├── openai.ts
│       └── anthropic.ts
│
├── ledger/                     # Ledger (SQLite 持久化)
│   ├── index.ts                # Ledger 实现
│   ├── types.ts                # Ledger 特定类型
│   ├── abilities.ts            # Ledger 能力（save、get、query、list）
│   ├── db.ts                   # SQLite 连接和初始化
│   ├── schema.ts               # 表结构定义
│   └── queries.ts              # SQL 查询封装
│
└── memory/                     # Memory (语义索引)
    ├── index.ts                # Memory 实现
    ├── types.ts                # Memory 特定类型
    ├── abilities.ts            # Memory 能力（retrieve、graph、archive）
    ├── extract.ts              # 知识提取逻辑
    ├── vector.ts               # Chroma 集成
    └── graph.ts                # Neo4j 集成
```

## 设计原则

### 1. 总线优先通信

所有模块间通信都通过 Agent Bus 进行。没有直接的模块到模块依赖。

**正确**：
```typescript
// 模块 A 通过总线调用模块 B
const result = await bus.invoke('moduleB:action')('input data');
```

**错误**：
```typescript
// 模块 A 直接导入模块 B
import { moduleB } from '../moduleB';
const result = await moduleB.action('input data');
```

### 2. 统一的能力接口

每个能力遵循以下两种签名之一：

```typescript
// 同步（单个响应）
type AbilitySync = (input: string) => Promise<string>;

// 流式（多个块）
type AbilityStream = (input: string) => AsyncGenerator<string>;
```

输入和输出始终是字符串。复杂数据结构使用 JSON 编码。

### 3. 能力 ID 命名约定

格式：`${moduleName}:${abilityName}`

- 使用小写
- 模块名是单数（例如 `task`，而不是 `tasks`）
- 能力名是基于动词的（例如 `spawn`、`list`、`get`）

**示例**：
- `task:spawn` - 创建任务
- `model:llm` - 调用 LLM
- `mem:retrieve` - 检索记忆

### 4. 模式优先设计

每个能力必须使用 JSON Schema 声明输入/输出模式：

```typescript
type AbilityMeta = {
  id: string;
  description: string;
  inputSchema: JSONSchema;
  outputSchema: JSONSchema;
  isStream: boolean;
};
```

这实现了：
- 运行时验证
- 自动生成文档
- LLM 的工具定义

### 5. 函数式风格

- 优先使用纯函数
- 尽可能避免使用类
- 使用 `type` 而不是 `interface`
- 保持函数在 50 行以内
- 提取子函数以提高清晰度

## 能力发现流程

Bus Controller 提供内省能力：

```
┌─────────────────────────────────────────────────────┐
│ 客户端想要调用一个能力                               │
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
         │ bus:invoke         │  → 执行能力
         │   (id='task:spawn')│
         └────────────────────┘
```

## 任务执行流程

用户消息通过系统的高层流程：

```
┌──────────────────────────────────────────────────┐
│ 用户通过 POST /send 发送消息                      │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Shell 调用 bus:invoke('task:spawn')(message)     │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Manager 创建 goal=message 的任务             │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Run Loop 使用上下文调用 model:llm           │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ LLM 返回工具调用（例如 mem:retrieve）             │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Task Run Loop 通过总线调用能力                    │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ LLM 生成最终响应                                  │
└─────────────────┬────────────────────────────────┘
                  │
                  ▼
┌──────────────────────────────────────────────────┐
│ Shell 通过 SSE 流式传输输出给用户                 │
└──────────────────────────────────────────────────┘
```

## 与现有系统的集成

Agent OS 与现有的 `agent/` 实现并行开发：

```
src/service/
├── agent/              # 现有实现（未更改）
├── agent-os/           # 新的 OS 架构
└── server/             # 现有 HTTP 服务器（未更改）
```

这允许：
- 并行开发而不破坏现有代码
- 渐进式迁移路径
- 架构之间的轻松比较
- 如果需要可以回滚

## 下一步

每个模块都有详细文档：

1. **Shell 模块** → `agent-os-02-shell.md`
2. **Agent Bus** → `agent-os-03-bus.md`
3. **Task Manager** → `agent-os-04-task.md`
4. **Model Manager** → `agent-os-05-model.md`
5. **Memory（语义层）** → `agent-os-06-memory.md`
6. **Ledger（持久化层）** → `agent-os-07-ledger.md`

## 总结

Agent OS 架构提供：

✅ **解耦模块**通过基于总线的通信
✅ **统一接口**用于所有能力
✅ **可发现的功能**通过内省
✅ **持久化优先设计**使用 SQLite Ledger
✅ **可选语义层**使用 Memory（向量 + 图）
✅ **清晰的关注点分离**（Shell、Task、Model、Ledger、Memory）
✅ **并行开发**与现有系统并存

OS 类比使系统直观：Shell 用于用户交互，Task Manager 用于进程，Ledger 用于事务日志，Memory 用于语义索引，Model Manager 用于硬件抽象，Agent Bus 作为连接一切的系统总线。

