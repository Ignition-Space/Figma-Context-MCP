# Figma Context MCP

这是一个 Model Context Protocol (MCP) 服务器，用于 Figma 集成。它允许 AI 助手访问和分析 Figma 设计文件的内容。

## 功能特点

- 从 Figma API 获取设计文件内容
- 解析设计数据为简化格式
- 支持下载 Figma 图像和图标
- 提供 HTTP 和标准输入/输出两种服务器模式

## 安装

```bash
# 使用npm安装
npm install figma-developer-mcp

# 或使用pnpm安装
pnpm add figma-developer-mcp
```

## 配置

在使用前，你需要设置 Figma API 密钥。有两种方式可以提供此密钥：

1. 通过环境变量（推荐）：创建一个 `.env` 文件，包含以下内容：

```
FIGMA_API_KEY=your_figma_api_key_here
PORT=3333 # 可选，默认为3333
```

2. 通过命令行参数：

```bash
figma-developer-mcp --figma-api-key=your_figma_api_key_here --port=3333
```

## 使用方法

### 作为命令行工具

```bash
# 使用 HTTP 模式启动服务器
npx figma-developer-mcp

# 使用标准输入/输出模式启动
npx figma-developer-mcp --stdio
```

### 在代码中使用

```typescript
import { FigmaMcpServer } from "figma-developer-mcp";

// 创建并启动服务器
const server = new FigmaMcpServer("your_figma_api_key_here");
await server.startHttpServer(3333);

// 或者在标准输入/输出模式下使用
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);
```

## API

服务器提供以下 MCP 工具：

1. `get_figma_data` - 获取 Figma 文件或特定节点的信息
2. `download_figma_images` - 下载 Figma 文件中的图像

## 开发规范

### 注释规范

- 所有注释必须使用中文
- 使用 JSDoc 格式为类、方法和重要变量添加注释
- 类注释必须描述类的功能
- 方法注释须包含功能描述、参数说明和返回值说明

### 命名规范

- 变量：camelCase
- 常量：UPPER_CASE
- 类/接口/类型：PascalCase
- 方法：camelCase

### 代码格式

- 缩进：2 个空格
- 最大行长：100 个字符
- 使用尾随逗号
- 使用分号
- 使用双引号

## 许可证

MIT 