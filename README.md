# WBS2TB - Excel WBS 到 Teambition 桌面同步工具

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![Electron Version](https://img.shields.io/badge/electron-%5E30.0.0-blue.svg)](https://www.electronjs.org/)
[![Release](https://img.shields.io/github/v/release/dennischancs/wbs2tb-ts?include_prereleases)](https://github.com/dennischancs/wbs2tb-ts/releases)

**WBS2TB** 是一个功能强大的桌面应用程序，旨在帮助您将 Excel 中的 WBS (Work Breakdown Structure) 任务数据高效、准确地同步到 Teambition 项目中。本应用基于 Electron 和 TypeScript 构建，提供了原生应用的体验和安全性。

> **注意**: 此项目是原 `wbs2tb-js` Web 应用的后续桌面版本，现已完全迁移至 Electron，提供更稳定的性能和更安全的认证方式。

## ✨ 主要特性

- 🖥️ **原生桌面体验**: 基于 Electron，提供跨平台 (Windows, macOS, Linux) 的原生应用体验。
- 🔒 **安全的认证方式**: 使用 Electron 内置的 `session` 模块进行 Cookie 管理，替代了原有的 Puppeteer 方案，更加轻量、安全且无需打包浏览器。
- 📊 **精准的 Excel 解析**: 利用 SheetJS (xlsx) 库，准确读取 Excel 文件中的 WBS 数据。
- ⚡ **高效的同步引擎**: 支持批量创建和更新任务，可配置并发数和批处理大小，优化同步效率。
- 🛠️ **类型安全**: 全面的 TypeScript 类型定义，确保代码质量和可维护性。
- 🎨 **简洁直观的界面**: 简约的用户界面设计，操作流程清晰易懂。
- 🚀 **自动化构建与发布**: 通过 GitHub Actions 实现自动化构建、打包和发布，轻松获取最新版本。

## 📦 安装

您可以从 [GitHub Releases 页面](https://github.com/dennischancs/wbs2tb-ts/releases) 下载适用于您操作系统的最新安装包。

### 支持的平台

- **Windows**: `WBS2TB Setup x64.exe` (64位系统) / `WBS2TB Setup arm64.exe` (ARM架构设备)
- **macOS**: `WBS2TB-x64.dmg` (Intel芯片) / `WBS2TB-arm64.dmg` (Apple Silicon芯片)
- **Linux**: `WBS2TB-x86_64.AppImage` (64位系统)

## 🚀 开发指南

如果您想从源码构建或参与贡献，请遵循以下步骤：

### 环境要求

- [Node.js](https://nodejs.org/) >= 20.0.0
- [npm](https://www.npmjs.com/) 或 [yarn](https://yarnpkg.com/)

### 克隆仓库

```bash
git clone https://github.com/dennischancs/wbs2tb-ts.git
cd wbs2tb-ts
```

### 安装依赖

```bash
npm install
```

### 开发模式

启动开发服务器，主进程和渲染进程将同时运行。

```bash
npm run dev
```

### 构建应用

编译 TypeScript 代码并打包渲染进程资源。

```bash
npm run build
```

### 打包分发

构建并为所有平台生成可分发的安装包。

```bash
npm run dist
```

## 🧠 工作原理

WBS2TB 通过以下几个核心步骤实现数据同步：

1.  **安全认证**:
    *   应用启动后，用户可以通过点击“获取 Cookies”按钮，应用会打开一个内置的 Electron 浏览器窗口，导航至 Teambition 登录页面。
    *   用户在该窗口中完成登录后，应用的主进程会通过 `session.defaultSession.cookies.get()` API 自动获取与 `.teambition.com` 域名相关的认证 Cookies。
    *   这种方式避免了在用户浏览器中安装插件或使用外部自动化工具，提高了安全性和便捷性。

2.  **Excel 数据读取**:
    *   用户选择本地的 Excel 文件 (`.xlsx`, `.xls`)。
    *   应用读取指定工作表中的 WBS 任务数据，并将其解析为内部数据结构。

3.  **API 交互**:
    *   渲染进程将需要同步的任务数据通过 IPC (Inter-Process Communication) 发送到主进程。
    *   主进程作为代理，使用获取到的 Cookies 向 Teambition API 发起请求，创建或更新任务。
    *   所有网络请求都在主进程中完成，渲染进程不直接与外部 API 交互，增强了安全性。

4.  **状态反馈**:
    *   同步过程中的实时日志和最终结果会通过 IPC 从主进程发送回渲染进程，并展示给用户。

## 📁 项目结构

```
wbs2tb-ts/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 主进程入口，负责窗口创建和 IPC 通信
│   │   ├── preload.ts     # 预加载脚本，为主进程和渲染进程搭建安全桥梁
│   │   ├── cookieManager.ts # Electron Cookie 管理器，替代 Puppeteer
│   │   └── config.ts      # 主进程配置管理
│   ├── renderer/          # 渲染进程 (UI)
│   │   ├── index.html     # 主页面 HTML 结构
│   │   ├── styles.css     # 主页面样式
│   │   ├── apiClient.ts   # Teambition API 客户端逻辑
│   │   ├── config.ts      # 渲染进程配置状态管理
│   │   ├── dataProcessor.ts # Excel 数据解析与处理
│   │   ├── syncEngine.ts  # 任务同步逻辑
│   │   └── uiManager.ts   # UI 交互与状态管理
│   ├── shared/            # 主进程与渲染进程共享的代码
│   │   ├── types.ts       # TypeScript 类型定义
│   │   └── utils.ts       # 通用工具函数
│   └── assets/            # 应用资源文件
│       ├── icon.png       # 通用图标
│       ├── icon.ico       # Windows 图标
│       └── icon.icns      # macOS 图标
├── .github/workflows/     # GitHub Actions 工作流配置
│   └── release.yml        # 自动化发布流程
├── package.json           # 项目依赖与脚本配置
├── tsconfig.json          # TypeScript 编译配置
├── electron-builder.json  # Electron 应用打包配置
├── vite.config.ts         # Vite 开发服务器与构建配置
└── README.md             # 项目说明文档
```

## 🔧 技术栈

- **前端框架**: [Electron](https://www.electronjs.org/) (桌面应用框架)
- **编程语言**: [TypeScript](https://www.typescriptlang.org/) (JavaScript 的超集，提供静态类型)
- **构建工具**: [Vite](https://vitejs.dev/) (快速的前端构建工具)
- **打包工具**: [electron-builder](https://www.electron.build/) (Electron 应用打包和分发)
- **数据处理**: [SheetJS (xlsx)](https://sheetjs.com/) (Excel 文件读写)
- **API 通信**: 原生 `fetch` API (通过 IPC 代理)

## 🤝 贡献

我们欢迎任何形式的贡献！无论是报告 Bug、提出功能建议，还是直接提交代码。

1.  **Fork** 本仓库。
2.  创建您的特性分支 (`git checkout -b feature/AmazingFeature`).
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`).
4.  推送到分支 (`git push origin feature/AmazingFeature`).
5.  开启一个 **Pull Request**.

在提交代码前，请确保：
- 代码风格与项目保持一致。
- 所有测试（如果有）都能通过。
- 已更新相应的文档（如果需要）。

## 📄 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 📞 联系我们

如果您在使用过程中遇到任何问题，或有任何建议，欢迎通过以下方式联系我们：

- 提交 [GitHub Issue](https://github.com/dennischancs/wbs2tb-ts/issues)
- 查看 [Wiki](https://github.com/dennischancs/wbs2tb-ts/wiki) (如果有)

---

**WBS2TB Team** - 让项目管理更高效。
