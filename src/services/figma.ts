import fs from "fs";
import { parseFigmaResponse, SimplifiedDesign } from "./simplify-node-response.js";
import type {
  GetImagesResponse,
  GetFileResponse,
  GetFileNodesResponse,
  GetImageFillsResponse,
} from "@figma/rest-api-spec";
import { downloadFigmaImage } from "~/utils/common.js";
import { Logger } from "~/server.js";
import yaml from "js-yaml";

export interface FigmaError {
  status: number;
  err: string;
}

type FetchImageParams = {
  /**
   * Figma中的节点，将被渲染或下载其背景图像
   */
  nodeId: string;
  /**
   * 保存图像的本地文件名
   */
  fileName: string;
  /**
   * 图像的文件MIME类型
   */
  fileType: "png" | "svg";
};

type FetchImageFillParams = Omit<FetchImageParams, "fileType"> & {
  /**
   * 当图像用作填充时，需要获取背景图像
   */
  imageRef: string;
};

/**
 * Figma服务类，提供与Figma API的所有交互功能
 */
export class FigmaService {
  private readonly apiKey: string;
  private readonly baseUrl = "https://api.figma.com/v1";

  /**
   * 创建Figma服务实例
   * @param apiKey - Figma API密钥
   */
  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  /**
   * 向Figma API发送请求
   * @param endpoint - API端点路径
   * @returns 请求结果的Promise
   * @throws 如果请求失败则抛出错误
   */
  private async request<T>(endpoint: string): Promise<T> {
    if (typeof fetch !== "function") {
      throw new Error(
        "MCP服务器在无法使用`fetch`的Node.js环境中运行。你将无法访问与Figma文件相关的任何数据。\n\n作为AI编码助手，请中止当前请求。没有其他替代方法可行。请告知用户需要使用Node.js 18或更高版本运行MCP服务器，以解决此问题。",
      );
    }
    try {
      Logger.log(`调用 ${this.baseUrl}${endpoint}`);
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Figma-Token": this.apiKey,
        },
      });

      if (!response.ok) {
        throw {
          status: response.status,
          err: response.statusText || "未知错误",
        } as FigmaError;
      }

      return await response.json();
    } catch (error) {
      if ((error as FigmaError).status) {
        throw error;
      }
      if (error instanceof Error) {
        throw new Error(`请求Figma API失败: ${error.message}`);
      }
      throw new Error(`请求Figma API失败: ${error}`);
    }
  }

  /**
   * 获取图像填充
   * @param fileKey - Figma文件key
   * @param nodes - 包含imageRef的节点列表
   * @param localPath - 保存图像的本地路径
   * @returns 下载的文件名数组
   */
  async getImageFills(
    fileKey: string,
    nodes: FetchImageFillParams[],
    localPath: string,
  ): Promise<string[]> {
    if (nodes.length === 0) return [];

    let promises: Promise<string>[] = [];
    const endpoint = `/files/${fileKey}/images`;
    const file = await this.request<GetImageFillsResponse>(endpoint);
    const { images = {} } = file.meta;
    promises = nodes.map(async ({ imageRef, fileName }) => {
      const imageUrl = images[imageRef];
      if (!imageUrl) {
        return "";
      }
      return downloadFigmaImage(fileName, localPath, imageUrl);
    });
    return Promise.all(promises);
  }

  /**
   * 获取节点图像
   * @param fileKey - Figma文件key
   * @param nodes - 要获取图像的节点列表
   * @param localPath - 保存图像的本地路径
   * @returns 下载的文件名数组
   */
  async getImages(
    fileKey: string,
    nodes: FetchImageParams[],
    localPath: string,
  ): Promise<string[]> {
    const pngIds = nodes.filter(({ fileType }) => fileType === "png").map(({ nodeId }) => nodeId);
    const pngFiles =
      pngIds.length > 0
        ? this.request<GetImagesResponse>(
          `/images/${fileKey}?ids=${pngIds.join(",")}&scale=2&format=png`,
        ).then(({ images = {} }) => images)
        : ({} as GetImagesResponse["images"]);

    const svgIds = nodes.filter(({ fileType }) => fileType === "svg").map(({ nodeId }) => nodeId);
    const svgFiles =
      svgIds.length > 0
        ? this.request<GetImagesResponse>(
          `/images/${fileKey}?ids=${svgIds.join(",")}&scale=2&format=svg`,
        ).then(({ images = {} }) => images)
        : ({} as GetImagesResponse["images"]);

    const files = await Promise.all([pngFiles, svgFiles]).then(([f, l]) => ({ ...f, ...l }));

    const downloads = nodes
      .map(({ nodeId, fileName }) => {
        const imageUrl = files[nodeId];
        if (imageUrl) {
          return downloadFigmaImage(fileName, localPath, imageUrl);
        }
        return false;
      })
      .filter((url) => !!url);

    return Promise.all(downloads);
  }

  /**
   * 获取整个Figma文件
   * @param fileKey - Figma文件key
   * @param depth - 遍历深度（可选）
   * @returns 简化的设计数据
   */
  async getFile(fileKey: string, depth?: number): Promise<SimplifiedDesign> {
    try {
      const endpoint = `/files/${fileKey}${depth ? `?depth=${depth}` : ""}`;
      Logger.log(`正在获取Figma文件: ${fileKey} (深度: ${depth ?? "默认"})`);
      const response = await this.request<GetFileResponse>(endpoint);
      Logger.log("已获取响应");
      const simplifiedResponse = parseFigmaResponse(response);
      writeLogs("figma-raw.yml", response);
      writeLogs("figma-simplified.yml", simplifiedResponse);
      return simplifiedResponse;
    } catch (e) {
      console.error("获取文件失败:", e);
      throw e;
    }
  }

  /**
   * 获取特定Figma节点
   * @param fileKey - Figma文件key
   * @param nodeId - 节点ID
   * @param depth - 遍历深度（可选）
   * @returns 简化的设计数据
   */
  async getNode(fileKey: string, nodeId: string, depth?: number): Promise<SimplifiedDesign> {
    const endpoint = `/files/${fileKey}/nodes?ids=${nodeId}${depth ? `&depth=${depth}` : ""}`;
    const response = await this.request<GetFileNodesResponse>(endpoint);
    Logger.log("已从getNode获取响应，正在解析。");
    writeLogs("figma-raw.yml", response);
    const simplifiedResponse = parseFigmaResponse(response);
    writeLogs("figma-simplified.yml", simplifiedResponse);
    return simplifiedResponse;
  }
}

/**
 * 写入日志文件
 * @param name - 日志文件名
 * @param value - 要记录的数据
 */
function writeLogs(name: string, value: any) {
  try {
    if (process.env.NODE_ENV !== "development") return;

    const logsDir = "logs";

    try {
      fs.accessSync(process.cwd(), fs.constants.W_OK);
    } catch (error) {
      Logger.log("写入日志失败:", error);
      return;
    }

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }
    fs.writeFileSync(`${logsDir}/${name}`, yaml.dump(value));
  } catch (error) {
    console.debug("写入日志失败:", error);
  }
}
