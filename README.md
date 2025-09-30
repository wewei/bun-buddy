# 🤖 Bun Buddy

# 🦄 Bun Buddy

A dummy service and CLI application built with Bun, featuring a REST API server and a beautiful command-line interface.

## 🚀 Features

### Service
- **RESTful API** built with Bun's native HTTP server
- **Health check endpoint** for monitoring
- **User management endpoints** (dummy data)
- **Echo endpoint** for testing
- **JSON responses** with consistent structure
- **Error handling** and logging

### CLI Tool
- **Beautiful CLI** built with Commander.js and Chalk
- **Service status checking** 
- **API endpoint testing**
- **Development information display**
- **Interactive spinners** with Ora

## 📦 Installation

```bash
# Install dependencies
bun install
```

## 🎯 Usage

### Starting the Service

```bash
# Start the service
bun run service

# Or start with the main entry point
bun run start
```

The service will start at `http://localhost:3000`

### Using the CLI

```bash
# Check service status
bun run cli status

# Show development information
bun run cli dev-info

# Test API endpoints
bun run cli test-api

# Show help
bun run cli --help
```

### Available Scripts

```json
{
  "start": "bun run index.ts",         
  "dev": "bun --watch index.ts",       
  "service": "bun run src/service/index.ts",  
  "cli": "bun run src/cli/simple.ts"          
}
```

## 🌐 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Welcome message |
| `GET` | `/health` | Health check |
| `GET` | `/api/info` | API information |
| `GET` | `/api/users` | List all users |
| `GET` | `/api/users/:id` | Get user by ID |
| `POST` | `/api/echo` | Echo request body |

### Example API Calls

```bash
# Health check
curl http://localhost:3000/health

# Get all users
curl http://localhost:3000/api/users

# Get specific user
curl http://localhost:3000/api/users/1

# Echo test
curl -X POST http://localhost:3000/api/echo \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Bun!"}'
```

## 📁 Project Structure

```
bun-buddy/
├── src/
│   ├── config/
│   │   └── index.ts          # Configuration management
│   ├── service/
│   │   ├── server.ts         # Bun HTTP server implementation
│   │   └── index.ts          # Service entry point
│   └── cli/
│       ├── commands.ts       # CLI command definitions (full)
│       ├── simple.ts         # Simplified CLI (active)
│       ├── utils.ts          # CLI utilities
│       └── index.ts          # CLI entry point (full)
├── index.ts                  # Main application entry
├── cli.ts                    # CLI executable entry
├── package.json              # Dependencies and scripts
└── README.md                 # This file
```

## 🛠️ Development

### Configuration

The application configuration is centralized in `src/config/index.ts`:

```typescript
{
  service: {
    port: 3000,     // Can be overridden with PORT env var
    host: 'localhost'  // Can be overridden with HOST env var
  },
  cli: {
    name: 'bun-buddy',
    version: '1.0.0'
  }
}
```

### Environment Variables

- `PORT` - Service port (default: 3000)
- `HOST` - Service host (default: localhost)

## 🎨 CLI Features

The CLI tool provides a beautiful interface with:

- 🎨 **Colorized output** using Chalk
- ⏳ **Interactive spinners** using Ora  
- 📊 **Formatted tables** and information display
- 🔍 **Service health monitoring**
- 🧪 **API endpoint testing**

### CLI Commands

```bash
# Service status with uptime
bun run cli status

# Development information  
bun run cli dev-info

# Test all API endpoints
bun run cli test-api

# Help and examples
bun run cli --help
```

## 🚦 Service Response Format

All API endpoints return responses in this consistent format:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}
```

## 🔧 Built With

- **[Bun](https://bun.sh)** - Fast JavaScript runtime and HTTP server
- **[Commander.js](https://github.com/tj/commander.js)** - Command-line interface framework
- **[Chalk](https://github.com/chalk/chalk)** - Terminal string styling
- **[Ora](https://github.com/sindresorhus/ora)** - Elegant terminal spinners
- **TypeScript** - Type-safe JavaScript

## 🎯 Getting Started

1. **Clone or download** this project
2. **Install dependencies**: `bun install`
3. **Start the service**: `bun run service`
4. **Open another terminal** and test the CLI: `bun run cli status`
5. **Visit** `http://localhost:3000` in your browser
6. **Explore the API** endpoints listed above

## � Notes

- Built with Bun v1.2.8
- Uses native Bun HTTP server (no Express needed)
- TypeScript with strict mode enabled
- ESNext modules with bundler resolution
- Development-friendly with hot reloading support

---

*This project demonstrates Bun's capabilities for building both HTTP services and CLI applications with a modern TypeScript setup.*

### 代码结构
```
bun-buddy/
├── src/
│   ├── cli/           # buddy 命令行工具
│   │   ├── commands/  # 各种 buddy 子命令实现
│   │   ├── utils/     # CLI 工具函数
│   │   └── index.ts   # CLI 入口文件
│   └── server/        # HTTP 服务
│       ├── routes/    # API 路由处理
│       ├── services/  # 核心业务逻辑
│       ├── types/     # 类型定义
│       └── index.ts   # 服务器入口文件
├── package.json
├── tsconfig.json
└── README.md
```

### 用户数据目录
```
~/.bun-buddy/              # 用户数据根目录
├── repo/                  # 脚本 Git 仓库 (同时是 Bun 项目)
│   ├── scripts/           # 正式脚本存储
│   ├── drafts/            # 脚本草稿 (不提交到 Git)
│   ├── package.json       # Bun 项目配置
│   ├── bun.lock          # 依赖锁定文件
│   ├── node_modules/      # 依赖包 (不提交到 Git)
│   ├── .gitignore         # 忽略 node_modules 和 drafts
│   └── .git/              # Git 版本控制
├── config.json            # Bun Buddy 配置文件
└── logs/                  # Agent 交互日志
    ├── 20250930-143015.log
    ├── 20250930-154522.log
    └── ...                # 时间戳格式: YYYYmmdd-HHMMSS.log
```

**设计要点**:
- 📁 **repo/** 目录既是 Git 仓库又是 Bun 项目
- 🚫 **.gitignore** 忽略 `node_modules/` 和 `drafts/` 
- ⚡ **脚本执行**: 使用 `bun x` 在 repo 目录中运行脚本
- 📝 **日志记录**: 按时间戳命名，记录所有 Agent 交互

Bun Buddy 为 AI Agent 提供了一套完整的工具集，让 AI 能够自主地管理和执行各种任务：

### 🔍 脚本检索与执行
- **搜索脚本**: AI 可以查找现有的脚本资源
- **执行脚本命令**: AI 可以运行脚本来完成特定任务

### 📝 脚本创建与管理
- **创建脚本草稿**: AI 可以创建新脚本（草稿状态，不会被搜索到）
- **罗列脚本草稿**: AI 可以查看所有待完善的脚本草稿
- **修改脚本草稿**: AI 可以编辑和完善脚本内容
- **删除脚本草稿**: AI 可以清理不需要的草稿
- **脚本草稿转正**: AI 可以将完成的草稿发布为正式脚本
- **删除脚本**: AI 可以移除不再需要的正式脚本

### 📦 依赖管理
- **新增依赖**: AI 可以安装新的 npm 包
- **更新依赖**: AI 可以升级现有包版本
- **删除依赖**: AI 可以清理不需要的包

### 🌐 互联网访问
- **互联网搜索**: AI 可以获取实时信息
- **提取网页内容**: AI 可以解析和提取网页数据

## 🏗️ 架构设计

Bun Buddy 采用后台服务 + 命令行工具的架构：

### 后台服务
- 运行一个 HTTP 服务器
- 提供统一的 API 接口
- 处理所有 Agent 请求

### 命令行工具 `buddy`
用于管理服务的完整生命周期：
- **配置管理**: 设置服务参数
- **启动服务**: 开始后台服务
- **重启服务**: 重新加载配置
- **关闭服务**: 安全停止服务
- **服务访问**: 与运行中的服务交互

### API 接口
服务提供一个统一的 endpoint，包含两个核心接口：
- **POST 接口**: 向 Agent 发送消息和指令
- **GET SSE 接口**: 实时接收来自 Agent 的消息流

## 🚀 快速开始

### 安装依赖
```bash
bun install
```

### 开发模式运行
```bash
bun run index.ts
```

### 使用 buddy 命令（开发中）
```bash
# 启动服务
buddy start

# 检查服务状态
buddy status

# 停止服务
buddy stop

# 重启服务
buddy restart
```

## 📋 开发计划

- [ ] 实现核心 HTTP 服务
- [ ] 开发 `buddy` 命令行工具
- [ ] 实现脚本管理系统
- [ ] 添加依赖管理功能
- [ ] 集成互联网访问能力
- [ ] 完善 API 文档
- [ ] 添加测试覆盖

## � 项目结构

```
bun-buddy/
├── src/
│   ├── cli/           # buddy 命令行工具
│   │   ├── commands/  # 各种 buddy 子命令实现
│   │   ├── utils/     # CLI 工具函数
│   │   └── index.ts   # CLI 入口文件
│   └── server/        # HTTP 服务
│       ├── routes/    # API 路由处理
│       ├── services/  # 核心业务逻辑
│       ├── types/     # 类型定义
│       └── index.ts   # 服务器入口文件
├── scripts/           # 用户脚本存储目录
├── drafts/           # 脚本草稿存储目录
├── package.json
├── tsconfig.json
└── README.md
```

## �🛠️ 技术栈

- **Runtime**: [Bun](https://bun.sh) - 快速的 JavaScript 运行时
- **Language**: TypeScript
- **Architecture**: HTTP Service + CLI Tool

## 📄 许可证

MIT License

---

*Created with ❤️ using Bun v1.2.8*
