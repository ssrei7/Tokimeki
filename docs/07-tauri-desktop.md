# Tauri 桌面构建

Tokimeki 的桌面壳使用 Tauri 2。它复用同一套 React 静态前端、IndexedDB 数据和本地偏好，不增加后端或账号系统，也不改变 SaveFile schema。

## 当前范围

- 已提供 Windows/macOS/Linux 桌面工程骨架和开发、打包命令。
- 桌面图标由 `public/icons/icon-512.png` 生成。
- 默认窗口按移动端布局设置为 430 × 860，最小尺寸为 360 × 640，可自由缩放。
- 默认权限只有 Tauri `core:default`，没有文件系统、Shell、通知或任意原生命令权限。
- Content Security Policy 允许用户显式配置的 HTTP(S) Provider、外链图片和音频；不会自动联系任何固定第三方服务。

## 本机准备

安装与 Tauri 2 官方要求相符的 Rust stable 工具链和平台构建依赖。Windows 还需要 Microsoft C++ Build Tools 与 WebView2。首次成功执行 Cargo 构建后会生成 `src-tauri/Cargo.lock`，应将它提交到仓库以锁定 Rust 的传递依赖。

```text
npm install
npm run tauri:dev
npm run tauri:build
```

普通网页构建仍使用：

```text
npm run build
```

## Provider 与 CORS 边界

仅把网页装入 Tauri WebView 不会自动绕过所有 Provider 的 CORS。当前桌面骨架仍使用现有浏览器 `fetch`，因此行为与网页版本一致。要让桌面版直连被浏览器 CORS 拦截的用户端点，需要后续单独接入受权限约束的 Tauri HTTP 插件和统一 Provider 传输层；该能力在完成前不得宣称已支持。

原生 HTTP 适配仍必须遵守：

- 仅向用户显式配置的端点发起请求。
- API key 只保存在本机 Provider IndexedDB，并只进入对应请求。
- 查看、移动、读取已有内容、缓存命中和数据管理继续保持零 API。
- 网页版继续使用浏览器 `fetch`，不依赖 Tauri API。

## 尚未在当前环境验证的项目

当前开发环境没有 Rust/Cargo，因此本切片只验证前端构建、配置结构和 Tauri CLI 可发现性，尚未生成或运行原生安装包。完成 Rust 工具链安装后，应补充：

1. `cargo check --manifest-path src-tauri/Cargo.toml`
2. `npm run tauri:build`
3. Windows 安装、升级、IndexedDB 持久化和卸载行为
4. 原生 HTTP 适配完成后的 CORS 受阻 Provider 实测
