/**
 * UI管理模块
 * 负责管理用户界面交互和状态更新
 */

import { configManager } from './config';
import { dataProcessor } from './dataProcessor';
import { apiClient } from './apiClient';
import { LogLevel } from '../shared/types';

// Define a type for log entries for better type safety
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
}

  /**
   * UI管理类
   */
export class UIManager {
  private currentSection: string = 'config-section';
  private selectedFile: File | null = null;
  private isSyncing: boolean = false;
  private excelHeaders: string[] = []; // To store Excel headers for mapping
  private currentFieldMapping: { [key: string]: string } = {}; // To store current field mapping

  constructor() {
    this.initializeEventListeners();
    this.initializeNavigation();
    this.loadInitialConfig();
    this.setupLogListener(); // Setup listener for log updates
    this.setupLogFilterEvents(); // Setup log filter events
    this.loadInitialTheme(); // Load and apply initial theme
    this.setupThemeToggle(); // Setup theme toggle button
    // Ensure the initial section is correctly displayed
    this.switchSection(this.currentSection);
  }

  private currentLogs: LogEntry[] = []; // Store logs in the renderer
  private currentTheme: 'light' | 'dark' = 'light'; // Track current theme

  /**
   * 加载初始主题
   */
  private loadInitialTheme(): void {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeToApply = savedTheme || (prefersDark ? 'dark' : 'light');
    this.setTheme(themeToApply);
  }

  /**
   * 设置主题
   * @param theme 'light' or 'dark'
   */
  private setTheme(theme: 'light' | 'dark'): void {
    const body = document.body;
    const themeToggleButton = document.getElementById('theme-toggle') as HTMLButtonElement;

    if (theme === 'dark') {
      body.classList.add('dark-theme');
      if (themeToggleButton) {
        themeToggleButton.textContent = '☀️'; // Sun icon for light mode
      }
    } else {
      body.classList.remove('dark-theme');
      if (themeToggleButton) {
        themeToggleButton.textContent = '🌙'; // Moon icon for dark mode
      }
    }
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
  }

  /**
   * 设置主题切换按钮事件
   */
  private setupThemeToggle(): void {
    const themeToggleButton = document.getElementById('theme-toggle') as HTMLButtonElement;
    if (themeToggleButton) {
      themeToggleButton.addEventListener('click', () => {
        const newTheme = this.currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
      });
    }
  }

  /**
   * 设置日志监听器
   */
  private setupLogListener(): void {
    window.electronAPI.log.onLogUpdate((updatedLogs: LogEntry[]) => {
      this.currentLogs = updatedLogs; // Store the logs
      this.renderLogs(updatedLogs);
    });
  }

  /**
   * 设置日志筛选事件
   */
  private setupLogFilterEvents(): void {
    const logLevelFilter = document.getElementById('logLevelFilter') as HTMLSelectElement;
    if (logLevelFilter) {
      logLevelFilter.addEventListener('change', () => {
        this.applyCurrentFilter();
      });
    }
  }

  /**
   * 应用当前日志筛选器并重新渲染
   * This method requires `this.currentLogs` to be populated.
   */
  private applyCurrentFilter(): void {
    if (this.currentLogs) {
      this.renderLogs(this.currentLogs);
    } else {
      // Fallback: if currentLogs is not set, try to fetch them.
      // This part is tricky without a direct 'getLogs' IPC call.
      // For now, we'll assume `currentLogs` is always populated by `setupLogListener`.
      console.warn('currentLogs not available for filtering.');
    }
  }

  /**
   * 渲染日志到UI
   * @param logsToRender 需要渲染的日志数组
   */
  private renderLogs(logsToRender: LogEntry[]): void {
    const logsContainer = document.getElementById('logsContainer');
    if (!logsContainer) {
      console.error('Logs container not found!');
      return;
    }

    // Clear existing logs
    logsContainer.innerHTML = '';

    if (logsToRender.length === 0) {
      logsContainer.innerHTML = '<p>暂无日志</p>';
      return;
    }

    // Get current filter, default to 'ALL'
    const currentFilter = (document.getElementById('logLevelFilter') as HTMLSelectElement)?.value || 'ALL';

    logsToRender.forEach(log => {
      if (currentFilter !== 'ALL' && log.level !== currentFilter) {
        return; // Skip logs that don't match the filter
      }

      const logElement = document.createElement('div');
      logElement.className = `log-entry log-level-${log.level.toLowerCase()}`;

      const timestampSpan = document.createElement('span');
      timestampSpan.className = 'log-timestamp';
      timestampSpan.textContent = log.timestamp;

      const levelSpan = document.createElement('span');
      levelSpan.className = `log-level-indicator ${log.level.toLowerCase()}`;
      levelSpan.textContent = log.level;

      const messageSpan = document.createElement('span');
      messageSpan.className = 'log-message';
      messageSpan.textContent = log.message;

      logElement.appendChild(timestampSpan);
      logElement.appendChild(levelSpan);
      logElement.appendChild(messageSpan);

      logsContainer.appendChild(logElement);
    });

    // Auto-scroll to the bottom
    logsContainer.scrollTop = logsContainer.scrollHeight;
  }

  /**
   * 初始化事件监听器
   */
  private initializeEventListeners(): void {
    // 配置表单相关事件
    this.setupConfigFormEvents();
    
    // 文件选择相关事件
    this.setupFileEvents();
    
    // Cookie管理相关事件
    this.setupCookieEvents();
    
    // 同步控制相关事件
    this.setupSyncEvents();
    
    // 模态框相关事件
    this.setupModalEvents();

    // 控制面板导航事件
    this.setupDashboardNavigation();
  }

  /**
   * 初始化导航
   */
  private initializeNavigation(): void {
    const navButtons = document.querySelectorAll('.nav-btn');
    
    navButtons.forEach(button => {
      button.addEventListener('click', () => {
        const targetSection = button.getAttribute('data-target');
        if (targetSection) {
          this.switchSection(targetSection);
        }
      });
    });
  }


  /**
   * 切换页面区域
   * @param sectionId 区域ID
   */
  private switchSection(sectionId: string): void {
    // 如果切换到同一个区域，不执行操作
    if (this.currentSection === sectionId) {
      return;
    }

    // 更新导航按钮状态
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
      const buttonElement = btn as HTMLElement;
      buttonElement.classList.remove('active');
      
      // 添加切换动画类
      if (buttonElement.getAttribute('data-target') === sectionId) {
        buttonElement.classList.add('switching');
        setTimeout(() => {
          buttonElement.classList.remove('switching');
        }, 300);
      }
    });
    
    const activeBtn = document.querySelector(`[data-target="${sectionId}"]`) as HTMLElement;
    if (activeBtn) {
      activeBtn.classList.add('active');
    }

    // 获取当前显示的区域和目标区域
    const currentSectionElement = document.getElementById(this.currentSection) as HTMLElement;
    const targetSection = document.getElementById(sectionId) as HTMLElement;

    if (currentSectionElement && targetSection) {
      // 添加切换动画
      currentSectionElement.classList.add('switching-out');
      
      setTimeout(() => {
        currentSectionElement.classList.remove('active', 'switching-out');
        
        // 显示目标区域
        targetSection.classList.add('active', 'switching-in');
        
        setTimeout(() => {
          targetSection.classList.remove('switching-in');
        }, 300);
      }, 150);
    } else {
      // 回退到简单切换（如果元素不存在）
      const sections = document.querySelectorAll('section');
      sections.forEach(section => {
        section.classList.remove('active');
      });

      if (targetSection) {
        targetSection.classList.add('active');
      }
    }

    this.currentSection = sectionId;
    
    // 添加切换日志
    const sectionNames: { [key: string]: string } = {
      'config-section': '配置设置',
      'control-section': '控制面板',
      'logs-section': '操作日志'
    };
    
    const sectionName = sectionNames[sectionId] || sectionId;
    this.addLog(`切换到${sectionName}标签页`, 'INFO');
  }

  /**
   * 设置配置表单事件
   */
  private setupConfigFormEvents(): void {
    const configForm = document.getElementById('configForm');
    const saveConfigBtn = document.getElementById('saveConfig');

    if (configForm) {
      // 表单字段变更事件
      const inputs = configForm.querySelectorAll('input, textarea, select');
      inputs.forEach(input => {
        input.addEventListener('change', () => this.updateConfigFromForm());
      });

      // 项目URL验证
      const projectUrlInput = document.getElementById('projectUrl') as HTMLInputElement;
      if (projectUrlInput) {
        projectUrlInput.addEventListener('blur', () => this.validateProjectUrl());
      }
    }

    if (saveConfigBtn) {
      saveConfigBtn.addEventListener('click', () => this.saveConfig());
    }
  }

  /**
   * 设置文件相关事件
   */
  private setupFileEvents(): void {
    const excelFileInput = document.getElementById('excelFile') as HTMLInputElement;
    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const previewTableBtn = document.getElementById('previewTableBtn') as HTMLButtonElement;
    const fieldMappingBtn = document.getElementById('fieldMappingBtn') as HTMLButtonElement;

    if (excelFileInput) {
      excelFileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    if (sheetNameSelect) {
      sheetNameSelect.addEventListener('change', () => this.handleSheetChange());
    }

    if (previewTableBtn) {
      previewTableBtn.addEventListener('click', () => this.showTablePreview());
    }

    if (fieldMappingBtn) {
      fieldMappingBtn.addEventListener('click', () => this.handleFieldMapping());
    }
  }

  /**
   * 设置Cookie相关事件
   */
  private setupCookieEvents(): void {
    const autoGetCookiesBtn = document.getElementById('autoGetCookies') as HTMLButtonElement;

    if (autoGetCookiesBtn) {
      autoGetCookiesBtn.addEventListener('click', () => this.autoGetCookies());
    }
  }

  /**
   * 设置同步相关事件
   */
  private setupSyncEvents(): void {
    const startSyncBtn = document.getElementById('startSync') as HTMLButtonElement;
    const stopSyncBtn = document.getElementById('stopSync') as HTMLButtonElement;
    const clearLogsBtn = document.getElementById('clearLogs') as HTMLButtonElement;

    if (startSyncBtn) {
      startSyncBtn.addEventListener('click', () => this.startSync());
    }

    if (stopSyncBtn) {
      stopSyncBtn.addEventListener('click', () => this.stopSync());
    }

    if (clearLogsBtn) {
      clearLogsBtn.addEventListener('click', () => this.clearLogs());
    }
  }

  /**
   * 设置模态框事件
   */
  private setupModalEvents(): void {
    // 预览表格模态框事件
    const previewModal = document.getElementById('previewModal') as HTMLElement;
    const previewCloseBtn = previewModal?.querySelector('.close') as HTMLElement;

    if (previewCloseBtn) {
      previewCloseBtn.addEventListener('click', () => this.closeModal('previewModal'));
    }
    window.addEventListener('click', (e) => {
      if (e.target === previewModal) {
        this.closeModal('previewModal');
      }
    });

    // 字段映射模态框事件
    const fieldMappingModal = document.getElementById('fieldMappingModal') as HTMLElement;
    const fieldMappingCloseBtn = fieldMappingModal?.querySelector('.close') as HTMLElement;
    const saveFieldMappingBtn = document.getElementById('saveFieldMapping') as HTMLButtonElement;
    const resetFieldMappingBtn = document.getElementById('resetFieldMapping') as HTMLButtonElement;

    if (fieldMappingCloseBtn) {
      fieldMappingCloseBtn.addEventListener('click', () => this.closeModal('fieldMappingModal'));
    }
    if (saveFieldMappingBtn) {
      saveFieldMappingBtn.addEventListener('click', () => this.saveFieldMapping());
    }
    if (resetFieldMappingBtn) {
      resetFieldMappingBtn.addEventListener('click', () => this.resetFieldMapping());
    }
    window.addEventListener('click', (e) => {
      if (e.target === fieldMappingModal) {
        this.closeModal('fieldMappingModal');
      }
    });
  }

  /**
   * 加载初始配置
   */
  private async loadInitialConfig(): Promise<void> {
    try {
      const config = await window.electronAPI.config.getConfig();
      configManager.updateConfig(config);
      this.updateFormFromConfig(config);
      
      this.addLog('配置加载完成', 'SUCCESS');
    } catch (error) {
      this.addLog(`配置加载失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    }
  }

  /**
   * 从表单更新配置
   */
  private updateConfigFromForm(): void {
    const formData = this.getFormData();
    configManager.updateFromForm(formData);
  }

  /**
   * 获取表单数据
   */
  private getFormData(): any {
    return {
      projectUrl: (document.getElementById('projectUrl') as HTMLInputElement)?.value || '',
      pdt: (document.getElementById('pdt') as HTMLInputElement)?.value || '',
      cookies: (document.getElementById('cookies') as HTMLTextAreaElement)?.value || '',
      sheetName: (document.getElementById('sheetName') as HTMLSelectElement)?.value || '',
      batchSize: parseInt((document.getElementById('batchSize') as HTMLInputElement)?.value || '20'),
      maxConcurrent: parseInt((document.getElementById('maxConcurrent') as HTMLInputElement)?.value || '5'),
      useAsync: (document.getElementById('useAsync') as HTMLInputElement)?.checked || true,
      excelFilePath: this.selectedFile?.path || ''
    };
  }

  /**
   * 从配置更新表单
   * @param config 配置数据
   */
  private async updateFormFromConfig(config: any): Promise<void> {
    const projectUrlInput = document.getElementById('projectUrl') as HTMLInputElement;
    const pdtInput = document.getElementById('pdt') as HTMLInputElement;
    const cookiesTextarea = document.getElementById('cookies') as HTMLTextAreaElement;
    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const batchSizeInput = document.getElementById('batchSize') as HTMLInputElement;
    const maxConcurrentInput = document.getElementById('maxConcurrent') as HTMLInputElement;
    const useAsyncCheckbox = document.getElementById('useAsync') as HTMLInputElement;

    if (projectUrlInput) projectUrlInput.value = config.projectUrl || '';
    if (pdtInput) pdtInput.value = config.pdt || '';
    if (cookiesTextarea) cookiesTextarea.value = config.cookies || '';
    if (batchSizeInput) batchSizeInput.value = config.batchSize?.toString() || '20';
    if (maxConcurrentInput) maxConcurrentInput.value = config.maxConcurrent?.toString() || '5';
    if (useAsyncCheckbox) useAsyncCheckbox.checked = config.useAsync !== false;

    // 处理Excel文件路径
    if (config.excelFilePath) {
      try {
        // 检查文件是否存在
        const fileExists = await window.electronAPI.file.checkFileExists(config.excelFilePath);
        if (fileExists) {
          // 存储文件路径信息，简化处理
          const fileName = config.excelFilePath.split('\\').pop() || config.excelFilePath.split('/').pop() || 'Unknown';
          
          // 创建一个简化的文件信息对象
          this.selectedFile = {
            name: fileName,
            path: config.excelFilePath,
            size: 0,
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            arrayBuffer: () => new ArrayBuffer(0),
            slice: () => new Blob(),
            stream: () => new ReadableStream(),
            text: () => Promise.resolve(''),
            lastModified: Date.now()
          } as unknown as File;

          // 获取工作表列表
          const result = await window.electronAPI.file.getExcelSheets(config.excelFilePath);
          if (result.success && result.sheets) {
            this.populateSheetSelect(result.sheets);
            
            // 设置之前保存的工作表名称
            if (config.sheetName && result.sheets.includes(config.sheetName)) {
              sheetNameSelect.value = config.sheetName;
            } else if (result.sheets.length > 0) {
              sheetNameSelect.value = result.sheets[0];
            }
            
            this.addLog(`已加载Excel文件: ${this.selectedFile.name}`, 'INFO');
          }
        } else {
          this.addLog(`配置中的Excel文件不存在: ${config.excelFilePath}`, 'WARN');
        }
      } catch (error) {
        this.addLog(`加载Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
      }
    }
  }

  /**
   * 验证项目URL
   */
  private validateProjectUrl(): void {
    const projectUrlInput = document.getElementById('projectUrl') as HTMLInputElement;
    const invalidFeedback = projectUrlInput?.parentElement?.querySelector('.invalid-feedback') as HTMLElement;

    if (projectUrlInput && invalidFeedback) {
      const url = projectUrlInput.value.trim();
      const isValid = /^https:\/\/(www\.)?teambition\.com\/project\/[a-f0-9]+/.test(url);

      if (url && !isValid) {
        projectUrlInput.classList.add('error');
        invalidFeedback.style.display = 'block';
      } else {
        projectUrlInput.classList.remove('error');
        invalidFeedback.style.display = 'none';
      }
    }
  }

  /**
   * 保存配置
   */
  private async saveConfig(): Promise<void> {
    try {
      const config = this.getFormData();
      
      // 验证配置
      const validation = await window.electronAPI.config.validateConfig();
      if (!validation.isValid) {
        this.showError('配置验证失败', validation.errors.join('\n'));
        return;
      }

      // 保存配置
      const result = await window.electronAPI.config.updateConfig(config);
      
      if (result.success) {
        this.showSuccess('配置保存成功');
        this.addLog('配置已保存', 'SUCCESS');
      } else {
        this.showError('配置保存失败', result.error || '未知错误');
      }
    } catch (error) {
      this.showError('配置保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 处理文件选择
   * @param event 文件选择事件
   */
  private async handleFileSelect(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.selectedFile = file;
    this.addLog(`已选择文件: ${file.name}`, 'INFO');

    try {
      // 获取工作表列表
      const result = await window.electronAPI.file.getExcelSheets(file.path);
      
      if (result.success && result.sheets) {
        this.populateSheetSelect(result.sheets);
        this.addLog(`获取到 ${result.sheets.length} 个工作表`, 'INFO');
      } else {
        this.showError('读取工作表失败', result.error || '未知错误');
      }
    } catch (error) {
      this.showError('文件处理失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 填充工作表选择框
   * @param sheets 工作表名称数组
   */
  private populateSheetSelect(sheets: string[]): void {
    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const previewTableBtn = document.getElementById('previewTableBtn') as HTMLButtonElement;
    const fieldMappingBtn = document.getElementById('fieldMappingBtn') as HTMLButtonElement;

    if (!sheetNameSelect) return;

    // 清空现有选项
    sheetNameSelect.innerHTML = '';

    // 添加工作表选项
    sheets.forEach((sheet, index) => {
      const option = document.createElement('option');
      option.value = sheet;
      option.textContent = sheet;
      sheetNameSelect.appendChild(option);
    });

    // 默认选中第一个工作表
    if (sheets.length > 0) {
      sheetNameSelect.value = sheets[0];
      // Trigger the change event to update config and log
      sheetNameSelect.dispatchEvent(new Event('change'));
    }

    // 启用控件
    sheetNameSelect.disabled = false;
    if (previewTableBtn) previewTableBtn.disabled = false;
    if (fieldMappingBtn) fieldMappingBtn.disabled = false;
  }

  /**
   * 处理工作表变更
   */
  private handleSheetChange(): void {
    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const selectedSheet = sheetNameSelect?.value;

    if (selectedSheet && this.selectedFile) {
      configManager.updateConfig({ sheetName: selectedSheet });
      this.addLog(`已选择工作表: ${selectedSheet}`, 'INFO');
    }
  }

  /**
   * 自动获取Cookies
   */
  private async autoGetCookies(): Promise<void> {
    const autoGetCookiesBtn = document.getElementById('autoGetCookies') as HTMLButtonElement;
    
    try {
      // 禁用按钮，防止重复点击
      if (autoGetCookiesBtn) {
        autoGetCookiesBtn.disabled = true;
        autoGetCookiesBtn.textContent = '正在检查Cookies...';
      }
      
      this.addLog('正在自动获取Cookies...', 'INFO');
      this.addLog('首先检查现有Cookies...', 'INFO');
      
      // 开始检查Cookie状态
      const statusCheckInterval = setInterval(async () => {
        const status = await window.electronAPI.cookies.getStatus();
        if (status.hasAuthWindow) {
      this.addLog('检测到需要登录，已打开登录窗口', 'INFO');
      this.addLog('请在登录窗口中完成登录，系统将自动等待并获取Cookies', 'INFO');
      this.addLog('注意：登录过程没有时间限制，请耐心完成登录', 'INFO');
          clearInterval(statusCheckInterval);
        }
      }, 1000);
      
      const result = await window.electronAPI.cookies.autoGetCookies();
      
      // 清除状态检查
      clearInterval(statusCheckInterval);
      
      // 恢复按钮状态
      if (autoGetCookiesBtn) {
        autoGetCookiesBtn.disabled = false;
        autoGetCookiesBtn.textContent = '自动获取Cookies';
      }
      
      if (result.success && result.cookies) {
        const cookiesTextarea = document.getElementById('cookies') as HTMLTextAreaElement;
        if (cookiesTextarea) {
          cookiesTextarea.value = result.cookies;
        }
        
        configManager.updateConfig({ cookies: result.cookies });
        this.addLog('Cookies获取成功', 'SUCCESS');
        this.showSuccess('Cookies获取成功');
      } else {
        this.addLog(`Cookies获取失败: ${result.error}`, 'ERROR');
        this.showError('Cookies获取失败', result.error || '获取Cookies失败，请重试');
      }
    } catch (error) {
      // 恢复按钮状态
      if (autoGetCookiesBtn) {
        autoGetCookiesBtn.disabled = false;
        autoGetCookiesBtn.textContent = '自动获取Cookies';
      }
      
      this.addLog(`Cookies获取异常: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
      this.showError('Cookies获取失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 显示表格预览
   */
  private async showTablePreview(): Promise<void> {
    if (!this.selectedFile) {
      this.showError('错误', '请先选择Excel文件');
      return;
    }

    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const selectedSheet = sheetNameSelect?.value;

    if (!selectedSheet) {
      this.showError('错误', '请先选择工作表');
      return;
    }

    try {
      this.addLog('正在读取表格数据...', 'INFO');
      
      // 读取Excel数据
      const result = await window.electronAPI.file.readExcelFile(this.selectedFile.path, selectedSheet);
      
      if (!result.success || !result.data) {
        this.showError('读取失败', result.error || '未知错误');
        return;
      }

      const data = result.data;
      if (data.length === 0) {
        this.showError('数据为空', 'Excel文件中没有数据');
        return;
      }

      // 显示模态框
      const modal = document.getElementById('previewModal') as HTMLElement;
      if (modal) {
        modal.style.display = 'block';
      }

      // 填充表格数据
      this.populatePreviewTable(data);
      
      this.addLog(`表格预览加载完成，共 ${data.length} 行数据`, 'SUCCESS');
    } catch (error) {
      this.showError('预览失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 填充预览表格
   * @param data 表格数据
   */
  private populatePreviewTable(data: any[]): void {
    const tableHead = document.getElementById('previewTableHead') as HTMLTableSectionElement;
    const tableBody = document.getElementById('previewTableBody') as HTMLTableSectionElement;

    if (!tableHead || !tableBody || data.length === 0) return;

    // 清空现有内容
    tableHead.innerHTML = '';
    tableBody.innerHTML = '';

    // 1. 确定实际的列数（找到最长的一行）
    let actualColumnCount = 0;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (Array.isArray(row) && row.length > actualColumnCount) {
        actualColumnCount = row.length;
      }
    }
    
    if (actualColumnCount === 0) {
      // 如果没有列数据（例如，所有行都是空的）
      const headerRow = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = '无数据';
      headerRow.appendChild(th);
      tableHead.appendChild(headerRow);
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.textContent = 'Excel表格中没有有效数据。';
      td.colSpan = 1;
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }

    // 2. 创建表头，确保所有列都有表头
    const sourceHeaders = data[0] || [];
    const displayHeaders: string[] = [];
    for (let i = 0; i < actualColumnCount; i++) {
      displayHeaders.push(String(sourceHeaders[i] || `列 ${i + 1}`));
    }
    
    const headerRow = document.createElement('tr');
    displayHeaders.forEach(headerText => {
      const th = document.createElement('th');
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    tableHead.appendChild(headerRow);

    // 3. 创建表格内容（限制显示行数）
    const maxRows = Math.min(50, data.length);
    for (let i = 1; i < maxRows; i++) { // 从第二行开始，跳过表头
      const sourceRow = data[i];
      const tr = document.createElement('tr');

      for (let colIndex = 0; colIndex < actualColumnCount; colIndex++) {
        const td = document.createElement('td');
        let cellContent = '';
        
        // 假设数据是数组的数组，这是 XLSX.utils.sheet_to_json(..., { header: 1 }) 的标准输出
        if (sourceRow && Array.isArray(sourceRow) && colIndex < sourceRow.length) {
          cellContent = sourceRow[colIndex];
        }
        
        // 确保单元格内容是字符串，处理 null 或 undefined
        td.textContent = cellContent ?? '';
        tr.appendChild(td);
      }
      
      tableBody.appendChild(tr);
    }

    // 4. 如果数据超过限制，添加提示行
    if (data.length > maxRows) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = actualColumnCount; // 使用实际列数
      td.textContent = `... 还有 ${data.length - maxRows} 行数据未显示`;
      td.style.textAlign = 'center';
      td.style.fontStyle = 'italic';
      td.style.color = '#666';
      tr.appendChild(td);
      tableBody.appendChild(tr);
    }
  }

  /**
   * 处理字段映射
   */
  private async handleFieldMapping(): Promise<void> {
    if (!this.selectedFile) {
      this.showError('错误', '请先选择Excel文件');
      return;
    }

    const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
    const selectedSheet = sheetNameSelect?.value;

    if (!selectedSheet) {
      this.showError('错误', '请先选择工作表');
      return;
    }

    // 显示确认对话框
    const userConfirmed = confirm('高级设置：请确保您知道您在做什么。此功能允许您自定义Teambition API同步字段与Excel数据列的映射。');
    
    if (!userConfirmed) {
      this.addLog('用户取消了高级字段映射设置', 'INFO');
      return;
    }

    try {
      this.addLog('正在加载字段映射设置...', 'INFO');
      
      // 读取Excel数据以获取表头
      const result = await window.electronAPI.file.readExcelFile(this.selectedFile.path, selectedSheet);
      
      if (!result.success || !result.data || result.data.length === 0) {
        this.showError('读取失败', result.error || 'Excel文件中没有数据');
        return;
      }

      // 获取表头
      this.excelHeaders = result.data[0].map((header: any) => String(header ?? ''));
      
      // 默认映射 (按顺序映射)
      const defaultMapping: { [key: string]: string } = {
        taskId: this.excelHeaders[0] || '',
        taskName: this.excelHeaders[1] || '',
        startDate: this.excelHeaders[2] || '',
        endDate: this.excelHeaders[3] || '',
        reminder: this.excelHeaders[4] || '',
        executor: this.excelHeaders[5] || '',
        participants: this.excelHeaders[6] || '',
        plannedHours: this.excelHeaders[7] || '',
      };
      
      // 加载当前映射或使用默认映射
      this.currentFieldMapping = { ...defaultMapping }; // TODO: 从配置加载已保存的映射

      // 填充映射下拉框
      this.populateFieldMappingSelects();

      // 显示模态框
      const modal = document.getElementById('fieldMappingModal') as HTMLElement;
      if (modal) {
        modal.style.display = 'block';
      }
      
      this.addLog('字段映射设置已加载', 'SUCCESS');

    } catch (error) {
      this.addLog(`加载字段映射设置失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
      this.showError('加载失败', error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 填充字段映射下拉框
   */
  private populateFieldMappingSelects(): void {
    const fields = ['taskId', 'taskName', 'startDate', 'endDate', 'reminder', 'executor', 'participants', 'plannedHours'];
    
    fields.forEach(field => {
      const selectElement = document.getElementById(`map-${field}`) as HTMLSelectElement;
      if (!selectElement) return;

      // 清空现有选项
      selectElement.innerHTML = '<option value="">--请选择列--</option>';

      // 添加Excel表头作为选项
      this.excelHeaders.forEach((header, index) => {
        const option = document.createElement('option');
        option.value = header;
        option.textContent = `${header} (列 ${index + 1})`;
        selectElement.appendChild(option);
      });

      // 设置当前值
      selectElement.value = this.currentFieldMapping[field] || '';
    });
  }

  /**
   * 保存字段映射
   */
  private saveFieldMapping(): void {
    const fields = ['taskId', 'taskName', 'startDate', 'endDate', 'reminder', 'executor', 'participants', 'plannedHours'];
    const newMapping: { [key: string]: string } = {};

    let hasChanges = false;
    fields.forEach(field => {
      const selectElement = document.getElementById(`map-${field}`) as HTMLSelectElement;
      if (selectElement) {
        newMapping[field] = selectElement.value;
        if (newMapping[field] !== this.currentFieldMapping[field]) {
          hasChanges = true;
        }
      }
    });

    if (!hasChanges) {
      this.showInfo('同步字段映射', '映射未发生更改。');
      return;
    }
    
    // TODO: 将 newMapping 保存到配置文件中
    this.currentFieldMapping = newMapping;
    
    this.addLog('字段映射已保存', 'SUCCESS');
    this.showSuccess('字段映射已保存');
    
    // 可以选择在这里关闭模态框
    this.closeModal('fieldMappingModal');
  }

  /**
   * 重置字段映射为默认
   */
  private resetFieldMapping(): void {
    const defaultMapping: { [key: string]: string } = {
        taskId: this.excelHeaders[0] || '',
        taskName: this.excelHeaders[1] || '',
        startDate: this.excelHeaders[2] || '',
        endDate: this.excelHeaders[3] || '',
        reminder: this.excelHeaders[4] || '',
        executor: this.excelHeaders[5] || '',
        participants: this.excelHeaders[6] || '',
        plannedHours: this.excelHeaders[7] || '',
    };

    this.currentFieldMapping = { ...defaultMapping };
    this.populateFieldMappingSelects(); // 重新填充下拉框以显示默认值

    this.addLog('字段映射已重置为默认', 'INFO');
    this.showInfo('同步字段映射', '已重置为默认映射。');
  }

  /**
   * 开始同步
   */
  private async startSync(): Promise<void> {
    if (this.isSyncing) {
      this.showError('错误', '同步正在进行中，请勿重复操作');
      return;
    }

    try {
      // 验证配置
      const validation = await window.electronAPI.config.validateConfig();
      if (!validation.isValid) {
        this.showError('配置验证失败', validation.errors.join('\n'));
        return;
      }

      if (!this.selectedFile) {
        this.showError('错误', '请先选择Excel文件');
        return;
      }

      const sheetNameSelect = document.getElementById('sheetName') as HTMLSelectElement;
      const selectedSheet = sheetNameSelect?.value;

      if (!selectedSheet) {
        this.showError('错误', '请先选择工作表');
        return;
      }

      this.isSyncing = true;
      this.updateSyncButtons();
      this.addLog('开始同步任务...', 'INFO');

      // 读取和处理Excel数据
      await dataProcessor.readExcel(this.selectedFile, selectedSheet);
      
      if (!dataProcessor.validateColumns()) {
        this.showError('数据验证失败', 'Excel文件格式不正确');
        this.stopSync();
        return;
      }

      const tasks = dataProcessor.processToTasks();
      if (tasks.length === 0) {
        // Check if dataProcessor has specific errors about why it's empty
        const processorErrors = dataProcessor.getErrors();
        const errorMessage = processorErrors.length > 0 
          ? `没有有效的任务数据。原因: ${processorErrors.join('; ')}`
          : '没有有效的任务数据，请检查Excel文件内容（如任务名称列）和格式。';
        this.showError('数据处理失败', errorMessage);
        this.stopSync(); // Call stopSync to reset UI and log "同步已停止"
        return;
      }

      this.addLog(`处理完成，共 ${tasks.length} 个任务待同步`, 'INFO');

      // 初始化API客户端
      const apiInitResult = await apiClient.initialize();
      if (!apiInitResult.success) {
        this.showError('API初始化失败', apiInitResult.error || '未知错误');
        this.stopSync();
        return;
      }

      // 执行同步
      const syncResult = await window.electronAPI.sync.startSync(tasks);
      
      if (syncResult.success) {
        this.addLog('同步任务已提交', 'SUCCESS');
      } else {
        this.addLog(`同步提交失败: ${syncResult.error}`, 'ERROR');
      }

    } catch (error) {
      this.addLog(`同步异常: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
      this.showError('同步失败', error instanceof Error ? error.message : '未知错误');
    } finally {
      this.stopSync();
    }
  }

  /**
   * 停止同步
   */
  private async stopSync(): Promise<void> {
    try {
      await window.electronAPI.sync.stopSync();
      this.isSyncing = false;
      this.updateSyncButtons();
      this.addLog('同步已停止', 'WARN');
    } catch (error) {
      this.addLog(`停止同步失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    }
  }

  /**
   * 更新同步按钮状态
   */
  private updateSyncButtons(): void {
    const startSyncBtn = document.getElementById('startSync') as HTMLButtonElement;
    const stopSyncBtn = document.getElementById('stopSync') as HTMLButtonElement;

    if (startSyncBtn) {
      startSyncBtn.disabled = this.isSyncing;
    }

    if (stopSyncBtn) {
      stopSyncBtn.disabled = !this.isSyncing;
    }
  }

  /**
   * 设置控制面板导航
   */
  private setupDashboardNavigation(): void {
    const totalCountElement = document.getElementById('totalCount');
    const successCountElement = document.getElementById('successCount');
    const failedCountElement = document.getElementById('failedCount');
    const skippedCountElement = document.getElementById('skippedCount');

    if (totalCountElement) {
      totalCountElement.style.cursor = 'pointer';
      totalCountElement.addEventListener('click', () => {
        this.switchSection('logs-section');
        this.setLogFilter('ALL');
      });
    }

    if (successCountElement) {
      successCountElement.style.cursor = 'pointer';
      successCountElement.addEventListener('click', () => {
        this.switchSection('logs-section');
        this.setLogFilter('SUCCESS');
      });
    }

    if (failedCountElement) {
      failedCountElement.style.cursor = 'pointer';
      failedCountElement.addEventListener('click', () => {
        this.switchSection('logs-section');
        this.setLogFilter('ERROR');
      });
    }

    if (skippedCountElement) {
      skippedCountElement.style.cursor = 'pointer';
      skippedCountElement.addEventListener('click', () => {
        this.switchSection('logs-section');
        this.setLogFilter('WARN'); // Assuming 'Skipped' maps to 'WARN' level
      });
    }
  }

  /**
   * 设置日志筛选器并应用
   * @param level 日志级别
   */
  private setLogFilter(level: 'ALL' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'): void {
    const logLevelFilter = document.getElementById('logLevelFilter') as HTMLSelectElement;
    if (logLevelFilter) {
      logLevelFilter.value = level;
      this.applyCurrentFilter(); // Re-render logs with the new filter
    }
  }

  /**
   * 清空日志
   */
  private clearLogs(): void {
    window.electronAPI.log.clearLogs();
    this.addLog('日志已清空', 'INFO');
  }

  /**
   * 关闭模态框
   * @param modalId 要关闭的模态框ID
   */
  private closeModal(modalId: string = 'previewModal'): void {
    const modal = document.getElementById(modalId) as HTMLElement;
    if (modal) {
      modal.style.display = 'none';
    }
  }

  /**
   * 添加日志
   * @param message 日志消息
   * @param level 日志级别
   */
  private addLog(message: string, level: LogLevel = 'INFO'): void {
    window.electronAPI.log.addLog(message, level);
  }

  /**
   * 显示成功消息
   * @param message 消息内容
   */
  private showSuccess(message: string): void {
    this.showNotification('成功', message, 'success');
  }

  /**
   * 显示错误消息
   * @param title 标题
   * @param message 消息内容
   */
  private showError(title: string, message: string): void {
    this.showNotification(title, message, 'error');
  }

  /**
   * 显示信息消息
   * @param title 标题
   * @param message 消息内容
   */
  private showInfo(title: string, message: string): void {
    this.showNotification(title, message, 'info');
  }

  /**
   * 显示通知
   * @param title 标题
   * @param message 消息内容
   * @param type 通知类型
   */
  private showNotification(title: string, message: string, type: 'success' | 'error' | 'info'): void {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-header">
        <strong>${title}</strong>
        <span class="notification-close">&times;</span>
      </div>
      <div class="notification-body">${message}</div>
    `;

    // 添加到页面
    document.body.appendChild(notification);

    // 添加关闭事件
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        notification.remove();
      });
    }

    // 自动移除
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 5000);
  }
}

// 创建全局UI管理实例
export const uiManager = new UIManager();
