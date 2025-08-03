/**
 * 数据处理模块
 * 负责Excel数据的读取、验证和转换为任务格式
 */

import { ExcelRowData } from '../shared/types'; // TeambitionTask interface will no longer be directly used for the output
import { configManager } from './config';

/**
 * 数据处理类
 */
export class DataProcessor {
  private excelData: any[] = [];
  private headers: string[] = [];
  private errors: string[] = [];

  /**
   * 读取Excel文件数据 (通过File对象)
   * @param file Excel文件对象
   * @param sheetName 工作表名称
   */
  public async readExcel(file: File, sheetName: string): Promise<void> {
    // This method now simply calls readExcelFromPath for consistency
    await this.readExcelFromPath(file.path, sheetName);
  }

  /**
   * 读取Excel文件数据 (通过文件路径)
   * @param filePath Excel文件路径
   * @param sheetName 工作表名称
   */
  public async readExcelFromPath(filePath: string, sheetName: string): Promise<void> {
    this.clearErrors();
    
    try {
      // 通过主进程读取Excel文件
      const result = await window.electronAPI.file.readExcelFile(filePath, sheetName);
      
      if (!result.success) {
        this.addError(`读取Excel文件失败: ${result.error}`);
        throw new Error(result.error);
      }

      this.excelData = result.data || [];
      
      if (this.excelData.length === 0) {
        this.addError('Excel文件中没有数据');
        return;
      }

      // 提取表头，并确保所有表头都是字符串
      this.headers = (this.excelData[0] as any[]).map(h => String(h || ''));
      
      console.log(`成功读取Excel数据: ${this.excelData.length} 行, ${this.headers.length} 列`);
      
    } catch (error) {
      this.addError(`读取Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }
  }

  /**
   * 验证Excel数据列
   */
  public validateColumns(): boolean {
    this.clearErrors();
    
    if (this.headers.length === 0) {
      this.addError('Excel文件中没有表头数据');
      return false;
    }

    // 必需的列名映射（支持中英文）
    const requiredColumns = {
      // 任务名称相关
      taskName: ['任务名称', '任务', 'name', 'task', 'title'],
      // 执行者相关
      executor: ['执行者', '负责人', 'executor', 'assignee', 'owner'],
      // 开始时间相关
      startDate: ['开始时间', '开始日期', 'start', 'startdate'],
      // 截止时间相关
      dueDate: ['截止时间', '结束时间', 'due', 'enddate', 'deadline'],
      // 优先级相关
      priority: ['优先级', 'priority'],
      // 状态相关
      status: ['状态', 'status', 'state']
    };

    const foundColumns: Record<string, string> = {};
    const missingColumns: string[] = [];

    // 检查每个必需列
    for (const [key, possibleNames] of Object.entries(requiredColumns)) {
      const foundColumn = this.headers.find(header => 
        possibleNames.some(name => 
          header.toLowerCase().includes(name.toLowerCase())
        )
      );

      if (foundColumn) {
        foundColumns[key] = foundColumn;
      } else {
        if (key === 'taskName') {
          missingColumns.push('任务名称');
        }
      }
    }

    // 任务名称是必需的
    if (missingColumns.includes('任务名称')) {
      this.addError('Excel文件中缺少任务名称列，请确保包含"任务名称"、"任务"、"name"或"task"等列');
      return false;
    }

    console.log('列映射结果:', foundColumns);
    return true;
  }

  /**
   * 将Excel数据转换为任务数组
   * Output format matches the expectations of SyncEngineV2 in main.ts
   */
  public processToTasks(): any[] {
    this.clearErrors();
    
    if (this.excelData.length < 2) {
      this.addError('Excel文件中没有有效的数据行');
      return [];
    }

    const tasks: any[] = [];
    
    // 跳过表头行，从第二行开始处理
    for (let i = 1; i < this.excelData.length; i++) {
      const row = this.excelData[i] as ExcelRowData;
      
      try {
        const task = this.convertRowToTask(row, i + 1);
        if (task) {
          tasks.push(task);
        }
      } catch (error) {
        this.addError(`第 ${i + 1} 行数据处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    console.log(`成功转换 ${tasks.length} 个任务`);
    return tasks;
  }

  /**
   * 将单行数据转换为任务对象
   * Output format matches the expectations of SyncEngineV2 in main.ts
   * @param row 行数据
   * @param rowIndex 行号（用于错误提示）
   */
  private convertRowToTask(row: ExcelRowData, rowIndex: number): any | null {
    // 查找任务编号列 (Optional)
    const taskNumber = this.findColumnValue(row, ['任务编号', '编号', 'id', 'number']);
    
    // 查找任务名称列 (Mandatory)
    const taskName = this.findColumnValue(row, ['任务名称', '任务', 'name', 'task', 'title']);
    
    if (!taskName || String(taskName).trim() === '') {
      console.log(`第 ${rowIndex} 行: 跳过空任务 (缺少任务名称)`);
      return null;
    }

    const task: any = {
      task_number: taskNumber ? String(taskNumber).trim() : undefined,
      task_title: String(taskName).trim(),
      rowIndex: rowIndex // Added for better error reporting in main process
    };

    // 查找并设置执行者
    const executor = this.findColumnValue(row, ['执行者', '负责人', 'executor', 'assignee', 'owner']);
    if (executor && String(executor).trim() !== '') {
      task.executor = String(executor).trim();
    }

    // 查找并设置开始时间
    const startDate = this.findColumnValue(row, ['开始时间', '开始日期', 'start', 'startdate']);
    if (startDate && String(startDate).trim() !== '') {
      const parsedDate = this.parseDate(String(startDate));
      if (parsedDate) {
        task.start_date = parsedDate;
      } else {
        this.addError(`第 ${rowIndex} 行: 开始时间格式无效 "${startDate}"`);
      }
    }

    // 查找并设置截止时间
    const dueDate = this.findColumnValue(row, ['截止时间', '结束时间', 'due', 'enddate', 'deadline']);
    if (dueDate && String(dueDate).trim() !== '') {
      const parsedDate = this.parseDate(String(dueDate));
      if (parsedDate) {
        task.end_date = parsedDate; // main.ts expects 'end_date'
      } else {
        this.addError(`第 ${rowIndex} 行: 截止时间格式无效 "${dueDate}"`);
      }
    }

    // 查找并设置提醒规则
    const reminderRule = this.findColumnValue(row, ['提醒规则', '提醒', 'reminder']);
    if (reminderRule && String(reminderRule).trim() !== '') {
      task.reminder_rule_api = String(reminderRule).trim(); // main.ts expects 'reminder_rule_api'
    }

    // 查找并设置参与人
    const involvers = this.findColumnValue(row, ['参与人', '参与者', 'involvers', 'members']);
    if (involvers && String(involvers).trim() !== '') {
      task.involvers = String(involvers).trim();
    }
    
    // 查找并设置计划工时 (in hours)
    const planTime = this.findColumnValue(row, ['计划工时', '工时', 'plan time', 'hours']);
    if (planTime && String(planTime).trim() !== '') {
      const parsedPlanTime = parseFloat(String(planTime));
      if (!isNaN(parsedPlanTime) && isFinite(parsedPlanTime)) {
        task.plan_time = parsedPlanTime; // main.ts expects 'plan_time'
      } else {
        this.addError(`第 ${rowIndex} 行: 计划工时格式无效 "${planTime}"，应为数字`);
      }
    }

    return task;
  }

  /**
   * 在行数据中查找指定列的值
   * @param row 行数据
   * @param possibleNames 可能的列名列表
   */
  private findColumnValue(row: ExcelRowData, possibleNames: string[]): any {
    for (const name of possibleNames) {
      for (const [key, value] of Object.entries(row)) {
        if (key && String(key).toLowerCase().includes(name.toLowerCase())) {
          return value;
        }
      }
    }
    return undefined;
  }

  /**
   * 解析日期字符串
   * @param dateStr 日期字符串
   */
  private parseDate(dateStr: string): string | null {
    try {
      // 尝试解析各种日期格式
      const date = new Date(dateStr);
      
      if (isNaN(date.getTime())) {
        return null;
      }

      // 格式化为 ISO 字符串 (YYYY-MM-DD)
      return date.toISOString().split('T')[0];
    } catch {
      return null;
    }
  }

  /**
   * 标准化优先级
   * @param priority 优先级字符串
   */
  private normalizePriority(priority: string): 'normal' | 'urgent' | 'low' | null {
    const normalized = priority.toLowerCase().trim();
    
    // 数字映射
    if (normalized === '1' || normalized === '高' || normalized === 'urgent' || normalized === '紧急') {
      return 'urgent';
    }
    
    if (normalized === '2' || normalized === '中' || normalized === 'normal' || normalized === '普通') {
      return 'normal';
    }
    
    if (normalized === '3' || normalized === '低' || normalized === 'low') {
      return 'low';
    }

    return null;
  }

  /**
   * 标准化状态
   * @param status 状态字符串
   */
  private normalizeStatus(status: string): 'todo' | 'doing' | 'done' | null {
    const normalized = status.toLowerCase().trim();
    
    if (normalized === '待办' || normalized === 'todo' || normalized === '未开始' || normalized === '未开始') {
      return 'todo';
    }
    
    if (normalized === '进行中' || normalized === 'doing' || normalized === '处理中' || normalized === 'inprogress') {
      return 'doing';
    }
    
    if (normalized === '已完成' || normalized === 'done' || normalized === '完成' || normalized === 'finished') {
      return 'done';
    }

    return null;
  }

  /**
   * 添加错误信息
   * @param error 错误信息
   */
  private addError(error: string): void {
    this.errors.push(error);
    console.error('数据处理错误:', error);
  }

  /**
   * 清空错误信息
   */
  private clearErrors(): void {
    this.errors = [];
  }

  /**
   * 获取所有错误信息
   */
  public getErrors(): string[] {
    return [...this.errors];
  }

  /**
   * 获取数据预览
   * @param previewRows 预览行数
   */
  public getDataPreview(previewRows: number = 10): any[] {
    if (this.excelData.length === 0) {
      return [];
    }

    const preview = [];
    const maxRows = Math.min(previewRows + 1, this.excelData.length); // +1 包含表头

    for (let i = 0; i < maxRows; i++) {
      preview.push(this.excelData[i]);
    }

    return preview;
  }

  /**
   * 获取表头信息
   */
  public getHeaders(): string[] {
    return [...this.headers];
  }

  /**
   * 获取数据统计信息
   */
  public getDataStats(): {
    totalRows: number;
    totalColumns: number;
    hasHeaders: boolean;
    dataRows: number;
  } {
    return {
      totalRows: this.excelData.length,
      totalColumns: this.headers.length,
      hasHeaders: this.headers.length > 0,
      dataRows: this.excelData.length > 0 ? this.excelData.length - 1 : 0
    };
  }

  /**
   * 验证数据质量
   */
  public validateDataQuality(): {
    isValid: boolean;
    warnings: string[];
    suggestions: string[];
  } {
    const warnings: string[] = [];
    const suggestions: string[] = [];

    if (this.excelData.length === 0) {
      return {
        isValid: false,
        warnings: ['没有数据可验证'],
        suggestions: ['请确保Excel文件包含数据']
      };
    }

    // 检查数据量
    if (this.excelData.length <= 1) {
      warnings.push('数据量较少，可能只有表头行');
    }

    // 检查空行
    let emptyRows = 0;
    for (let i = 1; i < this.excelData.length; i++) {
      const row = this.excelData[i] as ExcelRowData;
      const isEmpty = Object.values(row).every(value => 
        value === null || value === undefined || String(value).trim() === ''
      );
      
      if (isEmpty) {
        emptyRows++;
      }
    }

    if (emptyRows > 0) {
      warnings.push(`发现 ${emptyRows} 个空行`);
      suggestions.push('建议清理空行以提高数据处理效率');
    }

    // 检查任务名称列
    let emptyTaskNames = 0;
    for (let i = 1; i < this.excelData.length; i++) {
      const row = this.excelData[i] as ExcelRowData;
      const taskName = this.findColumnValue(row, ['任务名称', '任务', 'name', 'task', 'title']);
      
      if (!taskName || String(taskName).trim() === '') {
        emptyTaskNames++;
      }
    }

    if (emptyTaskNames > 0) {
      warnings.push(`发现 ${emptyTaskNames} 个空任务名称`);
      suggestions.push('建议确保所有任务都有名称');
    }

    return {
      isValid: warnings.length === 0,
      warnings,
      suggestions
    };
  }

  /**
   * 重置数据处理器状态
   */
  public reset(): void {
    this.excelData = [];
    this.headers = [];
    this.clearErrors();
    console.log('数据处理器已重置');
  }
}

// 创建全局数据处理实例
export const dataProcessor = new DataProcessor();
