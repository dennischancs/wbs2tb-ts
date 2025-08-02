/**
 * 共享工具函数文件
 * 提供整个应用中使用的通用工具函数
 */

import { LogLevel, LogEntry } from './types';

/**
 * 生成格式化的时间戳
 * @returns 格式化的时间字符串 (HH:MM:SS)
 */
export function formatTimestamp(): string {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * 延迟执行函数
 * @param ms 延迟毫秒数
 * @returns Promise对象
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 从URL中提取项目ID
 * @param url Teambition项目URL
 * @returns 项目ID或null
 */
export function extractProjectId(url: string): string | null {
  const match = url.match(/\/project\/([a-f0-9]+)/);
  return match ? match[1] : null;
}

/**
 * 验证Teambition项目URL格式
 * @param url 项目URL
 * @returns 是否为有效的Teambition项目URL
 */
export function isValidTeambitionUrl(url: string): boolean {
  return /^https:\/\/(www\.)?teambition\.com\/project\/[a-f0-9]+/.test(url);
}

/**
 * 深拷贝对象
 * @param obj 要拷贝的对象
 * @returns 拷贝后的新对象
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T;
  }

  if (typeof obj === 'object') {
    const clonedObj = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }

  return obj;
}

/**
 * 批量处理数组
 * @param array 要处理的数组
 * @param batchSize 批次大小
 * @returns 分批后的二维数组
 */
export function batchArray<T>(array: T[], batchSize: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < array.length; i += batchSize) {
    batches.push(array.slice(i, i + batchSize));
  }
  return batches;
}

/**
 * 生成随机字符串
 * @param length 字符串长度
 * @returns 随机字符串
 */
export function generateRandomString(length: number = 8): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 格式化文件大小
 * @param bytes 字节数
 * @returns 格式化的文件大小字符串
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 检查对象是否为空
 * @param obj 要检查的对象
 * @returns 是否为空对象
 */
export function isEmptyObject(obj: object): boolean {
  return Object.keys(obj).length === 0;
}

/**
 * 安全的JSON解析
 * @param jsonString JSON字符串
 * @param defaultValue 解析失败时的默认值
 * @returns 解析后的对象或默认值
 */
export function safeJsonParse<T>(jsonString: string, defaultValue: T): T {
  try {
    return JSON.parse(jsonString);
  } catch {
    return defaultValue;
  }
}

/**
 * 创建日志条目
 * @param message 日志消息
 * @param level 日志级别
 * @returns 日志条目对象
 */
export function createLogEntry(message: string, level: LogLevel = 'INFO'): LogEntry {
  return {
    timestamp: formatTimestamp(),
    level,
    message
  };
}

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * 节流函数
 * @param func 要节流的函数
 * @param limit 时间限制（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 重试函数
 * @param fn 要重试的函数
 * @param maxRetries 最大重试次数
 * @param delayMs 重试延迟（毫秒）
 * @returns Promise结果
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries) {
        await delay(delayMs);
      }
    }
  }
  
  throw lastError!;
}

/**
 * 日志输出函数
 * @param message 日志消息
 */
export function log(message: string): void {
  const logEntry = createLogEntry(message);
  console.log(`[${logEntry.timestamp}] [${logEntry.level}] ${logEntry.message}`);
}

/**
 * 错误日志输出函数
 * @param message 错误消息
 * @param error 错误对象
 */
export function logError(message: string, error?: unknown): void {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const logEntry = createLogEntry(`${message}: ${errorMessage}`, 'ERROR');
  console.error(`[${logEntry.timestamp}] [${logEntry.level}] ${logEntry.message}`);
}
