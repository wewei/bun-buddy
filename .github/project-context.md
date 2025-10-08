# Bun Buddy 项目上下文

<!-- 此文件为共享的项目上下文配置，供 Cursor Agent 和 GitHub Copilot 使用 -->

## 项目概述

Bun Buddy 是一个通用的学习型 Agent，能够通过与用户的交流，不断编写可复用的技能脚本（TypeScript），持续提升自己的各方面技能。它采用后台服务 + 命令行工具的架构，为 AI Agent 提供完整的工具集。

## 技术栈

- **Runtime**: Bun - 快速的 JavaScript 运行时
- **Language**: TypeScript
- **Architecture**: HTTP Service + CLI Tool
- **存储**: 本地文件系统（技能脚本、对话记录）
- **索引**: Chroma 线上服务
- **LLM**: 可配置的兼容 OpenAI 的 LLM endpoints
- **互联网访问**: Tavily 线上服务
- **Dependencies**: commander, chalk, blessed, openai, better-sse

## 代码规范

### 编程风格
- 采用函数式编程风格
- 不使用 `class` 和 `interface`
- 使用 `type` 定义数据类型
- 使用函数实现代码逻辑

### 命名规范
- 函数、变量名：`camelCase`
- 类型名：`PascalCase`
- 常量：`SNAKE_CASE`
- 组合子：`$` 前缀（如 `$K`, `$S`, `$I`）
- Observable 函数：`Ob` 后缀（如 `pureOb`, `bindOb`, `mapOb`）

### 函数长度
- 单个函数不超过 50 行
- 修改后检查函数长度，过长则进行逻辑提取和拆分

### 导入规范
- 所有的 `import` 和 `import type` 语句必须写在文件头部
- 禁止使用 inline import（如在函数内部动态 import）
- 按以下顺序组织导入：
  1. 外部依赖（第三方库）
  2. 内部模块（项目内部）
  3. 类型导入（使用 `import type`）

### Observable Monadic 设计
- **Observable 类型**: `Observable<T> = (invalidate: Invalidate) => T`
- **核心操作**: `pureOb`, `bindOb`, `mapOb`, `joinOb`, `apOb`
- **实用函数**: `lift2Ob`, `sequenceOb`, `filterOb`, `whenOb`, `zipOb`
- **构造函数**: `makeObservable`, `makeUpdatable`
- **组合子**: 使用 `$K`, `$S`, `$I`, `$B`, `$C`, `$W`, `$D`, `$E`, `$Y`

### 代码示例

```typescript
// ✅ 好的类型定义
type UserConfig = {
  serverPort: number;
  apiKey: string;
  enableLogging: boolean;
};

// ✅ 好的函数实现
const validateConfig = (config: UserConfig): boolean => {
  if (config.serverPort < 1000 || config.serverPort > 65535) {
    return false;
  }
  
  if (!config.apiKey || config.apiKey.length < 10) {
    return false;
  }
  
  return true;
};

// ✅ Observable 使用示例
const counter = makeUpdatable(0);
const doubled = mapOb(counter.observable, (x) => x * 2);
const isValid = filterOb(doubled, (x) => x > 5);

// ✅ 组合子使用示例
const add = (a: number) => (b: number) => a + b;
const add3 = $S($S($K(add))(3)); // 使用 S 组合子柯里化
const result = add3(5); // 8

// ✅ 常量定义
const DEFAULT_SERVER_PORT = 3000;
const MAX_RETRY_ATTEMPTS = 3;

// ❌ 避免使用 class
// class ConfigManager { ... }

// ❌ 避免使用 interface
// interface IUserConfig { ... }
```

## 项目结构

参考项目根目录的 `README.md` 文件中的详细结构说明。

### 核心目录
```
src/
├── cli/           # buddy 命令行工具
│   ├── commands/  # 各种 buddy 子命令实现
│   └── utils/     # CLI 工具函数
├── service/       # HTTP 服务
│   ├── server.ts  # 服务器实现
│   └── llm.ts     # LLM 集成
├── config/        # 配置管理
└── utils/         # 通用工具库
    ├── combinators.ts  # 函数式组合子
    └── observable.ts   # Observable Monadic 实现
```

### 用户数据目录
```
~/.bun-buddy/              # 用户数据根目录
├── repo/                  # 脚本 Git 仓库 (同时是 Bun 项目)
│   ├── scripts/           # 正式脚本存储
│   ├── drafts/            # 脚本草稿 (不提交到 Git)
│   └── ...
├── config.json            # Bun Buddy 配置文件
└── logs/                  # Agent 交互日志
```
