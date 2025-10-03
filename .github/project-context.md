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

### 函数长度
- 单个函数不超过 50 行
- 修改后检查函数长度，过长则进行逻辑提取和拆分

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
└── config/        # 配置管理
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
