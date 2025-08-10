/**
 * 数据处理模块
 * 负责Excel数据的读取、验证和转换为任务格式
 */

import { ExcelRowData } from '../shared/types'; // TeambitionTask interface will no longer be directly used for the output
import { configManager } from './config';

// 定义列名映射
const COLUMN_NAMES = {
    'task_number': '任务编号',
    'task_title': '任务名称',
    'start_date': '开始日期',
    'end_date': '截止日期',
    'reminder_rule': '提醒时间', // Assuming '提醒时间' maps to 'reminder_rule_api'
    'executor': '执行者',
    'involvers': '参与者',
    'plan_time': '计划工时'
} as const;

// 定义期望的表头列表，用于验证
const EXPECTED_HEADERS = Object.values(COLUMN_NAMES);

/**
 * 数据处理类
 */
export class DataProcessor {
  private excelData: any[] = [];
  private headers: string[] = [];
  private headerRowIndex: number = -1; // 存储检测到的表头行索引 (0 或 1)
  private columnIndices: Map<keyof typeof COLUMN_NAMES, number> = new Map(); // 存储列名映射到的索引
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
      
      // 检测表头行 (第1行或第2行)
      this.detectHeaderRow();
      if (this.headerRowIndex === -1) {
        this.addError('无法在Excel文件的第1行或第2行找到有效的表头。');
        return;
      }

      // 提取表头，并确保所有表头都是字符串
      this.headers = (this.excelData[this.headerRowIndex] as any[]).map(h => String(h || ''));

      // 构建列名到索引的映射
      this.buildColumnIndexMap();
      
      console.log(`成功读取Excel数据: ${this.excelData.length} 行, ${this.headers.length} 列。表头位于第 ${this.headerRowIndex + 1} 行。`);
      
    } catch (error) {
      this.addError(`读取Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
      throw error;
    }
  }

  /**
   * 检测表头行是第1行还是第2行
   */
  private detectHeaderRow(): void {
    if (this.excelData.length < 2) {
      this.headerRowIndex = -1;
      return;
    }

    const firstRowHeaders = (this.excelData[0] as any[]).map(h => String(h || ''));
    const secondRowHeaders = (this.excelData[1] as any[]).map(h => String(h || ''));

    let firstRowMatchCount = 0;
    let secondRowMatchCount = 0;

    EXPECTED_HEADERS.forEach(expectedHeader => {
      if (firstRowHeaders.some(h => h.includes(expectedHeader))) {
        firstRowMatchCount++;
      }
      if (secondRowHeaders.some(h => h.includes(expectedHeader))) {
        secondRowMatchCount++;
      }
    });

    // 如果匹配到的表头数量大于0，则认为该行是表头行
    // 优先选择匹配数量更多的行
    if (firstRowMatchCount > 0 || secondRowMatchCount > 0) {
      this.headerRowIndex = (firstRowMatchCount >= secondRowMatchCount) ? 0 : 1;
    } else {
      this.headerRowIndex = -1; // 未找到匹配的表头行
    }
  }

  /**
   * 根据检测到的表头构建列名到索引的映射
   */
  private buildColumnIndexMap(): void {
    this.columnIndices.clear();
    if (this.headerRowIndex === -1 || !this.headers || this.headers.length === 0) {
      return;
    }

    (Object.keys(COLUMN_NAMES) as Array<keyof typeof COLUMN_NAMES>).forEach(key => {
      const chineseHeader = COLUMN_NAMES[key];
      const index = this.headers.findIndex(h => h.includes(chineseHeader));
      if (index !== -1) {
        this.columnIndices.set(key, index);
      } else {
        this.addError(`未找到列 "${chineseHeader}" (${key}) 的表头。`);
      }
    });
  }

  /**
   * 验证Excel数据列
   */
  public validateColumns(): boolean {
    this.clearErrors();
    
    if (this.headerRowIndex === -1) {
      this.addError('未能检测到表头行，请确保表头位于第1行或第2行。');
      return false;
    }

    if (this.headers.length === 0) {
      this.addError('Excel文件中没有表头数据');
      return false;
    }

    let allRequiredHeadersFound = true;
    const missingHeaders: string[] = [];

    // 检查所有必需的表头是否存在
    (Object.keys(COLUMN_NAMES) as Array<keyof typeof COLUMN_NAMES>).forEach(key => {
      const chineseHeader = COLUMN_NAMES[key];
      if (!this.columnIndices.has(key)) {
        allRequiredHeadersFound = false;
        missingHeaders.push(chineseHeader);
      }
    });

    if (!allRequiredHeadersFound) {
      this.addError(`Excel文件中缺少必要的表头列: "${missingHeaders.join(', ')}"。请确保表头行包含所有必需的列。`);
      return false;
    }
    
    console.log('列验证通过，表头信息:', this.headers);
    console.log('列索引映射:', Object.fromEntries(this.columnIndices));
    return true;
  }

  /**
   * 将Excel数据转换为任务数组
   * Output format matches the expectations of SyncEngineV2 in main.ts
   */
  public processToTasks(): any[] {
    this.clearErrors();
    
    if (this.headerRowIndex === -1) {
      this.addError('未能检测到表头行，无法处理数据。');
      return [];
    }

    const dataStartIndex = this.headerRowIndex + 1;
    if (this.excelData.length <= dataStartIndex) {
      this.addError(`Excel文件中没有有效的数据行。请确保表头行之后有数据行。`);
      return [];
    }

    const tasks: any[] = [];
    
    // 从表头行的下一行开始处理所有数据行
    for (let i = dataStartIndex; i < this.excelData.length; i++) {
      const row = this.excelData[i] as ExcelRowData;
      
      try {
        // 行号需要反映其在Excel中的实际位置，所以是 i + 1
        const task = this.convertRowToTask(row, i + 1);
        if (task) {
          tasks.push(task);
        }
      } catch (error) {
        this.addError(`第 ${i + 1} 行数据处理失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    console.log(`成功转换 ${tasks.length} 个任务`);
    if (tasks.length > 0) {
      console.log('成功转换的任务数据结构:', JSON.stringify(tasks, null, 2));
    }
    return tasks;
  }

  /**
   * 将单行数据转换为任务对象
   * Output format matches the expectations of SyncEngineV2 in main.ts
   * @param row 行数据
   * @param rowIndex 行号（用于错误提示）
   */
  private convertRowToTask(row: ExcelRowData, rowIndex: number): any | null {
    const rowArray = Object.values(row);
    const task: any = {
      rowIndex: rowIndex // 用于更好的错误报告
    };

    // 辅助函数：根据列名键获取值
    const getValue = (key: keyof typeof COLUMN_NAMES): any => {
      const index = this.columnIndices.get(key);
      return index !== undefined ? rowArray[index] : undefined;
    };

    // 任务名称 (必需)
    const taskName = getValue('task_title');
    if (!taskName || String(taskName).trim() === '') {
      console.log(`第 ${rowIndex} 行: 跳过空任务 (缺少任务名称)`);
      return null;
    }
    task.task_title = String(taskName).trim();

    // 任务编号 (可选)
    const taskNumber = getValue('task_number');
    if (taskNumber && String(taskNumber).trim() !== '') {
      task.task_number = String(taskNumber).trim();
    }

    // 执行者
    const executor = getValue('executor');
    if (executor && String(executor).trim() !== '') {
      task.executor = String(executor).trim();
    }

    // 开始时间
    const startDate = getValue('start_date');
    if (startDate && String(startDate).trim() !== '') {
      const parsedDate = this.parseDate(String(startDate));
      if (parsedDate) {
        task.start_date = parsedDate;
      } else {
        this.addError(`第 ${rowIndex} 行: 开始时间格式无效 "${startDate}"，请使用YYYY-MM-DD格式`);
      }
    }

    // 截止时间
    const endDate = getValue('end_date');
    if (endDate && String(endDate).trim() !== '') {
      const parsedDate = this.parseDate(String(endDate));
      if (parsedDate) {
        task.end_date = parsedDate; // main.ts expects 'end_date'
      } else {
        this.addError(`第 ${rowIndex} 行: 截止时间格式无效 "${endDate}"，请使用YYYY-MM-DD格式`);
      }
    }
    
    // 提醒规则
    const reminderRule = getValue('reminder_rule');
    if (reminderRule && String(reminderRule).trim() !== '') {
      task.reminder_rule_api = String(reminderRule).trim(); // main.ts expects 'reminder_rule_api'
    }

    // 参与人
    const involvers = getValue('involvers');
    if (involvers && String(involvers).trim() !== '') {
      task.involvers = String(involvers).trim();
    }
    
    // 计划工时
    const planTime = getValue('plan_time');
    if (planTime && String(planTime).trim() !== '') {
      const parsedPlanTime = parseFloat(String(planTime));
      if (!isNaN(parsedPlanTime) && isFinite(parsedPlanTime)) {
        task.plan_time = parsedPlanTime; // main.ts expects 'plan_time'
      } else {
        this.addError(`第 ${rowIndex} 行: 计划工时格式无效 "${planTime}"，应为数字（小时）`);
      }
    }

    // 尝试从最后一列获取描述，如果它不是已定义的列之一
    // 这是一个备选方案，因为描述没有在COLUMN_NAMES中定义
    const lastColIndex = rowArray.length - 1;
    let isLastColumnAMappedColumn = false;
    for (const index of this.columnIndices.values()) {
        if (index === lastColIndex) {
            isLastColumnAMappedColumn = true;
            break;
        }
    }
    if (!isLastColumnAMappedColumn && rowArray[lastColIndex] && String(rowArray[lastColIndex]).trim() !== '') {
        task.description = String(rowArray[lastColIndex]).trim();
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
   * 获取表头信息
   */
  public getHeaders(): string[] {
    return [...this.headers];
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
