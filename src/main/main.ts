/**
 * Electron主进程入口文件
 * 负责创建窗口、管理应用生命周期和处理IPC通信
 */

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import { configManager } from './config';
import { cookieManager } from './cookieManager';
import { createLogEntry, formatTimestamp, extractProjectId } from '../shared/utils';
import * as XLSX from 'xlsx';
import * as https from 'https';

// Ensure cookieManager is instantiated to register its IPC handlers
console.log('CookieManager initialized:', cookieManager);

// 日志存储
let logs: Array<{ timestamp: string; level: string; message: string }> = [];

/**
 * 主窗口类
 */
class MainWindow {
  private window: BrowserWindow | null = null;

  /**
   * 创建主窗口
   */
  public createWindow(): void {
    // Determine the icon path based on the environment and platform
    let iconFileName: string;
    if (process.platform === 'win32') {
      iconFileName = 'icon.ico';
    } else if (process.platform === 'darwin') {
      iconFileName = 'icon.icns';
    } else {
      iconFileName = 'icon.png'; // Fallback for Linux and other platforms
    }

    const iconPath = process.env.NODE_ENV === 'development'
      ? path.join(process.cwd(), 'src/renderer/public', iconFileName) // Absolute path for dev
      : path.join(__dirname, '../../renderer/public', iconFileName); // Path for production

    this.window = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      title: 'WBS2TB - Excel到Teambition同步工具',
      icon: iconPath, // Electron automatically selects the correct extension (.ico, .icns, etc.)
      autoHideMenuBar: true, // Hide menu bar by default, show with Alt key
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        sandbox: true
      },
      show: false // 先不显示，等页面加载完成后再显示
    });

    // 开发环境下加载开发服务器，生产环境加载打包文件
    if (process.env.NODE_ENV === 'development') {
      this.window.loadURL('http://localhost:3000');
      this.window.webContents.openDevTools();
    } else {
      this.window.loadFile(path.join(__dirname, '../../../dist/renderer/index.html'));
    }

    // 页面加载完成后显示窗口
    this.window.once('ready-to-show', () => {
      this.window?.show();
      addLog('应用启动完成', 'SUCCESS');
    });

    // 窗口关闭事件
    this.window.on('closed', () => {
      this.window = null;
    });

    // 设置菜单
    this.setMenu();
  }

  /**
   * 设置应用菜单
   */
  private setMenu(): void {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '文件',
        submenu: [
          {
            label: '选择Excel文件',
            accelerator: 'CmdOrCtrl+O',
            click: () => this.selectExcelFile()
          },
          { type: 'separator' },
          {
            label: '退出',
            accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
            click: () => app.quit()
          }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { role: 'undo', label: '撤销' },
          { role: 'redo', label: '重做' },
          { type: 'separator' },
          { role: 'cut', label: '剪切' },
          { role: 'copy', label: '复制' },
          { role: 'paste', label: '粘贴' }
        ]
      },
      {
        label: '视图',
        submenu: [
          { role: 'reload', label: '重新加载' },
          { role: 'forceReload', label: '强制重新加载' },
          { role: 'toggleDevTools', label: '开发者工具' },
          { type: 'separator' },
          { role: 'resetZoom', label: '重置缩放' },
          { role: 'zoomIn', label: '放大' },
          { role: 'zoomOut', label: '缩小' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: '全屏' }
        ]
      },
      {
        label: '帮助',
        submenu: [
          {
            label: '关于',
            click: () => this.showAbout()
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  }

  /**
   * 选择Excel文件
   */
  private async selectExcelFile(): Promise<void> {
    if (!this.window) return;

    const result = await dialog.showOpenDialog(this.window, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel文件', extensions: ['xlsx', 'xls'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePaths.length > 0) {
      this.window.webContents.send('excel-file-selected', result.filePaths[0]);
    }
  }

  /**
   * 显示关于对话框
   */
  private showAbout(): void {
    if (!this.window) return;

    dialog.showMessageBox(this.window, {
      type: 'info',
      title: '关于 WBS2TB',
      message: 'WBS2TB - Excel到Teambition同步工具',
      detail: `版本: ${app.getVersion()}\n基于 Electron + TypeScript 构建\n\n一个简洁高效的Excel WBS数据同步到Teambition的工具。`,
      buttons: ['确定']
    });
  }

  /**
   * 获取窗口实例
   */
  public getWindow(): BrowserWindow | null {
    return this.window;
  }
}

// 创建主窗口实例
const mainWindow = new MainWindow();

/**
 * 应用就绪事件
 */
app.whenReady().then(() => {
  mainWindow.createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow.createWindow();
    }
  });
});

/**
 * 所有窗口关闭事件
 */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

/**
 * 添加日志
 */
function addLog(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO'): void {
  const logEntry = createLogEntry(message, level);
  logs.push(logEntry);
  
  // 限制日志数量，避免内存溢出
  if (logs.length > 1000) {
    logs = logs.slice(-500);
  }
  
  console.log(`[${level}] ${message}`);
  
  // 通知所有窗口日志更新
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('log-update', logs);
  });
}

// ============ IPC处理器设置 ============

/**
 * 配置管理相关IPC
 */
ipcMain.handle('get-config', () => {
  return configManager.getConfig();
});

ipcMain.handle('update-config', (_, config: Partial<any>) => {
  console.log('Main: Received config for update:', config); // LOG: Data received in main
  try {
    configManager.updateConfig(config);
    addLog('配置已更新', 'SUCCESS');
    return { success: true };
  } catch (error) {
    addLog(`配置更新失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle('validate-config', () => {
  const currentConfig = configManager.getConfig(); // LOG: Get current config before validation
  console.log('Main: Config state at validation:', currentConfig);
  return configManager.validateConfig();
});

ipcMain.handle('reset-config', () => {
  try {
    configManager.resetConfig();
    addLog('配置已重置', 'SUCCESS');
    return { success: true };
  } catch (error) {
    addLog(`配置重置失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

/**
 * 文件操作相关IPC
 */
ipcMain.handle('select-excel-file', async () => {
  const window = mainWindow.getWindow();
  if (!window) {
    return { success: false, error: '窗口不存在' };
  }

  try {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [
        { name: 'Excel文件', extensions: ['xlsx', 'xls'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (result.canceled) {
      return { success: false, error: '用户取消了选择' };
    }

    const filePath = result.filePaths[0];
    addLog(`已选择Excel文件: ${path.basename(filePath)}`, 'INFO');
    return { success: true, filePath };
  } catch (error) {
    addLog(`选择文件失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle('get-excel-sheets', async (_, filePath: string) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheets = workbook.SheetNames;
    addLog(`获取到 ${sheets.length} 个工作表`, 'INFO');
    return { success: true, sheets };
  } catch (error) {
    addLog(`读取工作表失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle('read-excel-file', async (_, filePath: string, sheetName: string) => {
  try {
    const workbook = XLSX.readFile(filePath);
    const worksheet = workbook.Sheets[sheetName];
    
    if (!worksheet) {
      return { success: false, error: `工作表 "${sheetName}" 不存在` };
    }

    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    addLog(`成功读取工作表 "${sheetName}"，共 ${data.length} 行数据`, 'INFO');
    return { success: true, data };
  } catch (error) {
    addLog(`读取Excel文件失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

ipcMain.handle('check-file-exists', async (_, filePath: string) => {
  try {
    const fs = await import('fs');
    return fs.existsSync(filePath);
  } catch (error) {
    addLog(`检查文件存在失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return false;
  }
});

/**
 * API代理相关IPC
 */
ipcMain.handle('proxy-api-request', async (_, url: string, options: any = {}) => {
  try {
    const { method = 'GET', headers = {}, body } = options;
    
    // 验证URL
    if (!url.startsWith('https://www.teambition.com/') && 
        !url.startsWith('https://apps.teambition.com/')) {
      return { success: false, error: '无效的URL - 只允许访问Teambition域名' };
    }

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'User-Agent': 'WBS2TB/1.0.0',
        ...headers
      }
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      fetchOptions.body = body;
    }

    const response = await fetch(url, fetchOptions);
    const contentType = response.headers.get('content-type');
    
    let data;
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      success: response.ok,
      data,
      code: response.status,
      error: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    addLog(`API请求失败: ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
    return { success: false, error: error instanceof Error ? error.message : '未知错误' };
  }
});

/**
 * 应用信息相关IPC
 */
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', () => app.getAppPath());
ipcMain.handle('get-user-data-path', () => app.getPath('userData'));

/**
 * 窗口操作相关IPC
 */
ipcMain.on('window-minimize', () => {
  mainWindow.getWindow()?.minimize();
});

ipcMain.on('window-maximize', () => {
  const window = mainWindow.getWindow();
  if (window) {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  app.quit();
});

/**
 * 日志相关IPC
 */
ipcMain.on('add-log', (_, message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS') => {
  addLog(message, level);
});

ipcMain.on('clear-logs', () => {
  logs = [];
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send('log-update', logs);
  });
  addLog('日志已清空', 'INFO');
});

// --- Rate Limiter and API Client based on v1.0.0 logic ---

class RateLimiter {
    private maxRequests: number;
    private timeWindow: number;
    private requests: number[];

    constructor(maxRequests = 5, timeWindow = 1000) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }

    async acquire(): Promise<void> {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);

        if (this.requests.length >= this.maxRequests) {
            const oldest = this.requests[0];
            const waitTime = this.timeWindow - (now - oldest);
            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.acquire();
            }
        }
        this.requests.push(now);
    }
}

class TeambitionAPIClient {
    private cookies: string;
    private rateLimiter: RateLimiter;
    private baseUrl: string;
    private cache: Map<string, any>;

    constructor(cookies: string) {
        this.cookies = cookies;
        this.rateLimiter = new RateLimiter(5, 1000);
        this.baseUrl = 'https://www.teambition.com';
        this.cache = new Map();
    }

    private getHeaders(): Record<string, string> {
        return {
            'Host': 'www.teambition.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Cookie': this.cookies,
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Connection': 'keep-alive',
            'Content-Type': 'application/json;charset=UTF-8',
            'Referer': 'https://www.teambition.com/',
        };
    }

    private async request(method: string, url: string, options: { body?: string; headers?: Record<string, string> } = {}): Promise<any> {
        const maxRetries = 3;
        let retries = 0;
        let lastError: any;

        while (retries < maxRetries) {
            try {
                await this.rateLimiter.acquire();
                const timestamp = Date.now();
                const separator = url.includes('?') ? '&' : '?';
                const urlWithTimestamp = `${url}${separator}_=${timestamp}`;

                const requestOptions: https.RequestOptions = {
                    hostname: new URL(url).hostname,
                    port: 443,
                    path: new URL(urlWithTimestamp).pathname + new URL(urlWithTimestamp).search,
                    method: method,
                    headers: { ...this.getHeaders(), ...options.headers }
                };

                return new Promise((resolve, reject) => {
                    const req = https.request(requestOptions, (res) => {
                        let responseBody = '';
                        res.on('data', (chunk) => responseBody += chunk);
                        res.on('end', () => {
                            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                                try {
                                    resolve({ success: true, data: JSON.parse(responseBody), code: res.statusCode });
                                } catch (e) {
                                    resolve({ success: false, error: `Failed to parse JSON: ${responseBody}`, code: res.statusCode });
                                }
                            } else {
                                let errorData = responseBody;
                                try { errorData = JSON.parse(responseBody).message || responseBody; } catch (e) {}
                                resolve({ success: false, error: `HTTP ${res.statusCode}: ${errorData}`, code: res.statusCode });
                            }
                        });
                    });
                    req.on('error', reject);
                    if (options.body) req.write(options.body);
                    req.end();
                });
            } catch (error) {
                lastError = error;
                retries++;
                if (retries < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retries) * 1000));
                }
            }
        }
        throw new Error(`Request failed after ${maxRetries} retries: ${lastError.message}`);
    }

    async getOrganizationId(projectId: string): Promise<string> {
        const url = `${this.baseUrl}/api/projects/limits`;
        const params = new URLSearchParams({ projectId: projectId }).toString();
        const response = await this.request('GET', `${url}?${params}`);
        if (!response.success) throw new Error(response.error);
        return response.data.organizationId;
    }

    async getTasklistId(projectId: string): Promise<string> {
        const url = `${this.baseUrl}/api/tasklists`;
        const params = new URLSearchParams({ _projectId: projectId }).toString();
        const response = await this.request('GET', `${url}?${params}`);
        if (!response.success || !Array.isArray(response.data) || response.data.length === 0) {
            throw new Error('无法获取任务列表ID');
        }
        return response.data[0]._id;
    }
    
    async getSmartgroupTasklistId(projectId: string): Promise<string> {
        const url = `${this.baseUrl}/api/projects/${projectId}/global-smartgroup`;
        const response = await this.request('GET', url);
        if (!response.success || !response.data.result) throw new Error('无法获取智能分组任务列表ID');
        return response.data.result._id;
    }

    async getAllMembers(projectId: string): Promise<Record<string, string>> {
        const cacheKey = `all_members_${projectId}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);

        const tbMembers = await this.getTbMembers(projectId);
        const ddMembers = await this.getDdMembers(projectId);
        const allMembers = { ...tbMembers, ...ddMembers };
        
        this.cache.set(cacheKey, allMembers);
        return allMembers;
    }

    private async getTbMembers(projectId: string): Promise<Record<string, string>> {
        const cacheKey = `tb_members_${projectId}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        
        const url = `${this.baseUrl}/api/v3/project/${projectId}/members`;
        const params = new URLSearchParams({ projectId: projectId }).toString();
        const response = await this.request('GET', `${url}?${params}`);
        if (!response.success) throw new Error(response.error);
        
        const members: Record<string, string> = {};
        if (response.data.result && Array.isArray(response.data.result)) {
            response.data.result.forEach((member: any) => { members[member.userId] = member.name; });
        }
        this.cache.set(cacheKey, members);
        return members;
    }

    private async getDdMembers(projectId: string): Promise<Record<string, string>> {
        const cacheKey = `dd_members_${projectId}`;
        if (this.cache.has(cacheKey)) return this.cache.get(cacheKey);
        
        try {
            const linkCrewUrl = `${this.baseUrl}/api/project/${projectId}/link-crew`;
            const linkCrewResponse = await this.request('GET', linkCrewUrl);
            if (!linkCrewResponse.success || !linkCrewResponse.data.result || !Array.isArray(linkCrewResponse.data.result) || linkCrewResponse.data.result.length === 0) {
                return {};
            }
            const boundId = linkCrewResponse.data.result[0].boundId;

            const membersUrl = `${this.baseUrl}/api/project/${projectId}/link-crew/members`;
            const membersParams = new URLSearchParams({ projectId: projectId, boundId: boundId }).toString();
            const membersResponse = await this.request('GET', `${membersUrl}?${membersParams}`);
            if (!membersResponse.success) throw new Error(membersResponse.error);

            const members: Record<string, string> = {};
            if (membersResponse.data.result && Array.isArray(membersResponse.data.result)) {
                membersResponse.data.result.forEach((member: any) => { members[member.userId] = member.name; });
            }
            this.cache.set(cacheKey, members);
            return members;
        } catch (error) {
            console.error('获取钉钉成员失败:', error);
            return {};
        }
    }

    async getAllTasks(projectId: string): Promise<Record<string, string>> {
        const tasklistId = await this.getTasklistId(projectId);
        const smartgroupTasklistId = await this.getSmartgroupTasklistId(projectId);
        if (!tasklistId || !smartgroupTasklistId) throw new Error('无法获取任务列表ID');

        const url = `${this.baseUrl}/api/v2/projects/${projectId}/tasks`;
        const filterStr = `_tasklistId%3D${tasklistId}%20AND%20taskLayer%20IN%20%280%29%20ORDER%20BY%20viewPos%3Asmartgroup-tasklist-${smartgroupTasklistId}%20ASC`;
        const params = new URLSearchParams({ filter: filterStr, pageSize: '300' }).toString();
        
        const response = await this.request('GET', `${url}?${params}`);
        if (!response.success) throw new Error(response.error);

        const tasks: Record<string, string> = {};
        if (response.data.result && Array.isArray(response.data.result)) {
            response.data.result.forEach((task: any) => { tasks[task._id] = task.content; });
        }
        addLog(`获取到 ${Object.keys(tasks).length} 个现有任务`, 'INFO');
        return tasks;
    }
    
    getUserIdByName(name: string, allMembers: Record<string, string>): string | null {
        for (const [userId, memberName] of Object.entries(allMembers)) {
            if (memberName === name) return userId;
        }
        return null;
    }

    private _formatDateForAPI(dateString: string, isStartDate = true): string | null {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
        const timeString = isStartDate ? 'T00:30:00.000Z' : 'T10:00:00.000Z';
        const dateObj = new Date(dateString + timeString);
        if (isNaN(dateObj.getTime())) return null;
        return dateObj.toISOString();
    }

    async updateTaskDates(taskId: string, startDate: string | null, endDate: string | null): Promise<boolean> {
        if (!startDate && !endDate) return true;
        const url = `${this.baseUrl}/api/tasks/${taskId}`;
        const payload: any = {};
        if (startDate) payload.startDate = this._formatDateForAPI(startDate, true);
        if (endDate) payload.dueDate = this._formatDateForAPI(endDate, false);
        
        if (Object.keys(payload).length === 0) return true; // Nothing to update

        const response = await this.request('PUT', url, { body: JSON.stringify(payload) });
        return response.success;
    }

    async setTaskReminder(taskId: string, reminderRule: string): Promise<boolean> {
        const url = `${this.baseUrl}/api/v2/tasks/${taskId}/reminders`;
        const reminderMap: Record<string, string> = {
            "任务开始时": "startDate/P0D", "任务开始前5分钟": "startDate/-PT5M",
            "任务截止时": "dueDate/P0D", "任务截止前1天": "dueDate/-P1D", "不提醒": ""
        };
        const rule = reminderMap[reminderRule] || "";
        const payload = { reminders: [{ rule: rule, labels: ["source:task"], receivers: ["role/executor"] }] };
        const response = await this.request('PUT', url, { body: JSON.stringify(payload) });
        return response.success;
    }

    async setTaskExecutor(taskId: string, userId: string): Promise<boolean> {
        const url = `${this.baseUrl}/api/tasks/${taskId}/_executorId`;
        const payload = { _executorId: userId };
        const response = await this.request('PUT', url, { body: JSON.stringify(payload) });
        return response.success;
    }

    async addTaskInvolvers(taskId: string, userIds: string[]): Promise<boolean> {
        const url = `${this.baseUrl}/api/tasks/${taskId}/involveMembers`;
        const payload = { addInvolvers: userIds };
        const response = await this.request('PUT', url, { body: JSON.stringify(payload) });
        return response.success;
    }

    async updateTaskPlanTime(taskId: string, managerId: string, userId: string, organizationId: string, startDate: string, endDate: string, planTimeMs: number | null): Promise<boolean> {
        if (!userId || !startDate || !endDate || planTimeMs === null || planTimeMs === undefined) return true;
        
        const baseUrlApps = 'https://apps.teambition.com';
        const getPlannedTimeUrl = `${baseUrlApps}/work-time-server/api/plan-time/aggregation/task/${taskId}`;
        const getParams = new URLSearchParams({ _taskId: taskId, _userId: userId, withTotal: 'false' }).toString();
        const customHeaders = { 'x-organization-id': organizationId, 'x-user-id': managerId };
        
        let currentPlannedTime = 0;
        try {
            const getResponse = await this.request('GET', `${getPlannedTimeUrl}?${getParams}`, { headers: customHeaders });
            if (getResponse.success && getResponse.data.payload && getResponse.data.payload.length > 0) {
                currentPlannedTime = getResponse.data.payload[0].planTime;
            }
        } catch (error) { addLog(`获取计划工时失败 (任务ID: ${taskId}): ${error instanceof Error ? error.message : '未知错误'}`, 'WARN'); }

        if (currentPlannedTime < planTimeMs) {
            const additionalTime = planTimeMs - currentPlannedTime;
            const planTimeUrl = `${baseUrlApps}/work-time-server/api/plan-time?from=task&_taskId=${taskId}&_userId=${managerId}`;
            const payload = {
                "_userId": userId, "_objectId": taskId, "objectType": "task", "isDuration": true,
                "includesHolidays": false, "startDate": startDate, "endDate": endDate, "planTime": additionalTime
            };
            const planResponse = await this.request('POST', planTimeUrl, { headers: { ...customHeaders, 'Content-Length': Buffer.byteLength(JSON.stringify(payload)).toString() }, body: JSON.stringify(payload) });
            return planResponse.success;
        }
        return true; // No update needed
    }

    clearCache(): void {
        this.cache.clear();
    }
}

// --- Sync Engine Logic based on v1.0.0 ---

interface SyncStats {
    total: number;
    success: number;
    failed: number;
    skipped: number;
    failedTasks: Array<{ row?: number; task_name: string; error: string }>;
}

class SyncEngineV2 {
    private config: any; // Should be typed properly, e.g. ConfigManager type
    private isRunning: boolean = false;
    private stats: SyncStats;
    private apiClient: TeambitionAPIClient | null = null;

    constructor(configManagerInstance: any) { // Should be typed
        this.config = configManagerInstance;
        this.stats = { total: 0, success: 0, failed: 0, skipped: 0, failedTasks: [] };
    }

    private updateStatus(message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO'): void {
        addLog(message, level);
    }

    private calculateSimilarity(str1: string, str2: string): number {
        str1 = str1.toLowerCase(); str2 = str2.toLowerCase();
        if (str1 === str2) return 1;
        const len1 = str1.length, len2 = str2.length;
        const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(null));
        for (let i = 0; i <= len1; i++) matrix[i][0] = i;
        for (let j = 0; j <= len2; j++) matrix[0][j] = j;
        for (let i = 1; i <= len1; i++) {
            for (let j = 1; j <= len2; j++) {
                const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
                matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
            }
        }
        const distance = matrix[len1][len2];
        return 1 - distance / Math.max(len1, len2);
    }

    private async processBatch(batch: any[], apiClient: TeambitionAPIClient, projectId: string, tasklistId: string, organizationId: string, allMembers: Record<string, string>, allTasks: Record<string, string>): Promise<void> {
        const maxConcurrent = this.config.getConfig().maxConcurrentRequests || 5;
        const semaphore = { count: 0, queue: [] as ((value?: unknown) => void)[], async acquire() {
            if (this.count < maxConcurrent) { this.count++; return; }
            return new Promise(resolve => this.queue.push(resolve));
        }, release() { this.count--; if (this.queue.length > 0) { this.count++; const resolve = this.queue.shift()!; resolve(); } } };
        
        const promises = batch.map(task => this.processTaskWithSemaphore(task, apiClient, projectId, tasklistId, organizationId, allMembers, allTasks, semaphore));
        await Promise.all(promises);
    }

    private async processTaskWithSemaphore(task: any, apiClient: TeambitionAPIClient, projectId: string, tasklistId: string, organizationId: string, allMembers: Record<string, string>, allTasks: Record<string, string>, semaphore: any): Promise<void> {
        await semaphore.acquire();
        try {
            await this.processSingleTask(task, apiClient, projectId, tasklistId, organizationId, allMembers, allTasks);
        } finally {
            semaphore.release();
        }
    }

    private async processSingleTask(task: any, apiClient: TeambitionAPIClient, projectId: string, tasklistId: string, organizationId: string, allMembers: Record<string, string>, allTasks: Record<string, string>): Promise<void> {
        if (!this.isRunning) return;
        const taskName = `${task.task_number || ''} ${task.task_title}`.trim();
        let taskId: string | null = null;

        for (const [id, name] of Object.entries(allTasks)) {
            if (name === taskName) { taskId = id; break; }
        }
        if (!taskId) { // Fuzzy matching
            let bestMatchScore = 0;
            for (const [id, name] of Object.entries(allTasks)) {
                const score = this.calculateSimilarity(taskName, name);
                if (score > bestMatchScore && score > 0.5) { bestMatchScore = score; taskId = id; }
            }
        }

        if (!taskId) { this.stats.skipped++; this.updateStatus(`跳过任务(未找到): ${taskName}`, 'WARN'); return; }

        const updates: Record<string, any> = {};
        if (task.start_date) updates.start_date = task.start_date;
        if (task.end_date) updates.end_date = task.end_date;
        if (task.reminder_rule_api) updates.reminder_rule = task.reminder_rule; // Assuming this is the correct field name from Excel

        let executorId: string | null = null;
        if (task.executor) { executorId = apiClient.getUserIdByName(task.executor, allMembers); if (executorId) updates.executor_id = executorId; }
        
        if (task.involvers) {
            const involverNames = task.involvers.split(/[,\n]/).map((n: string) => n.trim()).filter((n: string) => n);
            const involverIds = involverNames.map((name: string) => apiClient.getUserIdByName(name, allMembers)).filter((id: string | null) => id !== null) as string[];
            if (involverIds.length > 0) updates.involvers_ids = involverIds;
        }

        let planTimeMs: number | null = null;
        if (task.plan_time !== undefined && task.plan_time !== null) {
            if (String(task.plan_time).trim() === '') { planTimeMs = null; }
            else { const planTimeVal = parseFloat(task.plan_time); if (!isNaN(planTimeVal) && isFinite(planTimeVal)) planTimeMs = Math.round(planTimeVal * 3600000); }
        }
        if (planTimeMs !== null) updates.plan_time_ms = planTimeMs; // Store for later use

        const results: Record<string, number> = {};
        try {
            if (updates.start_date || updates.end_date) {
                const success = await apiClient.updateTaskDates(taskId, updates.start_date || null, updates.end_date || null);
                if (updates.start_date) results.startDate = success ? 200 : 500;
                if (updates.end_date) results.dueDate = success ? 200 : 500;
            }
            if (updates.reminder_rule) { results.reminder = (await apiClient.setTaskReminder(taskId, updates.reminder_rule)) ? 200 : 500; }
            if (updates.executor_id) { results.executor = (await apiClient.setTaskExecutor(taskId, updates.executor_id)) ? 200 : 500; }
            if (updates.involvers_ids) { results.involvers = (await apiClient.addTaskInvolvers(taskId, updates.involvers_ids)) ? 200 : 500; }
            if (updates.plan_time_ms !== undefined) {
                const pdtName = this.config.getConfig().pdt; // Manager name from config
                const managerId = pdtName ? apiClient.getUserIdByName(pdtName, allMembers) : null;
                if (managerId && executorId && updates.start_date && updates.end_date) {
                    results.planTime = (await apiClient.updateTaskPlanTime(taskId, managerId, executorId, organizationId, updates.start_date, updates.end_date, updates.plan_time_ms)) ? 200 : 500;
                } else { results.planTime = 500; this.updateStatus(`计划工时更新失败(缺少参数): ${taskName}`, 'WARN'); }
            }

            const allSuccess = Object.values(results).every(status => status === 200);
            if (allSuccess) { this.stats.success++; this.updateStatus(`更新任务成功: ${taskName}`, 'INFO'); }
            else { this.stats.failed++; this.stats.failedTasks.push({ row: task.rowIndex, task_name: taskName, error: '部分更新失败' }); this.updateStatus(`任务更新部分失败: ${taskName}`, 'ERROR'); }
        } catch (error) {
            this.stats.failed++; this.stats.failedTasks.push({ row: task.rowIndex, task_name: taskName, error: error instanceof Error ? error.message : '未知错误' });
            this.updateStatus(`任务失败 (${task.rowIndex}行): ${taskName} - ${error instanceof Error ? error.message : '未知错误'}`, 'ERROR');
        }
    }

    public async sync(tasks: any[]): Promise<{ success: boolean; data?: SyncStats; error?: string }> {
        this.updateStatus(`SyncEngineV2.sync called with ${tasks?.length || 0} tasks.`, 'INFO');
        if (!tasks || tasks.length === 0) { this.updateStatus("没有任务需要同步", "WARN"); return { success: false }; }
        this.isRunning = true;
        this.stats = { total: tasks.length, success: 0, failed: 0, skipped: 0, failedTasks: [] };
        this.updateStatus(`开始同步 ${tasks.length} 个任务...`);

        try {
            const config = this.config.getConfig();
            if (!config.projectUrl || !config.cookies) throw new Error('项目URL或Cookies未配置');
            
            this.apiClient = new TeambitionAPIClient(config.cookies);
            const projectId = extractProjectId(config.projectUrl);
            if (!projectId) throw new Error(`无法从URL中提取项目ID: ${config.projectUrl}`);
            this.updateStatus(`项目ID: ${projectId}`, "INFO");

            this.updateStatus("获取组织信息..."); const organizationId = await this.apiClient.getOrganizationId(projectId); this.updateStatus(`组织ID: ${organizationId}`, "INFO");
            this.updateStatus("获取任务列表信息..."); const tasklistId = await this.apiClient.getTasklistId(projectId); this.updateStatus(`任务列表ID: ${tasklistId}`, "INFO");
            this.updateStatus("获取项目成员信息..."); const allMembers = await this.apiClient.getAllMembers(projectId); this.updateStatus(`获取到 ${Object.keys(allMembers).length} 个项目成员`, "INFO");
            this.updateStatus("获取现有任务列表..."); const allTasks = await this.apiClient.getAllTasks(projectId);

            const batchSize = config.batchSize || 20;
            this.updateStatus(`开始处理任务 (批量大小: ${batchSize})`);
            for (let i = 0; i < tasks.length; i += batchSize) {
                if (!this.isRunning) { this.updateStatus("同步被用户中断", "WARN"); break; }
                const batch = tasks.slice(i, i + batchSize);
                this.updateStatus(`处理批次 ${Math.floor(i/batchSize) + 1}/${Math.ceil(tasks.length/batchSize)} (${batch.length} 个任务)`);
                await this.processBatch(batch, this.apiClient, projectId, tasklistId, organizationId, allMembers, allTasks);
            }
            
            const successRate = this.stats.total > 0 ? Math.round((this.stats.success / this.stats.total) * 100) : 0;
            this.updateStatus(`同步完成! 成功: ${this.stats.success}, 失败: ${this.stats.failed}, 跳过: ${this.stats.skipped} (成功率: ${successRate}%)`, "SUCCESS");
            return { success: true, data: this.stats };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            this.updateStatus(`同步过程中发生错误: ${errorMessage}`, "ERROR");
            return { success: false, error: errorMessage };
        } finally {
            this.isRunning = false;
            if (this.apiClient) this.apiClient.clearCache();
        }
    }

    public stop(): void {
        if (this.isRunning) { this.isRunning = false; this.updateStatus("正在停止同步...", "WARN"); }
    }
}

// --- IPC Handler for Sync ---

const syncEngineInstance = new SyncEngineV2(configManager);

ipcMain.handle('start-sync', async (_, tasksToSync: any[]) => {
    return await syncEngineInstance.sync(tasksToSync);
});

ipcMain.handle('stop-sync', async () => {
    syncEngineInstance.stop();
});

ipcMain.handle('get-sync-status', () => {
  // This would require a stateful sync process to report status.
  // For now, it's always false.
  return { isRunning: false, stats: null };
});

// 初始化日志
addLog('应用初始化中...', 'INFO');
