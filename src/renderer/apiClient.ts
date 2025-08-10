/**
 * API客户端模块
 * 负责与Teambition API进行通信
 */

import { ApiResponse, TeambitionProject, TeambitionTasklist, TeambitionTask } from '../shared/types';
import { configManager } from './config';
import { extractProjectId, retry } from '../shared/utils';

/**
 * Teambition API客户端类
 */
export class ApiClient {
  private baseUrl: string = 'https://www.teambition.com';
  private projectId: string | null = null;

  /**
   * 初始化API客户端
   */
  public async initialize(): Promise<{ success: boolean; error?: string }> {
    console.log('=== API客户端初始化开始 ===');
    try {
      const config = configManager.getConfig();
      console.log('配置信息:', JSON.stringify(config, null, 2));
      
      if (!config.projectUrl) {
        console.error('初始化失败: 项目URL未配置');
        return { success: false, error: '项目URL未配置' };
      }

      console.log(`项目URL: ${config.projectUrl}`);

      // 提取项目ID
      this.projectId = extractProjectId(config.projectUrl);
      console.log(`提取的项目ID: ${this.projectId}`);
      
      if (!this.projectId) {
        console.error('初始化失败: 无法从项目URL中提取项目ID');
        return { success: false, error: '无法从项目URL中提取项目ID' };
      }

      // 验证项目访问权限
      console.log('正在验证项目访问权限...');
      const projectResult = await this.getProject();
      console.log(`项目访问验证结果 - 成功: ${projectResult.success}, 错误: ${projectResult.error || '无'}`);
      
      if (!projectResult.success) {
        console.error('初始化失败: 无法访问项目');
        return { success: false, error: `无法访问项目: ${projectResult.error}` };
      }

      console.log('API客户端初始化成功，项目ID:', this.projectId);
      console.log('=== API客户端初始化完成 ===');
      return { success: true };
    } catch (error) {
      console.error('API客户端初始化异常:', error);
      return { 
        success: false, 
        error: `API客户端初始化失败: ${error instanceof Error ? error.message : '未知错误'}` 
      };
    }
  }

  /**
   * 获取项目信息
   */
  public async getProject(): Promise<ApiResponse<TeambitionProject>> {
    if (!this.projectId) {
      return { success: false, error: '项目ID未设置' };
    }

    const url = `${this.baseUrl}/api/projects/${this.projectId}`;
    return this.makeRequest<TeambitionProject>(url);
  }

  /**
   * 获取项目的任务列表
   */
  public async getTasklists(): Promise<ApiResponse<TeambitionTasklist[]>> {
    console.log('=== getTasklists() 开始执行 ===');
    console.log(`当前项目ID: ${this.projectId}`);
    
    if (!this.projectId) {
      console.error('getTasklists() 错误: 项目ID未设置');
      return { success: false, error: '项目ID未设置' };
    }

    const url = `${this.baseUrl}/api/projects/${this.projectId}/tasklists`;
    console.log(`请求URL: ${url}`);
    
    console.log('开始发送API请求获取任务列表...');
    const result = await this.makeRequest<TeambitionTasklist[]>(url);
    console.log(`API请求完成 - 成功: ${result.success}, 错误: ${result.error || '无'}`);
    
    if (result.success && result.data) {
      console.log(`成功获取到 ${result.data.length} 个任务列表:`);
      result.data.forEach((tasklist, index) => {
        console.log(`  任务列表 ${index + 1}: ID=${tasklist.id}, 名称="${tasklist.name}"`);
      });
    } else {
      console.error(`获取任务列表失败: ${result.error}`);
    }
    
    console.log('=== getTasklists() 执行完成 ===');
    return result;
  }

  /**
   * 创建任务
   * @param task 任务数据
   * @param tasklistId 任务列表ID（可选）
   */
  public async createTask(
    task: Partial<TeambitionTask>, 
    tasklistId?: string
  ): Promise<ApiResponse<TeambitionTask>> {
    if (!this.projectId) {
      return { success: false, error: '项目ID未设置' };
    }

    const url = `${this.baseUrl}/api/tasks`;
    const payload: any = {
      projectId: this.projectId,
      name: task.name,
      ...task
    };

    // 如果指定了任务列表ID，添加到载荷中
    if (tasklistId) {
      payload.tasklistId = tasklistId;
    }

    return this.makeRequest<TeambitionTask>(url, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  /**
   * 更新任务
   * @param taskId 任务ID
   * @param updates 更新数据
   */
  public async updateTask(
    taskId: string, 
    updates: Partial<TeambitionTask>
  ): Promise<ApiResponse<TeambitionTask>> {
    const url = `${this.baseUrl}/api/tasks/${taskId}`;
    return this.makeRequest<TeambitionTask>(url, {
      method: 'PUT',
      body: JSON.stringify(updates)
    });
  }

  /**
   * 删除任务
   * @param taskId 任务ID
   */
  public async deleteTask(taskId: string): Promise<ApiResponse<void>> {
    const url = `${this.baseUrl}/api/tasks/${taskId}`;
    return this.makeRequest<void>(url, {
      method: 'DELETE'
    });
  }

  /**
   * 获取任务列表
   * @param options 查询选项
   */
  public async getTasks(options: {
    tasklistId?: string;
    status?: string;
    executorId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<ApiResponse<TeambitionTask[]>> {
    if (!this.projectId) {
      return { success: false, error: '项目ID未设置' };
    }

    const params: Record<string, string> = {
      projectId: this.projectId
    };

    // 只添加已定义的选项
    if (options.tasklistId) params.tasklistId = options.tasklistId;
    if (options.status) params.status = options.status;
    if (options.executorId) params.executorId = options.executorId;
    if (options.limit) params.limit = options.limit.toString();
    if (options.offset) params.offset = options.offset.toString();

    const url = `${this.baseUrl}/api/tasks?${params.toString()}`;
    return this.makeRequest<TeambitionTask[]>(url);
  }

  /**
   * 搜索用户
   * @param query 搜索查询
   */
  public async searchUsers(query: string): Promise<ApiResponse<any[]>> {
    if (!this.projectId) {
      return { success: false, error: '项目ID未设置' };
    }

    const url = `${this.baseUrl}/api/projects/${this.projectId}/users/search?query=${encodeURIComponent(query)}`;
    return this.makeRequest<any[]>(url);
  }

  /**
   * 获取用户信息
   * @param userId 用户ID
   */
  public async getUser(userId: string): Promise<ApiResponse<any>> {
    const url = `${this.baseUrl}/api/users/${userId}`;
    return this.makeRequest<any>(url);
  }

  /**
   * 发起API请求
   * @param url 请求URL
   * @param options 请求选项
   */
  private async makeRequest<T>(
    url: string, 
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    } = {}
  ): Promise<ApiResponse<T>> {
    console.log(`=== makeRequest() 开始执行 ===`);
    console.log(`请求URL: ${url}`);
    console.log(`请求方法: ${options.method || 'GET'}`);
    
    const config = configManager.getConfig();
    
    if (!config.cookies) {
      console.error('makeRequest() 错误: Cookies未配置');
      return { success: false, error: 'Cookies未配置，请先获取认证信息' };
    }

    console.log(`Cookies长度: ${config.cookies.length} 字符`);
    console.log(`Cookies前50字符: ${config.cookies.substring(0, 50)}...`);

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'WBS2TB/2.0.0',
      'Cookie': config.cookies,
      ...options.headers
    };

    const requestOptions: any = {
      method: options.method || 'GET',
      headers: requestHeaders
    };

    if (options.body && ['POST', 'PUT', 'PATCH'].includes(options.method?.toUpperCase() || '')) {
      requestOptions.body = options.body;
      console.log(`请求体: ${options.body}`);
    }

    console.log('发送HTTP请求...');
    console.log('请求头:', JSON.stringify(requestHeaders, null, 2));

    try {
      // 使用重试机制增强请求稳定性
      const response = await retry(async () => {
        console.log('通过proxyRequest发送请求...');
        const result = await window.electronAPI.api.proxyRequest(url, requestOptions);
        console.log(`proxyRequest响应 - 成功: ${result.success}, 错误: ${result.error || '无'}`);
        if (result.data) {
          console.log('响应数据:', JSON.stringify(result.data, null, 2));
        }
        if (result.code) {
          console.log(`响应状态码: ${result.code}`);
        }
        return result;
      }, 3, 1000);

      if (!response.success) {
        console.error('API请求失败:', response.error);
        console.error('完整响应:', JSON.stringify(response, null, 2));
        return { success: false, error: response.error || 'API请求失败' };
      }

      console.log('API请求成功完成');
      return {
        success: true,
        data: response.data as T,
        code: response.code
      };
    } catch (error) {
      console.error('API请求异常:', error);
      console.error('异常堆栈:', error instanceof Error ? error.stack : '无堆栈信息');
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'API请求异常' 
      };
    } finally {
      console.log('=== makeRequest() 执行完成 ===');
    }
  }

  /**
   * 批量创建任务
   * @param tasks 任务数组
   * @param tasklistId 任务列表ID（可选）
   */
  public async batchCreateTasks(
    tasks: Partial<TeambitionTask>[], 
    tasklistId?: string
  ): Promise<ApiResponse<{ success: TeambitionTask[]; failed: Array<{ task: Partial<TeambitionTask>; error: string }> }>> {
    const results: TeambitionTask[] = [];
    const failed: Array<{ task: Partial<TeambitionTask>; error: string }> = [];

    // 限制并发数量，避免API限流
    const concurrencyLimit = 3;
    const batches: Partial<TeambitionTask>[][] = [];
    
    for (let i = 0; i < tasks.length; i += concurrencyLimit) {
      batches.push(tasks.slice(i, i + concurrencyLimit));
    }

    for (const batch of batches) {
      const promises = batch.map(async (task) => {
        try {
          const result = await this.createTask(task, tasklistId);
          if (result.success && result.data) {
            return { success: true, task: result.data };
          } else {
            return { success: false, task, error: result.error || '创建任务失败' };
          }
        } catch (error) {
          return { 
            success: false, 
            task, 
            error: error instanceof Error ? error.message : '创建任务异常' 
          };
        }
      });

      const batchResults = await Promise.all(promises);
      
      batchResults.forEach(result => {
        if (result.success && result.task) {
          // 确保result.task是完整的TeambitionTask类型
          results.push(result.task as TeambitionTask);
        } else {
          failed.push({
            task: result.task || {},
            error: result.error || '未知错误'
          });
        }
      });

      // 批次间添加延迟，避免API限流
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    return {
      success: true,
      data: {
        success: results,
        failed
      }
    };
  }

  /**
   * 检查API连接状态
   */
  public async checkConnection(): Promise<ApiResponse<{ connected: boolean; project?: TeambitionProject }>> {
    try {
      const projectResult = await this.getProject();
      if (projectResult.success) {
        return {
          success: true,
          data: {
            connected: true,
            project: projectResult.data
          }
        };
      } else {
        return {
          success: true,
          data: {
            connected: false
          }
        };
      }
    } catch (error) {
      return {
        success: true,
        data: {
          connected: false
        }
      };
    }
  }

  /**
   * 获取API速率限制状态
   */
  public async getRateLimitStatus(): Promise<ApiResponse<{ remaining: number; limit: number; reset: number }>> {
    const url = `${this.baseUrl}/api/rate_limit`;
    return this.makeRequest(url);
  }

  /**
   * 重置客户端状态
   */
  public reset(): void {
    this.projectId = null;
    console.log('API客户端已重置');
  }

  /**
   * 获取当前项目ID
   */
  public getProjectId(): string | null {
    return this.projectId;
  }
}

// 创建全局API客户端实例
export const apiClient = new ApiClient();
