# 创意工坊声明式包 v1

本文记录创意工坊声明式包与受限 UI 运行时的公开协议和安全边界。根目录 `AGENTS.md` 始终优先。

## 1. 当前能力

当前版本可在浏览器本地读取、校验、预览、安装、按世界启停、导出和卸载工坊包。当前世界已启用的包会作为动态图标出现在终端桌面；点击后由受限运行时渲染声明式页面。

运行时开放包内导航、按 `saveId + packageId` 隔离的本地 App 状态、经包权限逐项声明的世界事实只读视图，以及首个确定性活动子集。事件、Prompt、Provider 和未开放 op 仍不会执行；相关按钮会保持禁用并说明边界。

工坊页提供纯本地声明式编辑器。用户可以新建安全模板，或把已经导入并通过 ZIP 边界检查的包载入编辑器；完整包 JSON 每次变更都会重新经过 schema、权限、引用、已安装 ID 和资产载荷一致性检查，并使用同一受限运行时实时预览。草稿不会自动保存或覆盖已安装包，只有用户显式点击导出或确认安装才产生结果。

工坊页也可由用户填写自然语言需求并显式点击一次“生成并送入编辑器”。该按钮只调用一次 `workshop_draft` 文本任务，不自动重试；请求内容只包含固定声明式协议和用户填写的需求，不包含 SaveFile、已安装包、预览状态或其他用户资料。返回内容必须先通过包 schema 与 AI 草稿子集限制，再进入同一编辑器完成权限、冲突与引用校验，不会自动安装。

除这一次用户显式触发的草稿生成外，工坊导入、编辑、预览、安装、启停、导出和运行均为纯本地操作。包不包含 API key、Provider 配置、世界存档或游玩状态；API key 只按现有 Provider 规则作为鉴权信息发送到用户配置的端点。

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

标题、正文、图片、卡片、列表、标签页、按钮、输入框、选择器、进度和确认框均可显示。`navigate` 与 `set-local` 可直接运行；`submit-op` 目前只开放内部 `run_workshop_activity`，且按钮只能引用包内 `manual` 规则。`trigger-event`、`provider-text` 和其他直接 op 按钮仍禁用。世界事实视图始终来自当前 `SaveFile`，只有通过活动内核复核的效果才能写回。

AI 草稿通道进一步收窄：只接受无资产的 manifest / app / 空 rules，只允许受限页面组件、`navigate`、`set-local`，以及 `world.read`、`app.local-state`、`navigation.local` 权限。事件、Prompt、图片、非空规则和其他动作即使符合完整包 schema，也会在进入编辑器前被拒绝；用户仍可在纯本地编辑器中手工查看完整协议，但未开放动作保持禁用。

`rules.json` 只保存声明式条件和白名单动作；条件必须通过项目现有 expr-eval 安全语法检查。当前 `hook` 只允许 `manual` 或 `onEnterNode`，效果只允许 `add_stat`、`set_flag`、`give_item`、`take_item`。整组效果先在克隆世界上通过正式 op schema 与限幅，任一项失败则不写入；`once` 和 `cooldownDays` 使用命名空间化的通用 flags/stats 记录。`events.json` 复用当前 EventDef schema，但尚不安装或执行。`prompts.json` 的单块预算上限为 1024，总预算上限为 4096，但尚不注册。

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

编辑草稿只存在于当前页面内，不进入 SaveFile、Content IndexedDB 或全局备份。导入包携带的本地图片可在编辑时预览并随草稿重新导出或安装；编辑器本身暂不提供新增二进制资产入口。关闭页面前应显式导出或安装需要保留的草稿。

相同包 ID 当前不允许覆盖。版本升级、降级、依赖解析、运行状态保护和全局备份将在后续独立切片实现。
