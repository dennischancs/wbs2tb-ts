/**
 * 预加载脚本
 * 安全地暴露主进程功能给渲染进程
 */

import { contextBridge, ipcRenderer } from 'electron';
import { SyncConfig, ApiResponse } from '../shared/types';

/**
 * 暴露给渲染进程的API
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // 配置管理
  config: {
    /**
     * 获取配置
     */
    getConfig: (): Promise<SyncConfig> => ipcRenderer.invoke('get-config'),
    
    /**
     * 更新配置
     */
    updateConfig: (config: Partial<SyncConfig>): Promise<{ success: boolean; error?: string }> => 
      ipcRenderer.invoke('update-config', config),
    
    /**
     * 验证配置
     */
    validateConfig: (): Promise<{ isValid: boolean; errors: string[] }> => 
      ipcRenderer.invoke('validate-config'),
    
    /**
     * 重置配置
     */
    resetConfig: (): Promise<{ success: boolean; error?: string }> => 
      ipcRenderer.invoke('reset-config')
  },

  // Cookie管理
  cookies: {
    /**
     * 获取Cookies
     */
    getCookies: (): Promise<{ success: boolean; cookies?: string; error?: string }> => 
      ipcRenderer.invoke('get-cookies'),
    
    /**
     * 自动获取Cookies
     */
    autoGetCookies: (): Promise<{ success: boolean; cookies?: string; error?: string }> => 
      ipcRenderer.invoke('auto-get-cookies'),
    
    /**
     * 清除Cookies
     */
    clearCookies: (): Promise<{ success: boolean; error?: string }> => 
      ipcRenderer.invoke('clear-cookies'),
    
    /**
     * 获取Cookie状态
     */
    getStatus: (): Promise<{ isGettingCookies: boolean; hasAuthWindow: boolean }> => 
      ipcRenderer.invoke('get-cookie-status')
  },

  // 文件操作
  file: {
    /**
     * 选择Excel文件
     */
    selectExcelFile: (): Promise<{ success: boolean; filePath?: string; error?: string }> => 
      ipcRenderer.invoke('select-excel-file'),
    
    /**
     * 读取Excel文件
     */
    readExcelFile: (filePath: string, sheetName: string): Promise<{ success: boolean; data?: any[]; error?: string }> => 
      ipcRenderer.invoke('read-excel-file', filePath, sheetName),
    
    /**
     * 获取Excel工作表列表
     */
    getExcelSheets: (filePath: string): Promise<{ success: boolean; sheets?: string[]; error?: string }> => 
      ipcRenderer.invoke('get-excel-sheets', filePath)
  },

  // API代理
  api: {
    /**
     * 代理Teambition API请求
     */
    proxyRequest: (url: string, options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    }): Promise<ApiResponse> => ipcRenderer.invoke('proxy-api-request', url, options)
  },

  // 同步操作
  sync: {
    /**
     * 开始同步
     */
    startSync: (tasks: any[]): Promise<{ success: boolean; error?: string }> => 
      ipcRenderer.invoke('start-sync', tasks),
    
    /**
     * 停止同步
     */
    stopSync: (): Promise<void> => ipcRenderer.invoke('stop-sync'),
    
    /**
     * 获取同步状态
     */
    getSyncStatus: (): Promise<{ isRunning: boolean; stats?: any }> => 
      ipcRenderer.invoke('get-sync-status')
  },

  // 窗口操作
  window: {
    /**
     * 最小化窗口
     */
    minimize: (): void => ipcRenderer.send('window-minimize'),
    
    /**
     * 最大化窗口
     */
    maximize: (): void => ipcRenderer.send('window-maximize'),
    
    /**
     * 关闭窗口
     */
    close: (): void => ipcRenderer.send('window-close')
  },

  // 应用信息
  app: {
    /**
     * 获取应用版本
     */
    getVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),
    
    /**
     * 获取应用路径
     */
    getAppPath: (): Promise<string> => ipcRenderer.invoke('get-app-path'),
    
    /**
     * 获取用户数据路径
     */
    getUserDataPath: (): Promise<string> => ipcRenderer.invoke('get-user-data-path')
  },

  // 日志系统
  log: {
    /**
     * 添加日志
     */
    addLog: (message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'): void => 
      ipcRenderer.send('add-log', message, level),
    
    /**
     * 清空日志
     */
    clearLogs: (): void => ipcRenderer.send('clear-logs'),
    
    /**
     * 监听日志更新
     */
    onLogUpdate: (callback: (logs: any[]) => void) => {
      ipcRenderer.on('log-update', (_, logs) => callback(logs));
    },
    
    /**
     * 移除日志监听
     */
    removeLogListener: () => {
      ipcRenderer.removeAllListeners('log-update');
    }
  }
});

// 类型定义，用于TypeScript类型检查
declare global {
  interface Window {
    electronAPI: {
      config: {
        getConfig: () => Promise<SyncConfig>;
        updateConfig: (config: Partial<SyncConfig>) => Promise<{ success: boolean; error?: string }>;
        validateConfig: () => Promise<{ isValid: boolean; errors: string[] }>;
        resetConfig: () => Promise<{ success: boolean; error?: string }>;
      };
      cookies: {
        getCookies: () => Promise<{ success: boolean; cookies?: string; error?: string }>;
        autoGetCookies: () => Promise<{ success: boolean; cookies?: string; error?: string }>;
        clearCookies: () => Promise<{ success: boolean; error?: string }>;
        getStatus: () => Promise<{ isGettingCookies: boolean; hasAuthWindow: boolean }>;
      };
      file: {
        selectExcelFile: () => Promise<{ success: boolean; filePath?: string; error?: string }>;
        readExcelFile: (filePath: string, sheetName: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
        getExcelSheets: (filePath: string) => Promise<{ success: boolean; sheets?: string[]; error?: string }>;
      };
      api: {
        proxyRequest: (url: string, options: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        }) => Promise<ApiResponse>;
      };
      sync: {
        startSync: (tasks: any[]) => Promise<{ success: boolean; error?: string }>;
        stopSync: () => Promise<void>;
        getSyncStatus: () => Promise<{ isRunning: boolean; stats?: any }>;
      };
      window: {
        minimize: () => void;
        maximize: () => void;
        close: () => void;
      };
      app: {
        getVersion: () => Promise<string>;
        getAppPath: () => Promise<string>;
        getUserDataPath: () => Promise<string>;
      };
      log: {
        addLog: (message: string, level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS') => void;
        clearLogs: () => void;
        onLogUpdate: (callback: (logs: any[]) => void) => void;
        removeLogListener: () => void;
      };
    };
  }
}
