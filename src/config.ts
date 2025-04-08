import { config } from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

// 从.env文件加载环境变量
config();

/**
 * 服务器配置接口
 */
interface ServerConfig {
  figmaApiKey: string;
  port: number;
  configSources: {
    figmaApiKey: "cli" | "env";
    port: "cli" | "env" | "default";
  };
}

/**
 * 掩盖API密钥，只显示最后4位字符
 * @param key - 需要掩盖的API密钥
 * @returns 掩盖后的字符串
 */
function maskApiKey(key: string): string {
  if (key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

/**
 * 命令行参数接口
 */
interface CliArgs {
  "figma-api-key"?: string;
  port?: number;
}

/**
 * 获取服务器配置
 * @param isStdioMode - 是否在标准输入输出模式运行
 * @returns 服务器配置对象
 */
export function getServerConfig(isStdioMode: boolean): ServerConfig {
  // 解析命令行参数
  const argv = yargs(hideBin(process.argv))
    .options({
      "figma-api-key": {
        type: "string",
        description: "Figma API密钥",
      },
      port: {
        type: "number",
        description: "服务器运行的端口",
      },
    })
    .help()
    .version("0.1.15")
    .parseSync() as CliArgs;

  const config: ServerConfig = {
    figmaApiKey: "",
    port: 3333,
    configSources: {
      figmaApiKey: "env",
      port: "default",
    },
  };

  // 处理FIGMA_API_KEY
  if (argv["figma-api-key"]) {
    config.figmaApiKey = argv["figma-api-key"];
    config.configSources.figmaApiKey = "cli";
  } else if (process.env.FIGMA_API_KEY) {
    config.figmaApiKey = process.env.FIGMA_API_KEY;
    config.configSources.figmaApiKey = "env";
  }

  // 处理PORT
  if (argv.port) {
    config.port = argv.port;
    config.configSources.port = "cli";
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
    config.configSources.port = "env";
  }

  // 验证配置
  if (!config.figmaApiKey) {
    console.error("需要FIGMA_API_KEY（通过CLI参数--figma-api-key或.env文件提供）");
    process.exit(1);
  }

  // 记录配置来源
  if (!isStdioMode) {
    console.log("\n配置:");
    console.log(
      `- FIGMA_API_KEY: ${maskApiKey(config.figmaApiKey)} (来源: ${config.configSources.figmaApiKey})`,
    );
    console.log(`- PORT: ${config.port} (来源: ${config.configSources.port})`);
    console.log(); // 空行，提高可读性
  }

  return config;
}
