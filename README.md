# 🤖 Bun Buddy

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
服务在根路径（`/`）提供两个核心接口：

#### POST / - 发送消息
```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Buddy"}'
```

#### GET / - SSE 实时消息流
```bash
curl -H "Accept: text/event-stream" http://localhost:3000/
```

#### POST /shutdown - 关闭服务
```bash
curl -X POST http://localhost:3000/shutdown
```

## 🚀 快速开始

### 安装依赖
```bash
bun install
```

### 开发模式运行
```bash
bun run index.ts
```

### 代码质量检查
```bash
# 运行 ESLint 检查
bun run lint

# 自动修复可修复的问题
bun run lint:fix

# 运行测试
bun test
```

### 使用 buddy 命令
```bash
# 服务管理
buddy server start          # 启动服务（后台运行）
buddy server state          # 检查服务状态
buddy server stop           # 停止服务
buddy server restart        # 重启服务

# 配置管理
buddy config get            # 查看所有配置
buddy config get server.port  # 查看特定配置
buddy config set server.port 8080  # 设置配置

# 服务连接
buddy connect               # 连接到本地服务进行交互
buddy connect http://remote-server:3000  # 连接到远程服务
```

## 📋 开发计划

- [x] ~~实现核心 HTTP 服务~~
- [x] ~~开发 `buddy` 命令行工具~~
- [x] ~~实现服务管理（启动/停止/状态/重启）~~
- [x] ~~实现配置管理~~
- [x] ~~实现服务连接功能~~
- [ ] 实现脚本管理系统
- [ ] 添加依赖管理功能
- [ ] 集成互联网访问能力
- [ ] 完善 SSE 实时通信
- [ ] 添加测试覆盖

## 🛠️ 技术栈

- **Runtime**: [Bun](https://bun.sh) - 快速的 JavaScript 运行时
- **Language**: TypeScript
- **Architecture**: HTTP Service + CLI Tool
- **Code Quality**: ESLint + TypeScript ESLint
- **Dependencies**: commander, chalk, blessed, openai, better-sse, pm2

## 📖 开发规范

项目遵循严格的编码规范，详见 `.github/project-context.md`：

- ✅ 函数式编程风格（不使用 class 和 interface）
- ✅ 使用 `type` 定义数据类型
- ✅ 函数长度不超过 50 行
- ✅ 所有 import 语句必须在文件头部
- ✅ 按照规定顺序组织导入：外部依赖 → 内部模块 → 类型导入

## 📄 许可证

MIT License

---

*Created with ❤️ using Bun v1.2.8*
