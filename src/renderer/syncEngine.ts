import { SyncConfig, TeambitionTask } from '../shared/types';
import { ApiClient } from './apiClient';
import { DataProcessor } from './dataProcessor';
import { configManager } from './config';
import { log, logError, extractProjectId } from '../shared/utils';

export class SyncEngine {
  private apiClient: ApiClient;
  private dataProcessor: DataProcessor;
  private isSyncing = false;
  private syncProgress = 0;
  private totalTasks = 0;
  private processedTasks = 0;
  private onProgressCallback?: (progress: number, message: string) => void;
  private onCompleteCallback?: (success: boolean, message: string) => void;

  constructor() {
    this.apiClient = new ApiClient();
    this.dataProcessor = new DataProcessor();
  }

  /**
   * 设置进度回调函数
   */
  public setProgressCallback(callback: (progress: number, message: string) => void): void {
    this.onProgressCallback = callback;
  }

  /**
   * 设置完成回调函数
   */
  public setCompleteCallback(callback: (success: boolean, message: string) => void): void {
    this.onCompleteCallback = callback;
  }

  /**
   * 开始同步过程
   */
  public async startSync(): Promise<void> {
    if (this.isSyncing) {
      log('同步正在进行中，请勿重复操作。');
      if (this.onCompleteCallback) {
        this.onCompleteCallback(false, '同步正在进行中，请勿重复操作。');
      }
      return;
    }

    this.isSyncing = true;
    this.syncProgress = 0;
    this.processedTasks = 0;

    try {
      this.reportProgress(0, '开始同步...');
      log('开始同步任务...');

      // 1. 初始化API客户端
      this.reportProgress(5, '正在初始化API客户端...');
      log('=== 开始初始化API客户端 ===');
      const initResult = await this.apiClient.initialize();
      log(`API客户端初始化结果 - 成功: ${initResult.success}, 错误: ${initResult.error || '无'}`);
      
      if (!initResult.success) {
        logError('API客户端初始化失败', initResult.error);
        throw new Error(`API客户端初始化失败: ${initResult.error}`);
      }
      
      log('=== API客户端初始化成功 ===');
      
      // 2. 从Excel读取任务数据
      this.reportProgress(10, '正在读取Excel文件...');
      log('正在读取Excel文件...');
      const excelFilePath = configManager.getConfig().pdt; // 'pdt' holds the path
      if (!excelFilePath) {
        throw new Error('Excel文件路径未配置。');
      }
      const sheetName = configManager.getConfig().sheetName;
      if (!sheetName) {
        throw new Error('工作表名称未配置。');
      }
      await this.dataProcessor.readExcelFromPath(excelFilePath, sheetName);
      
      if (!this.dataProcessor.validateColumns()) {
        throw new Error(`Excel列验证失败: ${this.dataProcessor.getErrors().join(', ')}`);
      }
      const excelData = this.dataProcessor.processToTasks();
      if (!excelData || excelData.length === 0) {
        throw new Error('Excel文件中没有找到有效任务数据。');
      }
      this.totalTasks = excelData.length;
      log(`从Excel读取到 ${this.totalTasks} 个任务。`);

      // 3. 获取Teambition任务列表信息
      this.reportProgress(20, '正在获取Teambition任务列表信息...');
      log('=== 开始获取任务列表信息 ===');
      log(`当前项目ID: ${this.apiClient.getProjectId()}`);
      
      const tasklistsResponse = await this.apiClient.getTasklists();
      log(`任务列表API响应 - 成功: ${tasklistsResponse.success}, 错误: ${tasklistsResponse.error || '无'}`);
      
      if (!tasklistsResponse.success || !tasklistsResponse.data) {
        logError('获取任务列表失败', tasklistsResponse.error);
        throw new Error(`获取任务列表失败: ${tasklistsResponse.error}`);
      }
      
      const tasklists = tasklistsResponse.data;
      log(`成功获取到 ${tasklists.length} 个任务列表`);
      
      if (tasklists.length === 0) {
        logError('项目中没有找到任务列表', '请先在Teambition中创建任务列表');
        throw new Error('项目中没有找到任务列表，请先在Teambition中创建任务列表');
      }
      
      // 详细记录每个任务列表的信息
      tasklists.forEach((tasklist, index) => {
        log(`任务列表 ${index + 1}: ID=${tasklist.id}, 名称=${tasklist.name}`);
      });
      
      // 使用第一个任务列表（或者可以根据需要选择特定的任务列表）
      const tasklistId = tasklists[0].id;
      log(`=== 选择使用任务列表: ${tasklists[0].name} (ID: ${tasklistId}) ===`);
      
      // 5. 获取Teambition现有任务
      this.reportProgress(25, '正在获取Teambition现有任务...');
      log('正在获取Teambition现有任务...');
      const existingTasksResponse = await this.apiClient.getTasks({ tasklistId });
      if (!existingTasksResponse.success || !existingTasksResponse.data) {
        throw new Error(`获取Teambition任务失败: ${existingTasksResponse.error}`);
      }
      const existingTasks = existingTasksResponse.data;
      log(`Teambition项目中现有 ${existingTasks.length} 个任务。`);

      // 6. 数据比对和同步
      this.reportProgress(30, '开始比对和同步任务...');
      log('开始比对和同步任务...');
      await this.syncTasks(excelData, existingTasks);

      this.reportProgress(100, '同步完成！');
      log('所有任务同步完成！');
      if (this.onCompleteCallback) {
        this.onCompleteCallback(true, '同步完成！');
      }
    } catch (error) {
      logError('同步过程中发生错误:', error);
      const errorMessage = error instanceof Error ? error.message : '发生未知错误';
      this.reportProgress(this.syncProgress, `同步失败: ${errorMessage}`);
      if (this.onCompleteCallback) {
        this.onCompleteCallback(false, `同步失败: ${errorMessage}`);
      }
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * 同步任务列表
   */
  private async syncTasks(
    excelTasks: TeambitionTask[],
    existingTasks: TeambitionTask[]
  ): Promise<void> {
    const config = configManager.getConfig();
    const batchSize = config.batchSize;
    const maxConcurrent = config.maxConcurrent;
    const useAsync = config.useAsync;
    const projectId = this.apiClient.getProjectId();
    if (!projectId) {
        throw new Error("Project ID is not available from API client.");
    }

    // 创建一个Map以便快速查找现有任务
    const existingTasksMap = new Map<string, TeambitionTask>();
    existingTasks.forEach(task => {
      if (task.name) {
        existingTasksMap.set(task.name, task);
      }
    });

    const tasksToCreate: TeambitionTask[] = [];
    const tasksToUpdate: { id: string; task: TeambitionTask }[] = [];

    // 比对任务
    excelTasks.forEach(excelTask => {
      const existingTask = existingTasksMap.get(excelTask.name);
      if (existingTask && existingTask.id) {
        // 任务已存在，检查是否需要更新
        if (this.isTaskDifferent(excelTask, existingTask)) {
          tasksToUpdate.push({ id: existingTask.id, task: excelTask });
        }
      } else {
        // 任务不存在，需要创建
        tasksToCreate.push(excelTask);
      }
    });

    log(`需要创建 ${tasksToCreate.length} 个新任务，更新 ${tasksToUpdate.length} 个现有任务。`);

    const totalOperations = tasksToCreate.length + tasksToUpdate.length;
    let completedOperations = 0;

    const updateProgress = () => {
      completedOperations++;
      const currentProgress = 20 + Math.floor((completedOperations / totalOperations) * 80);
      this.reportProgress(currentProgress, `正在同步任务... (${completedOperations}/${totalOperations})`);
    };

    if (useAsync) {
      // 异步并发处理
      await this.processConcurrently(
        tasksToCreate.map(task => async () => {
          const result = await this.apiClient.createTask(task);
          if (result.success) {
            updateProgress();
          } else {
            logError(`创建任务失败: ${task.name}`, result.error);
            // Still count as processed to avoid blocking, but log error
            updateProgress(); 
          }
        }),
        maxConcurrent
      );
      await this.processConcurrently(
        tasksToUpdate.map(({ id, task }) => async () => {
          const result = await this.apiClient.updateTask(id, task);
          if (result.success) {
            updateProgress();
          } else {
            logError(`更新任务失败: ${task.name} (ID: ${id})`, result.error);
            // Still count as processed
            updateProgress();
          }
        }),
        maxConcurrent
      );
    } else {
      // 同步批处理
      for (let i = 0; i < tasksToCreate.length; i += batchSize) {
        const batch = tasksToCreate.slice(i, i + batchSize);
        await Promise.all(batch.map(task => this.apiClient.createTask(task)));
        batch.forEach(() => updateProgress());
      }
      for (let i = 0; i < tasksToUpdate.length; i += batchSize) {
        const batch = tasksToUpdate.slice(i, i + batchSize);
        await Promise.all(batch.map(({ id, task }) => this.apiClient.updateTask(id, task)));
        batch.forEach(() => updateProgress());
      }
    }
  }

  /**
   * 并发处理任务
   */
  private async processConcurrently(tasks: (() => Promise<void>)[], maxConcurrent: number): Promise<void> {
    const executing = new Set<Promise<void>>();
    for (const task of tasks) {
      if (executing.size >= maxConcurrent) {
        await Promise.race(executing);
      }
      const promise = task().finally(() => executing.delete(promise));
      executing.add(promise);
    }
    await Promise.all(executing);
  }

  /**
   * 比较两个任务是否不同
   */
  private isTaskDifference(task1: TeambitionTask, task2: TeambitionTask): boolean {
    // 这里可以根据实际需求比较更多字段
    return (
      task1.description !== task2.description ||
      task1.executorId !== task2.executorId ||
      task1.startDate !== task2.startDate ||
      task1.dueDate !== task2.dueDate ||
      task1.priority !== task2.priority ||
      task1.status !== task2.status
    );
  }
  
  // Helper function to check if tasks are different, alias for isTaskDifference
  private isTaskDifferent(task1: TeambitionTask, task2: TeambitionTask): boolean {
    return this.isTaskDifference(task1, task2);
  }



  /**
   * 报告进度
   */
  private reportProgress(progress: number, message: string): void {
    this.syncProgress = progress;
    log(`同步进度: ${progress}% - ${message}`);
    if (this.onProgressCallback) {
      this.onProgressCallback(progress, message);
    }
  }
}
