/**
 * Electron主进程入口文件
 * 负责创建窗口、管理应用生命周期和处理IPC通信
 */

import { app, BrowserWindow, ipcMain, dialog, Menu } from 'electron';
import path from 'path';
import { configManager } from './config';
import { cookieManager } from './cookieManager';
import { createLogEntry, formatTimestamp } from '../shared/utils';
import * as XLSX from 'xlsx';

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

/**
 * 同步操作相关IPC（简化版本，完整实现在后续步骤中）
 */
ipcMain.handle('start-sync', async (_, tasks: any[]) => {
  addLog(`开始同步 ${tasks.length} 个任务`, 'INFO');
  // 这里将在后续实现完整的同步逻辑
  return { success: true };
});

ipcMain.handle('stop-sync', async () => {
  addLog('停止同步', 'WARN');
  // 这里将在后续实现停止同步的逻辑
});

ipcMain.handle('get-sync-status', () => {
  // 这里将在后续实现获取同步状态的逻辑
  return { isRunning: false, stats: null };
});

// 初始化日志
addLog('应用初始化中...', 'INFO');
