import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { FigmaService } from "./services/figma.js";
import express, { Request, Response } from "express";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { IncomingMessage, ServerResponse, Server } from "http";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { SimplifiedDesign } from "./services/simplify-node-response.js";
import yaml from "js-yaml";

export const Logger = {
  log: (...args: any[]) => { },
  error: (...args: any[]) => { },
};

export class FigmaMcpServer {
  private readonly server: McpServer;
  private readonly figmaService: FigmaService;
  private transports: { [sessionId: string]: SSEServerTransport } = {};
  private httpServer: Server | null = null;

  /**
   * 创建Figma MCP服务器实例
   * @param figmaApiKey - Figma API密钥，用于访问Figma API
   */
  constructor(figmaApiKey: string) {
    this.figmaService = new FigmaService(figmaApiKey);
    this.server = new McpServer(
      {
        name: "Figma MCP Server",
        version: "0.1.15",
      },
      {
        capabilities: {
          logging: {},
          tools: {},
        },
      },
    );

    this.registerTools();
  }

  /**
   * 注册服务器提供的工具
   * 这些工具将作为MCP功能暴露给客户端
   */
  private registerTools(): void {
    // 获取文件信息的工具
    this.server.tool(
      "get_figma_data",
      "当无法获取nodeId时，获取整个Figma文件的布局信息",
      {
        fileKey: z
          .string()
          .describe(
            "要获取的Figma文件的key，通常在提供的URL中找到，如figma.com/(file|design)/<fileKey>/...",
          ),
        nodeId: z
          .string()
          .optional()
          .describe(
            "要获取的节点的ID，通常作为URL参数node-id=<nodeId>找到，如果提供了就始终使用",
          ),
        depth: z
          .number()
          .optional()
          .describe(
            "遍历节点树的深度，仅在用户明确要求时使用",
          ),
      },
      async ({ fileKey, nodeId, depth }) => {
        try {
          Logger.log(
            `获取${depth ? `${depth}层深度的` : "所有层级的"
            }${nodeId ? `文件中节点${nodeId}` : `整个文件`}${fileKey}`,
          );

          let file: SimplifiedDesign;
          if (nodeId) {
            file = await this.figmaService.getNode(fileKey, nodeId, depth);
          } else {
            file = await this.figmaService.getFile(fileKey, depth);
          }

          Logger.log(`成功获取文件: ${file.name}`);
          const { nodes, globalVars, ...metadata } = file;

          const result = {
            metadata,
            nodes,
            globalVars,
          };

          const yamlResult = yaml.dump(result);

          return {
            content: [{ type: "text", text: yamlResult }],
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : JSON.stringify(error);
          Logger.error(`获取文件${fileKey}时出错:`, message);
          return {
            isError: true,
            content: [{ type: "text", text: `获取文件时出错: ${message}` }],
          };
        }
      },
    );

    // 待优化：清理所有与图像下载相关的代码，特别是Figma服务中的getImages
    // 下载图像的工具
    this.server.tool(
      "download_figma_images",
      `
      1. 根据图像或图标节点的ID下载Figma文件中使用的SVG和PNG图像
      2. 扫描当前运行MCP工程目录，返回当前运行MCP工程目录的路径或者用户指定的文件路径
      3. 如果目录不存在，将创建它；
      4. 此路径的格式应尊重你正在运行的操作系统的目录格式；
      5. 此路径的格式应与当前的前端工程的目录格式一致，例如：/Users/**/**/public/images；
      6. 不要在路径名中使用任何特殊字符转义；
      7. 返回路径为当前系统的绝对路径，示例：/Users/**/**/public/images，禁止返回相对路径，错误示例：public/images
      `,
      {
        fileKey: z.string().describe("包含节点的Figma文件的key"),
        nodes: z
          .object({
            nodeId: z
              .string()
              .describe("要获取的Figma图像节点的ID，格式为1234:5678"),
            imageRef: z
              .string()
              .optional()
              .describe(
                "如果节点有imageRef填充，必须包含此变量。下载矢量SVG图像时留空。",
              ),
            fileName: z.string().describe("保存获取文件的本地名称"),
          })
          .array()
          .describe("要作为图像获取的节点"),
        localPath: z
          .string()
          .describe(
            `返回当前运行MCP工程目录的路径或者用户指定的文件路径 `,
          ),
      },
      async ({ fileKey, nodes, localPath }) => {
        try {
          const imageFills = nodes.filter(({ imageRef }) => !!imageRef) as {
            nodeId: string;
            imageRef: string;
            fileName: string;
          }[];

          const fillDownloads = this.figmaService.getImageFills(fileKey, imageFills, localPath);

          const renderRequests = nodes
            .filter(({ imageRef }) => !imageRef)
            .map(({ nodeId, fileName }) => ({
              nodeId,
              fileName,
              fileType: fileName.endsWith(".svg") ? ("svg" as const) : ("png" as const),
            }));

          const renderDownloads = this.figmaService.getImages(fileKey, renderRequests, localPath);

          const downloads = await Promise.all([fillDownloads, renderDownloads]).then(([f, r]) => [
            ...f,
            ...r,
          ]);

          console.log('downloads====>', downloads);

          // 如果任何下载失败，则返回false
          const saveSuccess = !downloads.find((success) => !success);

          console.log('saveSuccess====>', saveSuccess);

          return {
            content: [
              {
                type: "text",
                text: saveSuccess
                  ? `成功，已下载${downloads.length}个图像: ${downloads.join(", ")}`
                  : "失败",
              },
            ],
          };
        } catch (error) {
          Logger.error(`从文件${fileKey}下载图像时出错:`, error);
          return {
            isError: true,
            content: [{ type: "text", text: `下载图像时出错: ${error}` }],
          };
        }
      },
    );
  }

  /**
   * 连接到传输层
   * @param transport - 要连接到的传输层接口
   */
  async connect(transport: Transport): Promise<void> {
    // Logger.log("连接到传输层...");
    await this.server.connect(transport);

    Logger.log = (...args: any[]) => {
      this.server.server.sendLoggingMessage({
        level: "info",
        data: args,
      });
    };
    Logger.error = (...args: any[]) => {
      this.server.server.sendLoggingMessage({
        level: "error",
        data: args,
      });
    };

    Logger.log("服务器已连接并准备处理请求");
  }

  /**
   * 启动HTTP服务器
   * @param port - 服务器要监听的端口
   */
  async startHttpServer(port: number): Promise<void> {
    const app = express();

    app.get("/sse", async (req: Request, res: Response) => {
      console.log("建立新的SSE连接");
      const transport = new SSEServerTransport(
        "/messages",
        res as unknown as ServerResponse<IncomingMessage>,
      );
      console.log(`为会话ID ${transport.sessionId} 建立了新的SSE连接`);

      this.transports[transport.sessionId] = transport;
      res.on("close", () => {
        delete this.transports[transport.sessionId];
      });

      await this.server.connect(transport);
    });

    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string;
      if (!this.transports[sessionId]) {
        res.status(400).send(`未找到会话ID ${sessionId} 的传输层`);
        return;
      }
      console.log(`收到会话ID ${sessionId} 的消息`);
      await this.transports[sessionId].handlePostMessage(req, res);
    });

    Logger.log = console.log;
    Logger.error = console.error;

    this.httpServer = app.listen(port, () => {
      Logger.log(`HTTP服务器在端口 ${port} 上监听`);
      Logger.log(`SSE端点可访问: http://localhost:${port}/sse`);
      Logger.log(`消息端点可访问: http://localhost:${port}/messages`);
    });
  }

  /**
   * 停止HTTP服务器
   * @throws 如果HTTP服务器未运行则抛出错误
   */
  async stopHttpServer(): Promise<void> {
    if (!this.httpServer) {
      throw new Error("HTTP服务器未运行");
    }

    return new Promise((resolve, reject) => {
      this.httpServer!.close((err: Error | undefined) => {
        if (err) {
          reject(err);
          return;
        }
        this.httpServer = null;
        const closing = Object.values(this.transports).map((transport) => {
          return transport.close();
        });
        Promise.all(closing).then(() => {
          resolve();
        });
      });
    });
  }
}
