/**
 * Electron Cookie管理模块
 * 使用Electron的session和webRequest模块替代Puppeteer来获取和管理Cookies
 */

import { session, BrowserWindow, ipcMain } from 'electron';
import { AppCookie } from '../shared/types';
import { createLogEntry } from '../shared/utils';

/**
 * Electron Cookie管理类
 */
export class ElectronCookieManager {
  private authWindow: BrowserWindow | null = null;
  private isGettingCookies: boolean = false;

  constructor() {
    // 设置IPC监听器
    this.setupIPCHandlers();
  }

  /**
   * 设置IPC处理器
   */
  private setupIPCHandlers(): void {
    // 获取Cookies请求
    ipcMain.handle('get-cookies', async () => {
      return await this.getCookies();
    });

    // 自动获取Cookies请求
    ipcMain.handle('auto-get-cookies', async () => {
      return await this.autoGetCookies();
    });

    // 检查Cookie获取状态
    ipcMain.handle('get-cookie-status', () => {
      return {
        isGettingCookies: this.isGettingCookies,
        hasAuthWindow: this.authWindow !== null
      };
    });
  }

  /**
   * 获取当前存储的Teambition Cookies
   */
  public async getCookies(): Promise<{ success: boolean; cookies?: string; error?: string }> {
    try {
      // 获取所有Teambition相关的Cookies
      const cookies = await session.defaultSession.cookies.get({
        domain: '.teambition.com'
      });

      if (cookies.length === 0) {
        return {
          success: false,
          error: '未找到Teambition Cookies，请先登录'
        };
      }

      // 将Cookies转换为字符串格式
      const cookieString = cookies
        .map(cookie => `${cookie.name}=${cookie.value}`)
        .join('; ');

      console.log('成功获取Cookies，数量:', cookies.length);
      return {
        success: true,
        cookies: cookieString
      };
    } catch (error) {
      console.error('获取Cookies失败:', error);
      return {
        success: false,
        error: `获取Cookies失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 自动获取Cookies（打开登录窗口）
   */
  public async autoGetCookies(): Promise<{ success: boolean; cookies?: string; error?: string }> {
    if (this.isGettingCookies) {
      return {
        success: false,
        error: '正在获取Cookies中，请稍后再试'
      };
    }

    this.isGettingCookies = true;

    try {
      // 创建认证窗口
      this.authWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'Teambition 登录',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true
        }
      });

      // 监听窗口关闭事件
      this.authWindow.on('closed', () => {
        this.authWindow = null;
        this.isGettingCookies = false;
      });

      // 导航到Teambition登录页面
      await this.authWindow.loadURL('https://www.teambition.com/login');

      console.log('已打开Teambition登录页面，等待用户登录...');

      // 监听Cookie变化
      const cookieCheckInterval = setInterval(async () => {
        if (!this.authWindow) {
          clearInterval(cookieCheckInterval);
          return;
        }

        const cookies = await session.defaultSession.cookies.get({
          domain: '.teambition.com'
        });

        // 检查是否已获取到有效的认证Cookie
        const hasAuthCookie = cookies.some(cookie => 
          cookie.name.includes('session') || 
          cookie.name.includes('token') ||
          cookie.name.includes('auth')
        );

        if (hasAuthCookie && cookies.length > 2) {
          clearInterval(cookieCheckInterval);
          
          // 延迟一下确保所有Cookie都已设置
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // 获取最终的Cookies
          const finalCookies = await session.defaultSession.cookies.get({
            domain: '.teambition.com'
          });

          const cookieString = finalCookies
            .map(cookie => `${cookie.name}=${cookie.value}`)
            .join('; ');

          console.log('用户登录成功，获取到Cookies，数量:', finalCookies.length);

          // 关闭认证窗口
          if (this.authWindow) {
            this.authWindow.close();
          }

          this.isGettingCookies = false;

          return {
            success: true,
            cookies: cookieString
          };
        }
      }, 1000);

      // 5分钟后自动超时
      setTimeout(() => {
        if (this.isGettingCookies && this.authWindow) {
          clearInterval(cookieCheckInterval);
          this.authWindow.close();
          this.isGettingCookies = false;
          console.log('Cookie获取超时');
        }
      }, 300000);

      return {
        success: false,
        error: '请在打开的窗口中完成登录，系统将自动获取Cookies'
      };

    } catch (error) {
      this.isGettingCookies = false;
      if (this.authWindow) {
        this.authWindow.close();
      }
      
      console.error('自动获取Cookies失败:', error);
      return {
        success: false,
        error: `自动获取Cookies失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 清除Teambition相关的Cookies
   */
  public async clearCookies(): Promise<{ success: boolean; error?: string }> {
    try {
      // 获取所有Teambition Cookies
      const cookies = await session.defaultSession.cookies.get({
        domain: '.teambition.com'
      });

      // 删除每个Cookie
      for (const cookie of cookies) {
        const url = `https://${cookie.domain}${cookie.path}`;
        await session.defaultSession.cookies.remove(url, cookie.name);
      }

      console.log('已清除Teambition Cookies，数量:', cookies.length);
      return { success: true };
    } catch (error) {
      console.error('清除Cookies失败:', error);
      return {
        success: false,
        error: `清除Cookies失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 设置Cookie
   */
  public async setCookie(cookie: AppCookie): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `https://${cookie.domain || 'www.teambition.com'}${cookie.path || '/'}`;
      
      await session.defaultSession.cookies.set({
        url,
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        expirationDate: cookie.expires,
        sameSite: cookie.sameSite
      });

      console.log('Cookie设置成功:', cookie.name);
      return { success: true };
    } catch (error) {
      console.error('设置Cookie失败:', error);
      return {
        success: false,
        error: `设置Cookie失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 获取Cookie状态
   */
  public getCookieStatus(): { isGettingCookies: boolean; hasAuthWindow: boolean } {
    return {
      isGettingCookies: this.isGettingCookies,
      hasAuthWindow: this.authWindow !== null
    };
  }

  /**
   * 强制关闭认证窗口
   */
  public closeAuthWindow(): void {
    if (this.authWindow) {
      this.authWindow.close();
      this.authWindow = null;
      this.isGettingCookies = false;
      console.log('已强制关闭认证窗口');
    }
  }
}

// 创建全局Cookie管理实例
export const cookieManager = new ElectronCookieManager();
