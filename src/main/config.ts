/**
 * 主进程配置管理模块
 * 负责管理应用的配置信息，包括读取、保存和验证配置
 */

import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import { SyncConfig } from '../shared/types';
import { safeJsonParse } from '../shared/utils';

/**
 * 配置管理类
 */
export class ConfigManager {
  private configPath: string;
  private config: SyncConfig;

  constructor() {
    // 获取用户数据目录
    const userDataPath = app.getPath('userData');
    this.configPath = path.join(userDataPath, 'config.json');
    
    // 初始化默认配置
    this.config = this.getDefaultConfig();
    
    // 加载配置文件
    this.loadConfig();
  }

  /**
   * 获取默认配置
   */
  private getDefaultConfig(): SyncConfig {
    return {
      projectUrl: '',
      cookies: '',
      sheetName: '',
      batchSize: 20,
      maxConcurrent: 5,
      useAsync: true,
      pdt: ''
    };
  }

  /**
   * 加载配置文件
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const loadedConfig = safeJsonParse(configData, this.getDefaultConfig());
        
        // 验证并合并配置
        this.config = { ...this.getDefaultConfig(), ...loadedConfig };
        console.log('配置文件加载成功');
      } else {
        // 如果配置文件不存在，创建默认配置文件
        this.saveConfig();
        console.log('配置文件不存在，已创建默认配置');
      }
    } catch (error) {
      console.error('加载配置文件失败:', error);
      // 使用默认配置
      this.config = this.getDefaultConfig();
    }
  }

  /**
   * 保存配置到文件
   */
  public saveConfig(): void {
    try {
      const configDir = path.dirname(this.configPath);
      
      // 确保配置目录存在
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      
      // 保存配置文件
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf8');
      console.log('配置文件保存成功');
    } catch (error) {
      console.error('保存配置文件失败:', error);
      throw new Error('保存配置失败');
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): SyncConfig {
    return { ...this.config }; // 返回配置的拷贝
  }

  /**
   * 更新配置
   * @param newConfig 新的配置数据
   */
  public updateConfig(newConfig: Partial<SyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.saveConfig();
  }

  /**
   * 验证配置
   * @returns 验证结果
   */
  public validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证项目URL
    if (!this.config.projectUrl.trim()) {
      errors.push('项目URL不能为空');
    } else if (!this.isValidTeambitionUrl(this.config.projectUrl)) {
      errors.push('项目URL格式不正确，请输入有效的Teambition项目URL');
    }

    // 验证Cookies
    if (!this.config.cookies.trim()) {
      errors.push('Cookies不能为空');
    }

    // 验证工作表名称
    if (!this.config.sheetName.trim()) {
      errors.push('工作表名称不能为空');
    }

    // 验证批处理大小
    if (this.config.batchSize < 1 || this.config.batchSize > 100) {
      errors.push('批处理大小必须在1-100之间');
    }

    // 验证最大并发数
    if (this.config.maxConcurrent < 1 || this.config.maxConcurrent > 20) {
      errors.push('最大并发数必须在1-20之间');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 验证Teambition URL格式
   * @param url 项目URL
   */
  private isValidTeambitionUrl(url: string): boolean {
    return /^https:\/\/(www\.)?teambition\.com\/project\/[a-f0-9]+/.test(url);
  }

  /**
   * 重置配置为默认值
   */
  public resetConfig(): void {
    this.config = this.getDefaultConfig();
    this.saveConfig();
    console.log('配置已重置为默认值');
  }

  /**
   * 获取配置文件路径
   */
  public getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 检查配置文件是否存在
   */
  public configExists(): boolean {
    return fs.existsSync(this.configPath);
  }

  /**
   * 删除配置文件
   */
  public deleteConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        fs.unlinkSync(this.configPath);
        console.log('配置文件已删除');
      }
    } catch (error) {
      console.error('删除配置文件失败:', error);
      throw new Error('删除配置文件失败');
    }
  }
}

// 创建全局配置管理实例
export const configManager = new ConfigManager();
