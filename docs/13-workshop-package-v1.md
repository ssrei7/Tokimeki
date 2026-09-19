# 创意工坊声明式包 v1

本文记录创意工坊声明式包与受限 UI 运行时的公开协议和安全边界。根目录 `AGENTS.md` 始终优先。

## 1. 当前能力

当前版本可在浏览器本地读取、校验、预览、安装、按世界启停、导出和卸载工坊包。当前世界已启用的包会作为动态图标出现在终端桌面；点击后由受限运行时渲染声明式页面。

运行时只开放包内导航、按 `saveId + packageId` 隔离的本地 App 状态，以及经包权限逐项声明的世界事实只读视图。规则、事件、op、Prompt 和 Provider 动作仍不会执行；相关按钮会保持禁用并说明尚未开放。

所有操作均为纯本地操作，不调用 Provider，不发起网络请求。包不包含 API key、Provider 配置、世界存档或游玩状态。

## 2. ZIP 结构

```text
manifest.json
app.json
rules.json
events.json       可选
prompts.json      可选
asset-meta.json   可选
assets/*          可选
```

根目录未知文件会被拒绝。资产只接受 PNG、JPEG 和 WebP；单个资产最大 5 MiB，总资产最大 20 MiB，最多 100 个资产。外链、SVG、base64、HTML、CSS 和脚本文件均不属于 v1 协议。

`manifest.json` 使用固定 `type: "workshop"`、`packageVersion: 1` 和 `runtimeVersion: 1`。包 ID、页面 ID、事件 ID、资产 ID 等稳定 ID 只使用 ASCII 字母、数字、点、下划线和连字符。包版本使用 `x.y.z`。

## 3. 受限组件与动作

`app.json` 可声明标题、正文、世界事实只读项、图片、卡片、列表、标签页、按钮、输入框、选择器、进度和确认框。动作只允许包内导航、本地 App 状态、提交已开放 op、触发包内事件和用户显式 Provider 文本动作。

v1 安装器会保存这些声明。受限运行时会将页面内容渲染为固定 React 组件，不解释 HTML 或 CSS，也不执行包内代码。任意代码、DOM 访问、自定义 CSS、动态 import、脚本 URL 和任意网络请求均没有协议入口。

标题、正文、图片、卡片、列表、标签页、按钮、输入框、选择器、进度和确认框均可显示。当前仅 `navigate` 与 `set-local` 动作可运行，并且运行时会再次检查权限、页面引用和本地状态值；`submit-op`、`trigger-event` 与 `provider-text` 均明确禁用。世界事实始终来自打开页面时的当前 `SaveFile` 快照，页面不能写回这些事实。

`rules.json` 只保存声明式条件和白名单动作；条件必须通过项目现有 expr-eval 安全语法检查。`events.json` 复用当前 EventDef schema，事件内 op 名必须属于工坊白名单，未来运行时仍须再次经过正式 op schema 校验。`prompts.json` 的单块预算上限为 1024，总预算上限为 4096。

## 4. 权限

权限采用固定 capability 和受限资源：

- `world.read`：逐项声明可读取的世界事实类别。
- `app.local-state`：仅限该包、该世界的本地界面状态。
- `navigation.local`：仅限包内页面导航。
- `op.submit`：逐个声明 op 名。
- `event.install` / `event.trigger`：逐个声明事件 ID。
- `prompt.register`：逐项声明任务及 token 预算。
- `provider.explicit-text`：逐项声明只能由用户显式触发的文本任务。

安装器会从包内容反向推导实际权限。使用但未声明的权限是错误；声明但未使用的权限是警告。权限声明永远不能绕过组件、动作、表达式、op 和引用校验。

## 5. 存储、世界绑定与卸载

- 包定义全局保存于 Content IndexedDB；当前 Content DB 版本为 v12。
- 启用状态以 `saveId + packageId` 按世界隔离。
- 本地 App 状态同样以 `saveId + packageId` 隔离，只允许最多 2000 字符的字符串、有限数值、布尔值或 `null`，不进入 SaveFile。
- 图片二进制保存于 Assets IndexedDB，包记录只保存 `AssetRef`。
- SaveFile 保持 v41，不保存工坊包、Provider 或本地编辑状态。

停用只改变当前世界绑定，并保留包定义、资产和本地 App 状态。全局卸载会显示受影响的世界数量并移除包定义及全部绑定；本地 App 状态与图片二进制继续保留，以免误删用户输入或缺少完整引用证明的用户资源。工坊资产引用已加入通用完整性检查和保守图片清理引用根。

相同包 ID 当前不允许覆盖。版本升级、降级、依赖解析、运行状态保护和全局备份将在后续独立切片实现。
