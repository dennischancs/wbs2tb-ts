/**
 * 共享类型定义文件
 * 定义整个应用中使用的基础类型和接口
 */

// Teambition任务接口
export interface TeambitionTask {
  id?: string;                    // 任务ID
  name: string;                   // 任务名称
  description?: string;           // 任务描述
  executorId?: string;            // 执行者ID
  startDate?: string;             // 开始日期
  dueDate?: string;               // 截止日期
  priority?: 'normal' | 'urgent' | 'low'; // 优先级
  status?: 'todo' | 'doing' | 'done';     // 状态
  projectId?: string;             // 项目ID
  tasklistId?: string;            // 任务列表ID
}

// Excel行数据接口
export interface ExcelRowData {
  [key: string]: string | number | boolean | undefined; // 动态键值对
}

// 同步配置接口
export interface SyncConfig {
  projectUrl: string;             // 项目URL
  cookies: string;                // Cookies
  sheetName: string;              // 工作表名称
  batchSize: number;              // 批处理大小
  maxConcurrent: number;          // 最大并发数
  useAsync: boolean;              // 是否使用异步模式
  pdt?: string;                   // 项目负责人
  excelFilePath?: string;         // Excel文件路径
}

// 同步统计信息接口
export interface SyncStats {
  total: number;                  // 总任务数
  success: number;                // 成功数
  failed: number;                 // 失败数
  skipped: number;                // 跳过数
  getProgress(): number;          // 获取进度百分比
}

// Cookie接口
export interface AppCookie {
  name: string;                   // Cookie名称
  value: string;                  // Cookie值
  domain?: string;                // 域名
  path?: string;                  // 路径
  expires?: number;               // 过期时间
  secure?: boolean;               // 安全标志
  httpOnly?: boolean;             // HttpOnly标志
  sameSite?: 'strict' | 'lax' | 'unspecified' | 'no_restriction'; // SameSite属性
}

// 日志级别类型
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

// 日志条目接口
export interface LogEntry {
  timestamp: string;              // 时间戳
  level: LogLevel;                // 日志级别
  message: string;                // 日志消息
}

// API响应接口
export interface ApiResponse<T = any> {
  success: boolean;               // 是否成功
  data?: T;                       // 响应数据
  error?: string;                 // 错误信息
  code?: number;                  // 状态码
}

// Teambition项目信息接口
export interface TeambitionProject {
  id: string;                     // 项目ID
  name: string;                   // 项目名称
  description?: string;           // 项目描述
  organizationId: string;         // 组织ID
  creatorId: string;              // 创建者ID
  created: string;                // 创建时间
  updated: string;                // 更新时间
  status: 'active' | 'archived';  // 项目状态
}

// Teambition任务列表接口
export interface TeambitionTasklist {
  id: string;                     // 任务列表ID
  name: string;                   // 任务列表名称
  projectId: string;              // 项目ID
  isArchived: boolean;            // 是否已归档
  order: number;                  // 排序
}
