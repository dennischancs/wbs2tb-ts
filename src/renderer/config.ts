/**
 * 渲染进程配置管理模块
 * 负责管理前端的配置状态和验证
 */

import { SyncConfig } from '../shared/types';
import { isValidTeambitionUrl } from '../shared/utils';

/**
 * 渲染进程配置管理类
 */
export class RendererConfigManager {
  private config: SyncConfig;
  private listeners: Array<(config: SyncConfig) => void> = [];

  constructor() {
    // 初始化默认配置
    this.config = this.getDefaultConfig();
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
    this.notifyListeners();
  }

  /**
   * 从表单数据更新配置
   * @param formData 表单数据对象
   */
  public updateFromForm(formData: any): void {
    const newConfig: Partial<SyncConfig> = {
      projectUrl: formData.projectUrl || '',
      cookies: formData.cookies || '',
      sheetName: formData.sheetName || '',
      batchSize: parseInt(formData.batchSize) || 20,
      maxConcurrent: parseInt(formData.maxConcurrent) || 5,
      useAsync: Boolean(formData.useAsync),
      pdt: formData.pdt || ''
    };

    this.updateConfig(newConfig);
  }

  /**
   * 验证配置
   * @returns 验证结果
   */
  public validate(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证项目URL
    if (!this.config.projectUrl.trim()) {
      errors.push('项目URL不能为空');
    } else if (!isValidTeambitionUrl(this.config.projectUrl)) {
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
   * 重置配置为默认值
   */
  public reset(): void {
    this.config = this.getDefaultConfig();
    this.notifyListeners();
  }

  /**
   * 转换为表单数据格式
   */
  public toFormData(): any {
    return {
      projectUrl: this.config.projectUrl,
      pdt: this.config.pdt,
      cookies: this.config.cookies,
      sheetName: this.config.sheetName,
      batchSize: this.config.batchSize,
      maxConcurrent: this.config.maxConcurrent,
      useAsync: this.config.useAsync
    };
  }

  /**
   * 添加配置变更监听器
   * @param listener 监听器函数
   */
  public addChangeListener(listener: (config: SyncConfig) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   * @param listener 监听器函数
   */
  public removeChangeListener(listener: (config: SyncConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器配置已变更
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getConfig());
      } catch (error) {
        console.error('配置变更监听器执行失败:', error);
      }
    });
  }

  /**
   * 检查配置是否完整
   */
  public isComplete(): boolean {
    return Boolean(
      this.config.projectUrl.trim() &&
      this.config.cookies.trim() &&
      this.config.sheetName.trim()
    );
  }

  /**
   * 获取配置状态
   */
  public getStatus(): {
    isComplete: boolean;
    isValid: boolean;
    errors: string[];
  } {
    const validation = this.validate();
    return {
      isComplete: this.isComplete(),
      isValid: validation.isValid,
      errors: validation.errors
    };
  }

  /**
   * 获取缺失的配置项
   */
  public getMissingFields(): string[] {
    const missing: string[] = [];
    
    if (!this.config.projectUrl.trim()) {
      missing.push('项目URL');
    }
    
    if (!this.config.cookies.trim()) {
      missing.push('Cookies');
    }
    
    if (!this.config.sheetName.trim()) {
      missing.push('工作表名称');
    }
    
    return missing;
  }

  /**
   * 序列化配置为JSON字符串
   */
  public toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 从JSON字符串反序列化配置
   * @param jsonString JSON字符串
   */
  public fromJSON(jsonString: string): { success: boolean; error?: string } {
    try {
      const parsedConfig = JSON.parse(jsonString);
      
      // 验证解析后的配置
      const tempConfig = this.config;
      this.config = { ...this.getDefaultConfig(), ...parsedConfig };
      
      const validation = this.validate();
      if (!validation.isValid) {
        this.config = tempConfig; // 恢复原配置
        return {
          success: false,
          error: `配置验证失败: ${validation.errors.join(', ')}`
        };
      }
      
      this.notifyListeners();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `配置解析失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 导出配置为文件
   */
  public async exportToFile(): Promise<{ success: boolean; error?: string }> {
    try {
      const configJson = this.toJSON();
      const blob = new Blob([configJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `wbs2tb-config-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: `导出配置失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }

  /**
   * 从文件导入配置
   * @param file 配置文件
   */
  public async importFromFile(file: File): Promise<{ success: boolean; error?: string }> {
    try {
      const text = await file.text();
      return this.fromJSON(text);
    } catch (error) {
      return {
        success: false,
        error: `导入配置失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }
}

// 创建全局配置管理实例
export const configManager = new RendererConfigManager();
