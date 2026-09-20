# 创意工坊声明式包 v1

本文记录创意工坊声明式包与受限 UI 运行时的公开协议和安全边界。根目录 `AGENTS.md` 始终优先。

## 1. 当前能力

当前版本可在浏览器本地读取、校验、预览、安装、按世界启停、导出和卸载工坊包。当前世界已启用的包会作为动态图标出现在终端桌面；点击后由受限运行时渲染声明式页面。

运行时开放包内导航、按 `saveId + packageId` 隔离的本地 App 状态、经包权限逐项声明的世界事实只读视图、确定性活动子集、用户显式触发的包内声明式事件、有预算 Prompt，以及用户点击后单次调用的文本 Provider 动作。未开放 op 仍不会执行；相关按钮会保持禁用并说明边界。

工坊页提供纯本地声明式编辑器。用户可以新建安全模板，或把已经导入并通过 ZIP 边界检查的包载入编辑器；完整包 JSON 每次变更都会重新经过 schema、权限、引用、已安装版本和资产载荷一致性检查，并使用同一受限运行时实时预览。草稿不会自动保存或覆盖已安装包，只有用户显式点击导出、确认安装或确认更新才产生结果。

工坊页也可由用户填写自然语言需求并显式点击一次“生成并送入编辑器”。初稿请求只包含固定协议和用户需求，返回内容先通过包 schema 与初稿子集限制，再进入编辑器。

编辑器内提供用户 API 驱动的多轮工坊 Agent。每次用户显式发送指令时先调用一次同一 `workshop_draft` 路由，携带当前工程源码、最近 8 条对话和最多 100 条本地校验诊断。Agent 可返回完整 workshop v1 工程，包括页面、规则、事件和 Prompt 声明；结果仍须通过严格 schema、权限/引用/条件完整校验并回到本地预览，尚未开放的运行能力不会因 AI 输出而生效。只有结果被这些本地校验拒绝时，才会在用户设定的步骤、请求和 token 预算内自动追加修复请求；网络错误不重试。当前不自动安装，并允许撤销上一次成功的 Agent 修改。

编辑器可为当前页面配置 Agent 运行预算：最大步骤数、最大 API 请求数、单次输出 token、总输出 token 和上下文安全余量。请求前按“中文字符 × 0.7、其他字符 ÷ 4”近似估算完整输入；若超过 `Provider contextWindow - 有效输出上限 - safetyMargin`，先纯本地无损压缩有效工程 JSON，再按需移除最旧对话、截短失败输出摘录和省略部分 inspection 诊断正文。完整工程不做有损截断，仍超限才会在联网前拒绝。有效输出上限取 Provider 配置、单次上限和剩余总上限的最小值，并实际覆盖每一步适配器参数。整个动作最多顺序调用 `min(maxSteps, maxRequests)` 次 API，任一上限为 1 时不会追加修复；预算不持久化，界面只显示近似 token 与请求用量，不估算货币价格。

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

调用 ID 只能使用 1–64 个 ASCII 字母、数字、点、下划线或连字符。协议拒绝未知工具、多次调用、额外字段、错误版本和不符合 `WorkshopPackageSchema` 的工程。`project.replace` 只产生候选内存草稿，不安装、不持久化、不修改世界事实。为兼容已配置模型，旧 `{ "message", "package" }` 和裸包响应暂时仍可解析；新提示只要求 v1 工具协议。若候选违反协议、patch、schema 或正式包校验，执行器可在预算内把错误和失败输出摘录反馈给同一用户端点再次修复；失败候选不会替换编辑器内容。

小范围修改应使用 `project.patch`，避免重复返回完整工程：

```json
{
  "protocolVersion": 1,
  "message": "已更新首页标题并增加说明。",
  "toolCalls": [
    {
      "id": "patch-project",
      "name": "project.patch",
      "arguments": {
        "operations": [
          { "op": "replace", "path": "/app/pages/0/title", "value": "新首页" },
          { "op": "add", "path": "/manifest/description", "value": "示例 App" }
        ]
      }
    }
  ]
}
```

patch 只允许 `add`、`replace`、`remove`，单次最多 100 项；路径必须是绝对 JSON Pointer，并位于 `manifest`、`app`、`rules`、`events`、`prompts`、`assetMeta` 下。数组 `add` 可用 `-` 追加；`replace` / `remove` 必须指向已存在位置。空路径段、非法 `~` 转义、数组越界、缺失父路径、`__proto__` / `prototype` / `constructor` 均拒绝。所有操作先应用于当前工程副本，最后重新通过完整包 schema；任一步失败则不产生新草稿。当前源码不是有效 JSON 时不能 patch，应使用 `project.replace`。

每次 Agent 请求组装时，本地会先执行一次只读 `capabilities.list`，并把结果放入用户消息的 `capabilityQuery`：

```json
{
  "capabilityQuery": {
    "name": "capabilities.list",
    "result": {
      "catalogVersion": 8,
      "packageVersion": 1,
      "runtimeVersion": 1,
      "ui": { "components": [], "bindings": {}, "actions": {} },
      "worldRead": {},
      "activities": {},
      "dependencies": {},
      "declaredOnly": {},
      "assets": {},
      "prohibited": []
    }
  }
}
```

实际数组和限制由当前 schema/runtime 常量生成，示例中的空值只是结构缩写。目录会区分 UI 绑定语法、已启用动作、带条件的活动调度、当前禁用动作和只声明不运行的扩展。查询纯本地、零写入，不读取 SaveFile、已安装包、IndexedDB、Provider 配置或密钥，并与当前用户指令合并成同一次 API 请求；因此不会为“查能力”增加第二次调用。本地拒绝候选后的修复请求仍受步骤、请求和 token 预算约束。

同一请求还会携带本地 `project.inspect` 结果：

```json
{
  "inspectionQuery": {
    "name": "project.inspect",
    "result": {
      "inspectionVersion": 1,
      "status": {
        "syntaxValid": true,
        "schemaValid": true,
        "validationPassed": true,
        "previewAvailable": true,
        "canExport": true
      },
      "diagnostics": [],
      "diagnosticCounts": { "total": 0, "error": 0, "warning": 0, "info": 0 },
      "diagnosticsTruncated": false,
      "requiredPermissions": [],
      "requiredPermissionCount": 0,
      "requiredPermissionsTruncated": false,
      "preview": {
        "package": { "id": "sample.app", "name": "示例", "version": "1.0.0" },
        "entryPageId": "home",
        "pages": [],
        "totals": {},
        "actionCounts": {},
        "ruleHookCounts": {}
      }
    }
  }
}
```

inspection 复用编辑器的 JSON、schema、权限、引用和资产载荷分析，诊断最多 100 条、所需权限最多 200 项；原始总数、分级计数和是否截断会另行标明，截断不会把整体校验状态误报为通过。预览只概括包身份、入口页、页面 ID/标题、组件与动作计数、规则 hook 以及 events/prompts/assets 数量，不发送组件正文、表单值、世界事实值或资产载荷；本机已安装包 ID 冲突也会在发送前过滤。它纯本地生成并合并进同一次用户请求，不增加 API 调用，也不会在 Agent 修改后自动启动第二轮。

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

可选 `dependencies` 最多声明 50 个工坊包依赖；`minVersion` 是包含式最低版本，`maxVersionExclusive` 是排除式最高版本，两者都可省略：

```json
{
  "dependencies": [
    {
      "id": "shared.crafting-core",
      "minVersion": "1.2.0",
      "maxVersionExclusive": "2.0.0"
    }
  ]
}
```

重复依赖、自依赖、最低版本不低于排除式最高版本、缺包、版本不兼容和依赖环都会阻止安装或更新。系统不会根据依赖声明访问网络，也不会自动下载、安装、升级或启用其他包。

## 3. 受限组件与动作

`app.json` 可声明标题、正文、世界事实只读项、图片、卡片、列表、标签页、按钮、输入框、选择器、进度和确认框。动作只允许包内导航、本地 App 状态、提交已开放 op、触发包内事件和用户显式 Provider 文本动作。

v1 安装器会保存这些声明。受限运行时会将页面内容渲染为固定 React 组件，不解释 HTML 或 CSS，也不执行包内代码。任意代码、DOM 访问、自定义 CSS、动态 import、脚本 URL 和任意网络请求均没有协议入口。

标题、正文、图片、卡片、列表、标签页、按钮、输入框、选择器、进度和确认框均可显示。`navigate` 与 `set-local` 可直接运行；`submit-op` 目前只开放内部 `run_workshop_activity`，且按钮只能引用包内 `manual` 规则。`trigger-event` 可由已安装且启用的包显式触发同包事件。`provider-text` 只有在已安装 App 内由用户点击按钮时才调用一次用户配置的文本 Provider；其他直接 op 按钮仍禁用。世界事实视图始终来自当前 `SaveFile`，只有通过确定性内核复核的效果才能写回。

标题/正文、卡片标题与正文、列表项、按钮文案、进度标签/数值/上限，以及确认按钮文案/提示可声明统一的只读数据绑定。静态字段始终保留为绑定缺失、类型不符或运行时权限被撤销时的回退：

```json
{
  "kind": "text",
  "text": "尚未填写备注",
  "binding": {
    "source": "local",
    "key": "note",
    "format": "text"
  }
}
```

```json
{
  "kind": "progress",
  "label": "体力",
  "value": 0,
  "valueBinding": {
    "source": "world",
    "resource": "player.stats",
    "path": ["energy"],
    "format": "number",
    "fallback": 0
  },
  "max": 100
}
```

`local` 只能读取当前 `saveId + packageId` 下的标量 App 状态，并要求 `app.local-state`；`world` 只能读取 manifest 已逐项声明的 `world.read` 安全快照。`path` 是最多 8 段的字符串/非负整数数组，拒绝 `__proto__`、`prototype` 和 `constructor`，不执行表达式、模板、JSONPath 或代码。格式只允许 `auto`、`text`、`number`、`boolean`、`json`，可加固定 `prefix` / `suffix` 和标量 `fallback`。列表最多显示 100 项、单项最多 1000 字符，其他绑定文本最多 10000 字符。

世界安全快照只包含对应权限内的展示事实：时间的 day/slotId，世界或玩家 stats/flags，玩家名称与身份 ID，当前位置 ID/名称，背包的物品 ID/名称/数量，地图地点与区域 ID/名称，正式角色 ID/名称，关系阶段与通用关系轴，以及事件/经济的计数和默认货币摘要。绑定无法访问完整 SaveFile、对话、Provider、密钥、二进制或任意未声明资源；也不能改变动作 payload 或写入世界事实。

AI 草稿通道进一步收窄：只接受无资产的 manifest / app / 空 rules，只允许受限页面组件、`navigate`、`set-local`，以及 `world.read`、`app.local-state`、`navigation.local` 权限。事件、Prompt、图片、非空规则和其他动作即使符合完整包 schema，也会在进入编辑器前被拒绝；用户仍可在纯本地编辑器中手工查看完整协议，但未开放动作保持禁用。

`rules.json` 只保存声明式条件、成本、结果文案和白名单动作；条件必须通过项目现有 expr-eval 安全语法检查。当前 `hook` 只允许 `manual`、`onEnterNode`、`onTimeAdvance` 或 `onDaySettle`，效果只允许 `add_stat`、`set_flag`、`give_item`、`take_item`。

成本与结果示例：

```json
{
  "id": "craft-chair",
  "hook": "manual",
  "costs": [
    { "kind": "stat", "target": "player", "key": "energy", "amount": 2, "minimumAfter": 0 },
    { "kind": "item", "id": "wood", "count": 1 }
  ],
  "actions": [
    { "type": "submit-op", "op": "give_item", "payload": { "id": "chair", "count": 1 } }
  ],
  "result": {
    "success": "椅子制作完成。",
    "failure": "现在还不能制作。"
  }
}
```

`stat` 成本只接受通用 `player/world stats` 键，单项 `amount` 最大 10，可用 `minimumAfter` 指定扣除后的最低值；同一键的多项成本会先聚合，不能靠拆分绕过余额检查。`item` 成本单项最多 99。成本对应的 `add_stat` / `take_item` 必须逐项声明 `op.submit` 权限。所有成本与效果先在克隆世界中通过正式 op schema 与限幅，任一成本不足或效果失败都不会写回；不消耗时间或行动点。`result.success` 只在整组提交成功后显示，`result.failure` 会与内核真实拒绝原因一起显示，不能改变结算事实。`once` 和 `cooldownDays` 继续使用命名空间化的通用 flags/stats 记录。

`manual` 只由用户按钮显式触发；`onEnterNode` 在玩家到场后触发；`onTimeAdvance` 使用事件给出的结算前日期、目标时段与当前位置；`onDaySettle` 使用正在结算的日期和当前时段/地点。自动活动均为纯本地执行，并在成功后统一发出 `onOpsApply` 变更通知。当前不开放 `onDayStart`、`onEncounter` 或 `onDialogueEnd`，因为其 payload 没有确定性活动所需的世界上下文；不开放 `onOpsApply` 活动以避免递归，也不把 `beforePromptAssemble` 用作状态写入钩子。

`events.json` 复用当前 EventDef schema。启用包时，运行时会检查地点、时段、角色、关系阶段、证物引用和事件 ID 冲突，再把事件以包来源标记同步到当前世界；工坊副本的 `weight` 固定为 0，不进入导演随机池。页面的 `trigger-event` 只能引用同包事件，并同时具备对应 `event.install` 与 `event.trigger` 权限。事件仍服从当前地点/时段、角色在场、关系阶段、条件、once 与 cooldown；事件本体和 choice 的 ops 必须来自能力目录公开的原子安全白名单、逐项声明 `op.submit`，并在隔离世界副本上全部成功后才连同历史原子写回。会在执行中广播其他流程钩子的 `advance_time`、`move_player`、`move_npc`，跨事件排程 `queue_event`，以及内部 `run_workshop_activity` 均不开放。停用包会移除其事件定义与待触发排程，不回滚已提交事实或删除历史。纯 prompt 事件不会暗中调用 API，当前明确拒绝执行。

`prompts.json` 当前只把 `narrate_main` 与 `topic_tree` 自动注册到统一 PromptAssembler；其他受支持文本任务只能作为同包显式 `provider-text` 动作的 Prompt。每个 block 必须逐项声明 `prompt.register:<task>`；单块 `tokenBudget` 上限为 1024，同包所有块的声明预算总和上限为 4096，并且不能超过 manifest 中 `prompt.register.maxTokens` 的合计。包块 ID 在运行时转换为 `workshop:<packageId>:<blockId>`，不会覆盖内置块或其他包。静态 `text` 不执行模板替换；`when` 只可读取 `day`、`slotId`、`nodeId`、世界/玩家 stats 与 flags，以及关系的 `stageId` / `axes`，对应世界事实必须另行声明 `world.read`。条件异常时跳过该块。文本先按自身预算本地裁剪，再进入现有全局上下文预算；只有用户原本触发叙事或话题树生成时才随同一次请求发送，启用、停用、浏览包或查看已有内容都不会调用 API。停用包会立即注销自动块。

`provider-text` 动作使用 `taskId` 与 `promptBlockId`，可选 `inputKey` 和 `resultKey`。它必须逐项声明 `provider.explicit-text:<task>`，所引用 Prompt 必须包含同一任务并由 `prompt.register:<task>` 授权；使用任一 key 时还必须声明 `app.local-state`。`inputKey` 只读取该包、当前世界下最多 2000 字符的本地标量，不读取完整 SaveFile、聊天、其他包状态或 Provider 密钥；Prompt 的 `when` 仍只看到前述授权安全条件副本。点击后按现有任务路由选择用户自己的 Provider，每次点击最多一次请求，不后台运行、不自动重试，并在联网前检查 Provider 上下文窗口。固定系统契约明确响应只能作为展示文本，不能改变世界事实。返回内容不会解析或应用 `<ops>`；可在页面显示，并可把前 2000 字符写入 `resultKey`，供已有本地绑定继续展示。关闭 App 不取消已保存的本地结果，停用包保留本地状态。

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

依赖按“全局安装版本 + 世界启用状态”双层检查。安装并启用新包时，完整依赖链必须已经安装为兼容版本并在当前世界启用；更新包时，对它已经启用的每个世界执行相同检查。启用会再次检查依赖；若当前世界仍有已启用的直接依赖方，依赖包不能停用。只要仍有任何已安装直接依赖方，全局卸载就会被阻止；必须按依赖方到依赖项的顺序停用或卸载。更新依赖项也不能超出已有依赖方声明的版本区间。运行时会再次按拓扑顺序筛选启用包；缺失、版本错误、传递依赖不可用或成环时，相关包不会进入 UI、活动、事件或 Prompt 运行集合。

同 ID 包可以由 ZIP 导入或编辑器草稿显式更新。更新版本必须严格高于已安装的 `x.y.z`，同版本和降级都会在写入前拒绝；确认框会列出版本变化、世界绑定数量、权限增减、作者/名称变化和资源保留范围。更新保留全部世界绑定及其 enabled 状态、按 `saveId + packageId` 隔离的本地 App 状态和原始 `installedAt`，不会把包自动启用到新世界。

新版图片先以全新资产 ID 写入，随后才在 Content IndexedDB 单表事务中核对预期旧版本并替换包记录。替换失败会删除本轮新资产，旧包、绑定和本地状态不变；更新成功后旧二进制仍保守保留，等待后续完整性审计确认是否可清理。更新为纯本地操作，不调用 Provider。

编辑草稿只存在于当前页面内，不进入 SaveFile、Content IndexedDB 或全局备份。导入包携带的本地图片可在编辑时预览并随草稿重新导出或安装；编辑器本身暂不提供新增二进制资产入口。关闭页面前应显式导出或安装需要保留的草稿。

全局备份 v5 会同时保存工坊包记录、世界绑定、本地 App 状态和 Assets IndexedDB 中的二进制；v1–v4 旧备份缺失这些字段时按空数组读取。导入预览与设置页的本地完整性检查复用只读审计器，检查包记录、依赖、绑定、状态复合 ID、资产声明/映射及实际二进制。普通损坏记录会保留并明确提示，由运行时失败关闭不可用包；重复主键因恢复时必然覆盖数据而拒绝导入。卸载后保留的本地 App 状态只计数，不视为错误；审计不会自动修复或删除用户资源。
