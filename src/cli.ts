#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config } from "dotenv";
import { resolve } from "path";
import { getServerConfig } from "./config.js";
import { FigmaMcpServer } from "./server.js";

// 从当前工作目录加载.env
config({ path: resolve(process.cwd(), ".env") });

/**
 * 启动Figma MCP服务器
 * 根据运行模式（stdio或HTTP）配置并启动服务器
 */
export async function startServer(): Promise<void> {
  // 检查我们是否在stdio模式运行（例如，通过CLI）
  const isStdioMode = process.env.NODE_ENV === "cli" || process.argv.includes("--stdio");

  const config = getServerConfig(isStdioMode);

  const server = new FigmaMcpServer(config.figmaApiKey);

  if (isStdioMode) {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } else {
    console.log(`以HTTP模式初始化Figma MCP服务器，端口${config.port}...`);
    await server.startHttpServer(config.port);
  }
}

// 如果我们是直接执行（而不是被导入），则启动服务器
if (process.argv[1]) {
  startServer().catch((error) => {
    console.error("启动服务器失败:", error);
    process.exit(1);
  });
}
