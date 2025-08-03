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
   * 自动获取Cookies（先检查现有cookies，如果没有则打开登录窗口）
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
      // 首先检查是否已经有有效的Cookies
      console.log('检查现有Cookies...');
      const existingCookies = await session.defaultSession.cookies.get({
        domain: '.teambition.com'
      });

      // 详细打印所有cookies用于调试
      console.log('现有Cookies数量:', existingCookies.length);
      console.log('Cookies详情:');
      existingCookies.forEach((cookie, index) => {
        console.log(`  ${index + 1}. ${cookie.name} = ${cookie.value.substring(0, 50)}...`);
      });

      // 检查是否已获取到有效的认证Cookie - 放宽检测条件
      const hasAuthCookie = existingCookies.some(cookie => {
        const cookieName = cookie.name.toLowerCase();
        return cookieName.includes('session') || 
               cookieName.includes('token') ||
               cookieName.includes('auth') ||
               cookieName.includes('sid') ||
               cookieName.includes('userid') ||
               cookieName.includes('_tb_') ||
               cookieName.includes('csrf') ||
               cookieName.includes('_xsrf') ||
               cookieName.length > 20; // 如果cookie名称很长，可能是认证相关的
      });

      console.log('检测到认证Cookie:', hasAuthCookie);
      console.log('Cookie数量条件满足:', existingCookies.length > 0);

      // 放宽条件：只要有任何cookies就认为可能是已登录状态
      if (existingCookies.length > 0) {
        const cookieString = existingCookies
          .map(cookie => `${cookie.name}=${cookie.value}`)
          .join('; ');

        console.log('发现Cookies，直接使用，数量:', existingCookies.length);
        this.isGettingCookies = false;

        return {
          success: true,
          cookies: cookieString
        };
      }

      console.log('未发现任何Cookies，打开登录窗口...');

      // 如果没有有效Cookies，创建认证窗口
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

      // 直接导航到登录页面
      await this.authWindow.loadURL('https://account.teambition.com/login');

      console.log('已打开Teambition登录页面，等待用户完成登录...');

      // 返回一个Promise，等待登录完成（无时间限制）
      return new Promise<{ success: boolean; cookies?: string; error?: string }>((resolve) => {
        const cookieCheckInterval = setInterval(async () => {
          if (!this.authWindow) {
            clearInterval(cookieCheckInterval);
            resolve({
              success: false,
              error: '登录窗口已关闭'
            });
            return;
          }

          // 检查当前URL - 如果跳转到主页说明登录成功
          const currentUrl = this.authWindow.webContents.getURL();
          const isLoggedIn = currentUrl.includes('teambition.com/') && 
                           !currentUrl.includes('/login') && 
                           !currentUrl.includes('/account');

          const cookies = await session.defaultSession.cookies.get({
            domain: '.teambition.com'
          });

          // 检查是否已获取到有效的认证Cookie
          const hasAuthCookie = cookies.some(cookie => {
            const cookieName = cookie.name.toLowerCase();
            return cookieName.includes('teambition_sessionid') || 
                   cookieName.includes('tb_access_token') ||
                   cookieName.includes('session') || 
                   cookieName.includes('token') ||
                   cookieName.includes('auth') ||
                   cookieName.includes('sid') ||
                   cookieName.includes('userid') ||
                   cookieName.includes('_tb_');
          });

          console.log('当前URL:', currentUrl);
          console.log('是否登录:', isLoggedIn);
          console.log('Cookies数量:', cookies.length);
          console.log('检测到认证Cookie:', hasAuthCookie);

          // 如果URL已经跳转到主页并且有认证Cookie，说明登录成功
          if (isLoggedIn && hasAuthCookie && cookies.length > 5) {
            clearInterval(cookieCheckInterval);
            
            // 延迟一下确保所有Cookie都已设置
            await new Promise(resolve => setTimeout(resolve, 2000));
            
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

            resolve({
              success: true,
              cookies: cookieString
            });
          }
        }, 2000); // 每2秒检查一次

        // 注意：不再设置超时，用户要求无时间限制等待登录
      });

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
