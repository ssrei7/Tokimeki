# 创意工坊声明式包 v1

本文记录创意工坊声明式包与受限 UI 运行时的公开协议和安全边界。根目录 `AGENTS.md` 始终优先。

## 1. 当前能力

当前版本可在浏览器本地读取、校验、预览、安装、按世界启停、导出和卸载工坊包。当前世界已启用的包会作为动态图标出现在终端桌面；点击后由受限运行时渲染声明式页面。

运行时开放包内导航、按 `saveId + packageId` 隔离的本地 App 状态、经包权限逐项声明的世界事实只读视图，以及首个确定性活动子集。事件、Prompt、Provider 和未开放 op 仍不会执行；相关按钮会保持禁用并说明边界。

工坊页提供纯本地声明式编辑器。用户可以新建安全模板，或把已经导入并通过 ZIP 边界检查的包载入编辑器；完整包 JSON 每次变更都会重新经过 schema、权限、引用、已安装 ID 和资产载荷一致性检查，并使用同一受限运行时实时预览。草稿不会自动保存或覆盖已安装包，只有用户显式点击导出或确认安装才产生结果。

工坊页也可由用户填写自然语言需求并显式点击一次“生成并送入编辑器”。初稿请求只包含固定协议和用户需求，返回内容先通过包 schema 与初稿子集限制，再进入编辑器。

编辑器内提供用户 API 驱动的多轮工坊 Agent。每次用户显式发送指令时，最多调用一次同一 `workshop_draft` 路由，携带当前工程源码、最近 8 条对话和最多 100 条本地校验诊断。Agent 可返回完整 workshop v1 工程，包括页面、规则、事件和 Prompt 声明；结果仍须通过严格 schema 并回到本地校验/预览，尚未开放的运行能力不会因 AI 输出而生效。当前不自动重试、不自动修复、不自动安装，并允许撤销上一次 Agent 修改。

Agent v1 使用 Provider 无关的应用层 JSON 工具协议；不要求端点支持厂商专属 function calling。新响应必须采用以下结构，且目前恰好只能调用一次 `project.replace`：

```json
{
  "protocolVersion": 1,
  "message": "已按要求更新工程。",
  "toolCalls": [
    {
      "id": "replace-project",
      "name": "project.replace",
      "arguments": {
        "package": {
          "manifest": {
            "type": "workshop",
            "packageVersion": 1,
            "runtimeVersion": 1,
            "id": "sample.app",
            "name": "示例",
            "author": "User Agent",
            "version": "1.0.0",
            "permissions": []
          },
          "app": {
            "entryPageId": "home",
            "pages": [
              {
                "id": "home",
                "title": "首页",
                "components": [{ "kind": "text", "text": "示例" }]
              }
            ]
          },
          "rules": { "rules": [] }
        }
      }
    }
  ]
}
```

调用 ID 只能使用 1–64 个 ASCII 字母、数字、点、下划线或连字符。协议拒绝未知工具、多次调用、额外字段、错误版本和不符合 `WorkshopPackageSchema` 的工程。`project.replace` 只替换当前页面内的草稿，不安装、不持久化、不修改世界事实，也不会触发新的网络请求。为兼容已配置模型，旧 `{ "message", "package" }` 和裸包响应暂时仍可解析；新提示只要求 v1 工具协议。局部 patch、校验/预览工具和多步循环尚未开放。

每次 Agent 请求组装时，本地会先执行一次只读 `capabilities.list`，并把结果放入用户消息的 `capabilityQuery`：

```json
{
  "capabilityQuery": {
    "name": "capabilities.list",
    "result": {
      "catalogVersion": 1,
      "packageVersion": 1,
      "runtimeVersion": 1,
      "ui": { "components": [], "actions": {} },
      "worldRead": {},
      "activities": {},
      "declaredOnly": {},
      "assets": {},
      "prohibited": []
    }
  }
}
```

实际数组和限制由当前 schema/runtime 常量生成，示例中的空值只是结构缩写。目录会区分已启用动作、带条件的活动调度、当前禁用动作和只声明不运行的扩展。查询纯本地、零写入，不读取 SaveFile、已安装包、IndexedDB、Provider 配置或密钥，并与当前用户指令合并成同一次 API 请求；因此不会为“查能力”增加第二次调用。局部 patch、校验/预览工具与自动工具循环仍未开放。

除用户显式触发的初稿生成与 Agent 指令外，工坊导入、编辑、校验、预览、安装、启停、导出和运行均为纯本地操作。Agent 请求不包含 SaveFile、已安装包、世界游玩状态或其他库内容；API key 只按现有 Provider 规则作为鉴权信息发送到用户配置的端点。

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
