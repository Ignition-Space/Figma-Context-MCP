import fs from "fs";
import path from "path";

import type { Paint, RGBA } from "@figma/rest-api-spec";
import { CSSHexColor, CSSRGBAColor, SimplifiedFill } from "~/services/simplify-node-response.js";

export type StyleId = `${string}_${string}` & { __brand: "StyleId" };

export interface ColorValue {
  hex: CSSHexColor;
  opacity: number;
}

/**
 * 下载Figma图像并本地保存
 * @param fileName - 保存的文件名
 * @param localPath - 本地保存路径
 * @param imageUrl - 图像URL (images[nodeId])
 * @returns 返回一个Promise，解析为保存图像的完整文件路径
 * @throws 如果下载失败则抛出错误
 */
export async function downloadFigmaImage(
  fileName: string,
  localPath: string,
  imageUrl: string,
): Promise<string> {
  try {
    // 确保本地路径存在
    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(localPath, { recursive: true });
    }
    // 构建完整的文件路径
    const fullPath = path.join(localPath, fileName);

    console.log('fullPath====>', fullPath);

    // 使用fetch下载图像
    const response = await fetch(imageUrl, {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(`下载图像失败: ${response.statusText}`);
    }

    // 创建写入流
    const writer = fs.createWriteStream(fullPath);

    // 获取响应的可读流并输出到文件
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("获取响应主体失败");
    }

    return new Promise((resolve, reject) => {
      // 处理流
      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              writer.end();
              break;
            }
            writer.write(value);
          }
          resolve(fullPath);
        } catch (err) {
          writer.end();
          fs.unlink(fullPath, () => { });
          reject(err);
        }
      };

      writer.on("error", (err) => {
        reader.cancel();
        fs.unlink(fullPath, () => { });
        reject(new Error(`写入图像失败: ${err.message}`));
      });

      processStream();
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`下载图像时出错: ${errorMessage}`);
  }
}

/**
 * 从对象中删除包含空数组或空对象的键
 * @param input - 输入对象或值
 * @returns 处理后的对象或原始值
 */
export function removeEmptyKeys<T>(input: T): T {
  // 如果不是对象类型或为null，直接返回
  if (typeof input !== "object" || input === null) {
    return input;
  }

  // 处理数组类型
  if (Array.isArray(input)) {
    return input.map((item) => removeEmptyKeys(item)) as T;
  }

  // 处理对象类型
  const result = {} as T;
  for (const key in input) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = input[key];

      // 递归处理嵌套对象
      const cleanedValue = removeEmptyKeys(value);

      // 跳过空数组和空对象
      if (
        cleanedValue !== undefined &&
        !(Array.isArray(cleanedValue) && cleanedValue.length === 0) &&
        !(
          typeof cleanedValue === "object" &&
          cleanedValue !== null &&
          Object.keys(cleanedValue).length === 0
        )
      ) {
        result[key] = cleanedValue;
      }
    }
  }

  return result;
}

/**
 * 将十六进制颜色值和不透明度转换为rgba格式
 * @param hex - 十六进制颜色值（例如，"#FF0000"或"#F00"）
 * @param opacity - 不透明度值（0-1）
 * @returns rgba格式的颜色字符串
 */
export function hexToRgba(hex: string, opacity: number = 1): string {
  // 移除可能的#前缀
  hex = hex.replace("#", "");

  // 处理简写的十六进制值（例如，#FFF）
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  // 将十六进制转换为RGB值
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // 确保不透明度在0-1范围内
  const validOpacity = Math.min(Math.max(opacity, 0), 1);

  return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
}

/**
 * 将颜色从RGBA转换为{hex，opacity}
 *
 * @param color - 要转换的颜色，包括alpha通道
 * @param opacity - 颜色的不透明度，如果不包含在alpha通道中
 * @returns 转换后的颜色
 **/
export function convertColor(color: RGBA, opacity = 1): ColorValue {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);

  // Alpha通道默认为1。如果不透明度和alpha都<1，它们的效果是相乘的
  const a = Math.round(opacity * color.a * 100) / 100;

  const hex = ("#" +
    ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()) as CSSHexColor;

  return { hex, opacity: a };
}

/**
 * 将Figma RGBA颜色转换为CSS的rgba(#, #, #, #)格式
 *
 * @param color - 要转换的颜色，包括alpha通道
 * @param opacity - 颜色的不透明度，如果不包含在alpha通道中
 * @returns 转换后的颜色
 **/
export function formatRGBAColor(color: RGBA, opacity = 1): CSSRGBAColor {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  // Alpha通道默认为1。如果不透明度和alpha都<1，它们的效果是相乘的
  const a = Math.round(opacity * color.a * 100) / 100;

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * 生成一个6字符的随机变量ID
 * @param prefix - ID前缀
 * @returns 带前缀的6字符随机ID字符串
 */
export function generateVarId(prefix: string = "var"): StyleId {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }

  return `${prefix}_${result}` as StyleId;
}

/**
 * 为具有上、右、下、左值的属性生成CSS简写形式
 *
 * 输入: { top: 10, right: 10, bottom: 10, left: 10 }
 * 输出: "10px"
 *
 * 输入: { top: 10, right: 20, bottom: 10, left: 20 }
 * 输出: "10px 20px"
 *
 * 输入: { top: 10, right: 20, bottom: 30, left: 40 }
 * 输出: "10px 20px 30px 40px"
 *
 * @param values - 生成简写形式的值
 * @returns 生成的简写形式
 */
export function generateCSSShorthand(
  values: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  },
  {
    ignoreZero = true,
    suffix = "px",
  }: {
    /**
     * 如果为true且所有值都为0，则返回undefined。默认为true。
     */
    ignoreZero?: boolean;
    /**
     * 添加到简写形式的后缀。默认为"px"。
     */
    suffix?: string;
  } = {},
) {
  const { top, right, bottom, left } = values;
  if (ignoreZero && top === 0 && right === 0 && bottom === 0 && left === 0) {
    return undefined;
  }
  if (top === right && right === bottom && bottom === left) {
    return `${top}${suffix}`;
  }
  if (right === left) {
    if (top === bottom) {
      return `${top}${suffix} ${right}${suffix}`;
    }
    return `${top}${suffix} ${right}${suffix} ${bottom}${suffix}`;
  }
  return `${top}${suffix} ${right}${suffix} ${bottom}${suffix} ${left}${suffix}`;
}

/**
 * Convert a Figma paint (solid, image, gradient) to a SimplifiedFill
 * @param raw - The Figma paint to convert
 * @returns The converted SimplifiedFill
 */
export function parsePaint(raw: Paint): SimplifiedFill {
  if (raw.type === "IMAGE") {
    return {
      type: "IMAGE",
      imageRef: raw.imageRef,
      scaleMode: raw.scaleMode,
    };
  } else if (raw.type === "SOLID") {
    // treat as SOLID
    const { hex, opacity } = convertColor(raw.color!, raw.opacity);
    if (opacity === 1) {
      return hex;
    } else {
      return formatRGBAColor(raw.color!, opacity);
    }
  } else if (
    ["GRADIENT_LINEAR", "GRADIENT_RADIAL", "GRADIENT_ANGULAR", "GRADIENT_DIAMOND"].includes(
      raw.type,
    )
  ) {
    // treat as GRADIENT_LINEAR
    return {
      type: raw.type,
      gradientHandlePositions: raw.gradientHandlePositions,
      gradientStops: raw.gradientStops.map(({ position, color }) => ({
        position,
        color: convertColor(color),
      })),
    };
  } else {
    throw new Error(`Unknown paint type: ${raw.type}`);
  }
}

/**
 * Check if an element is visible
 * @param element - The item to check
 * @returns True if the item is visible, false otherwise
 */
export function isVisible(element: { visible?: boolean }): boolean {
  return element.visible ?? true;
}
