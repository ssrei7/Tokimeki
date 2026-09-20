# 架构

本文件定义结构与协议。具体字段见 `02-data-model.md`，硬约束见 steering 铁律。

---

## 1. 两层划分

```
┌─────────────────────────────────────────┐
│  生成层 (AI)                             │
│  叙述文字 / 对白 / 话题文案 / NPC 填充     │
│  —— 输出文字 + ops 提议,不持有事实         │
└──────────────┬──────────────────────────┘
               │ ops (受校验)
┌──────────────▼──────────────────────────┐
│  确定性内核 (代码)                        │
│  时间 · 位置 · stats · flags · 物品       │
│  话题状态 · NPC 日程 · 关系轴 · 事件队列   │
│  —— 唯一事实来源,全部可序列化              │
└─────────────────────────────────────────┘
```

内核必须能在完全没有 AI 的情况下自洽运行：时间可推进、NPC 会按日程移动、事件会出队、结算能完成。AI 缺席时只是"没有文字"，不是"系统坏掉"。这是可测试性的基础，也是本项目防漂移的根本手段。

---

## 2. 一个回合的数据流

```
用户动作
  │
  ├─[纯本地分支] 移动 / 查看地图 / 翻手机 / 点已生成话题 / 读日记
  │    → 内核直接计算 → 渲染。不调 API。
  │
  └─[需要叙述分支]
       1. 内核收集事实快照 (WorldFacts)
       2. PromptAssembler 按 block 优先级与 token 预算拼装
       3. Provider 路由：按 task 选出 provider
       4. 流式输出正文 → 立即渲染
       5. 流结束 → 解析尾部 ops 块
       6. zod 校验 + 白名单过滤
       7. 内核 applyOps → 触发 onOpsApply 钩子
       8. diff 写入调试面板与当日日志
```

第 4 步与第 5 步必须解耦：**正文永远先落地**。ops 解析失败不得影响正文显示。

---

## 3. ops 协议

### 3.1 线格式

AI 在正文之后输出单个代码块：

​```
<ops>
[
  {"op":"add_stat","target":"seir","key":"intimacy","delta":3},
  {"op":"set_flag","key":"met_at_docks","value":true},
  {"op":"give_item","id":"violin_string","from":"seir"},
  {"op":"unlock_topic","id":"seir_violin_past"},
  {"op":"add_memory","target":"seir","text":"在码头听他提起小时候学琴"}
]
</ops>
​```


规则：
- 空数组合法，表示本回合无状态变更。
- 单次回复的 ops 数量上限（默认 12），超出截断并记录警告。
- ops 块不参与流式渲染，正文渲染时必须剥离。

### 3.2 解析容错（三级降级）

1. 严格 `JSON.parse`
2. 宽松修复：截取首个 `[`…最后一个 `]`、去尾逗号、修单引号、修未转义换行、剥 markdown 围栏
3. 二段式抽取：把原始回复交给 `extract_ops` 任务（可绑定便宜小模型），要求只输出 ops 数组

三级全败：**保留正文**，标记该回合 `opsFailed: true`，UI 显示"本回合未产生状态变更"，提供两个按钮——重试抽取、手动补录。禁止丢弃正文，禁止静默失败。

### 3.3 注册表

```ts
interface OpContext {
  world: WorldState;          // 可变引用,由内核提供
  actorId?: string;           // 当前对话主体
  day: number;
  slot: SlotId;
  nodeId: NodeId;
  log(msg: string): void;
}

interface OpResult {
  ok: boolean;
  changes: Change[];          // 供 diff 面板与结算页使用
  warning?: string;
}

interface OpDefinition<P> {
  op: string;
  schema: ZodType<P>;         // 校验即白名单
  apply(payload: P, ctx: OpContext): OpResult;
  describe(payload: P): string;   // 人类可读,用于 diff / 日记 / 结算页
  promptDoc: string;              // 注入 prompt 的一行说明
  clamp?: OpLimits;               // 单次变更幅度上限
}

registerOp(def: OpDefinition<any>): void;
```

要点：
- `promptDoc` 由注册表自动汇总生成 prompt 里的 ops 说明段。**新增 op 不需要手改 prompt 模板。**
- `clamp` 是必需的护栏：单次 stat 变更默认限幅（如 ±10），防止 AI 一句话把关系推到满值。超限时截断并记警告，不拒绝整个 op。
- 未注册的 op 名：丢弃 + 警告，不报错。
- op 必须幂等可描述，禁止在 `apply` 里发起 API 调用。

### 3.4 内置 op（按阶段登场）

| op | 阶段 | 说明 |
|---|---|---|
| `add_stat` / `set_stat` | 1 | 通用数值 |
| `set_flag` | 1 | 通用布尔 |
| `give_item` / `take_item` | 1 | 物品栏 |
| `add_memory` | 1 | 写入角色记忆 |
| `advance_time` | 2 | 推进时段 |
| `move_player` | 3 | 移动玩家（需边可达校验） |
| `reveal_node` | 3 | 解锁地点 |
| `move_npc` | 4 | 临时覆盖 NPC 位置（当日有效） |
| `set_mood` | 5 | 情绪词 + 衰减天数 |
| `adjust_relation_axis` | 5 | 按 AxisDef 限幅并刷新关系阶段 |
| `add_knot` / `resolve_knot` | 5 | 创建心结并按条件解决 |
| `offer_gift` | 5 | 按礼物偏好和关系上下文判定并消耗一件物品 |
| `unlock_topic` / `mark_topic_used` | 5 | 话题树 |
| `add_node_memory` | 5 | 地点痕迹 |
| `make_appointment` | 5 | 约定四元组 |
| `queue_event` | 7 | 向日历排程（导演专用） |
| `promote_npc` | 6 | 随机 NPC 转正 |
| `run_workshop_activity` | 工坊 | 内部活动调度；只组合已开放确定性效果，不向叙事 Provider 暴露 |

---

## 4. 事件总线

```ts
type Hook =
  | 'onDayStart' | 'onDaySettle'
  | 'onTimeAdvance'
  | 'onEnterNode'
  | 'onEncounter'
  | 'onDialogueEnd'
  | 'onOpsApply'
  | 'beforePromptAssemble';

subscribe<H extends Hook>(hook: H, fn: Handler<H>, priority?: number): Unsubscribe;
```

约定：
- 处理器同步、纯粹、可测试。需要异步（调 API）的逻辑只能**入队**，由内核在合适时机消费。
- 处理器不得直接改 `WorldState`，只能派发 ops 或返回意图对象。保持单一写入路径。
- 每个 feature 在自己的 `register.ts` 里挂钩子，`features/index.ts` 只做汇总注册。新功能 = 新目录，核心零改动。
- 公共扩展钩子以 `AGENTS.md` 白名单为准。离开地点通过 `onEnterNode` payload 中的 `fromNodeId/toNodeId` 表达；对话开始通过 `onEncounter` 或 `beforePromptAssemble` 表达；物品与数值变化统一从 `onOpsApply` 的 `Change[]` 观察，不新增独立公共钩子。

---

## 5. Prompt 组装器

### 5.1 Block

```ts
interface PromptBlock {
  id: string;
  role: 'system' | 'user' | 'assistant';
  priority: number;           // 越高越先保留,截断时后被裁
  order: number;              // 最终排列顺序,与优先级无关
  build(facts: WorldFacts): string | null;   // null = 本回合不注入
  truncate?(text: string, maxTokens: number): string;
  tasks?: TaskId[];           // 限定只在某些任务中启用
}
```

### 5.2 默认 block 与优先级

| block | priority | 内容 |
|---|---|---|
| `format_contract` | 100 | 输出格式与 ops 说明（由注册表自动生成） |
| `character_core` | 95 | 当前角色卡核心设定 |
| `relationship_state` | 90 | 阶段标签 + 情绪 + 处境 + 已 N 天未见 |
| `scene_now` | 88 | 天/时段/地点/天气/在场者 |
| `node_worldbook` | 80 | 当前节点绑定的世界书条目 |
| `node_memory` | 70 | 该地点的 3–5 条痕迹 |
| `char_memory` | 65 | 角色记忆条目 |
| `recent_diary` | 60 | 最近 7 天日记 |
| `milestones` | 55 | 重要事件里程碑 |
| `worldbook_keyword` | 50 | 关键词触发的世界书 |
| `chapter_summary` | 40 | 更早的压缩摘要 |
| `raw_history` | 20 | 当日原始对话 |

**位置注入优先于关键词注入**（`node_worldbook` 高于 `worldbook_keyword`）——这是本项目相对 ST 的实质改进。

### 5.3 Token 预算

```
总预算 = provider.contextWindow - maxOutputTokens - safetyMargin
```

按 priority 降序填充，超预算时对最低优先级 block 调用 `truncate`，仍不足则整块丢弃并记录。预算分配与实际裁剪结果必须出现在调试面板。

Token 估算用近似算法（中文按字符 ×0.7，英文按 ÷4）即可，不引入 tokenizer 依赖。

---

## 6. Provider 路由

### 6.1 任务枚举

```ts
type TaskId =
  | 'narrate_main'      // 主线剧情叙述
  | 'narrate_daily'     // 日常相遇对话
  | 'topic_tree'        // 一次性生成话题树
  | 'world_morning'     // 晨间世界更新(合并调用)
  | 'world_gen'         // 世界观生成
  | 'map_gen'           // 地图生成
  | 'npc_batch'         // 半正式 NPC 打包模拟
  | 'extract_ops'       // 二段式结构化抽取
  | 'summarize_day'     // 日记
  | 'summarize_chapter' // 章节压缩
  | 'workshop_draft'    // 用户 API 驱动的工坊 Agent 初稿与多轮修改
  | 'image' | 'tts';    // 阶段 10
```

配置两层：`Provider`（endpoint / key / model / 参数 / contextWindow）与 `binding`（TaskId → providerId）。未绑定的任务回落到 `default` provider。

工坊 Agent 在聊天文本之上使用 Provider 无关的应用层 JSON 工具协议。v1 每步只接受一次 `project.replace` 或 `project.patch`；完整替换参数必须通过 `WorkshopPackageSchema`，局部修改只支持至多 100 个 `add` / `replace` / `remove` JSON Pointer 操作，并在副本上原子应用后校验完整工程。本地执行器只产生待写入编辑器的候选草稿，不安装包、不写 SaveFile 或世界状态。请求组装时会纯本地执行 `capabilities.list` 与 `project.inspect`，将能力目录及当前工程的校验/结构摘要合并进同一次 Provider 请求；能力目录 v2 包含只读 UI 数据绑定的目标与精确语法，摘要不含正文、世界事实值、已安装包 ID 或资产二进制，也不增加网络调用。绑定运行时只从包内本地标量或逐项授权的世界安全快照取展示值，不能改变动作或世界事实。编辑器 Agent 另有页面级步骤、请求、单次/总输出 token 与安全余量预算：执行层在联网前近似计算完整输入，以 Provider 上下文窗口预检，并把本次输出限制收紧为 Provider、单次和剩余总预算的最小值。只有输出未通过 JSON、协议、patch、schema 或正式包校验时才顺序进入下一修复步，并携带本地错误和有界失败输出摘录；网络错误不重试，达到任一预算即停止，失败候选不进入编辑器。

`summarize_day` 只在一个游戏日首次完成结算后自动调用一次，不随行动次数增加；未配置 Provider、请求失败或返回空文本时保留确定性的本地事实摘要。当前没有其他夜间生成任务可合并，因此保持独立调用；阶段 6 的晨报发生在次日开始且使用不同事实边界，不与日记调用合并。

### 6.2 适配器

内置 OpenAI 兼容、Anthropic、Gemini。**必须同时提供通用适配器**：用户自填 URL、header 模板、请求体模板（含 `{{messages}}` `{{model}}` 等占位符）、响应取值路径（JSONPath）、流式分帧规则。这样新服务无需等发版。

适配器可选实现 `listModels` 能力：OpenAI 兼容与 Gemini 优先自动拉取，Anthropic 或 Generic 不支持时必须保留手动填写模型名的回退。连接测试与聊天请求都必须显式反馈 `idle → requesting → success/error` 状态，非标准流响应应回退到普通 JSON 解析，最终未得到文本时不得静默结束。

内置适配器接受“API 基础 URL”或完整请求端点：OpenAI 兼容渠道在基础 URL 后补 `/chat/completions`，模型列表使用同一基础 URL 的 `/models`；Gemini 按 model 补 `generateContent` / `streamGenerateContent`。模型列表请求必须复用该 Provider 的 key 与自定义 headers，且拉取模型时不得要求用户先填写模型名。

聊天请求状态细分为 `idle → requesting → generating → success/error`：从发出请求到首个可读文本前持续显示“等待回复”，首个文本到达后显示生成状态，成功结束后移除等待占位，错误必须在当前页面显示可读信息并同步写入 Raw 调试标签。

### 6.3 CORS

浏览器直连有厂商限制。必须做：
- Anthropic 请求自动附加 `anthropic-dangerous-direct-browser-access: true`
- 每个 provider 提供「连接测试」按钮，把失败区分为 CORS 拦截 / 401 / 404 / 超时 / 响应格式不符，并给出可读建议
- 文档说明限制与替代方案（OpenRouter 等允许直连的中转、后期 Tauri 桌面版）

Key 只存 IndexedDB，UI 明示"请勿在公共设备使用"。禁止把 key 写入导出文件（导出时剔除，或提供显式勾选）。

---

## 7. 存档与迁移

```ts
interface SaveFile {
  schemaVersion: number;
  // ... 详见 02-data-model.md
}

type Migration = (save: any) => any;
const migrations: Record<number, Migration>;   // key = 目标版本

function migrate(save: any): SaveFile {
  let v = save.schemaVersion ?? 0;
  while (v < CURRENT_VERSION) {
    save = migrations[v + 1](save);
    v += 1;
    save.schemaVersion = v;
  }
  return SaveFileSchema.parse(save);
}
```

规则：
- 迁移函数只前向，永不修改已发布的历史迁移。
- 每条迁移配单元测试：给一份旧版 fixture，断言迁移后通过当前 schema 校验。
- 版本高于当前程序：拒绝加载并提示升级，不尝试降级。
- 结算时自动快照（保留策略：最近 N 天全量 + 每章一份）。

存档与可回装资料包导出格式为 zip：`save.json` + `assets/` + `manifest.json`。角色包、世界包、事件定义包可按 `manifest.type` 区分；玩家亲历剧情另提供独立 Markdown 事件档案，不携带可执行规则。

---

## 8. 目录结构

```
src/
  core/
    time/          时段推进 · 日历 · 结算触发
    state/         WorldState · store · 单一写入路径
    ops/           注册表 · 解析 · 校验 · clamp · diff
    events/        事件总线
    prompt/        block 注册表 · 组装器 · token 预算
    expr/          安全表达式求值 · 条件与 effect
  data/
    db.ts          Dexie
    schema/        zod 定义
    migrations/    迁移 + fixtures
    assets/        资产存取 · 降采样
    io/            zip 导入导出
  providers/
    adapters/      openai · anthropic · gemini · generic
    router.ts      TaskId → provider
    stream.ts      流式解析
  features/
    map/  encounter/  topics/  relationship/  diary/
    morning/  director/  economy/  phone/  gifts/
      每个 feature: register.ts(挂钩子) · ops.ts · blocks.ts · ui/
  ui/
    components/  theme/  debug/
```

`core/` 不得 import `features/`。依赖方向单向：`features → core`。

`core/` 同时是浏览器应用与无头调参台共享的确定性内核，必须能直接在 Node 环境运行：不得访问 DOM、IndexedDB 或网络。持久化适配放在 `data/`，Provider 与 AI 调用放在 `providers/`；批量模拟只向 core 注入动作策略、固定 seed 与本地 provider，不复制另一套规则。

### 8.1 UI 壳层基线（手机竖屏优先）

- 默认入口是地图视图；地图、地点卡片/抽屉与底部导航构成地图 App 式信息架构，聊天不是独占首页。
- 以 360–430 CSS px 竖屏为首要断点，宽屏通过响应式布局扩展；不得依赖 hover，主要触控目标至少 44 CSS px，并处理浏览器安全区。
- 提供 PWA manifest 与 `display: standalone` 配置，支持添加到主屏幕后全屏启动；同时保留普通标签页入口，离线缓存不作为本阶段前置条件。
- `ui/components` 提供可替换插槽（地图、顶部状态栏、可上拉卡片、底部标签栏、聊天面板）；阶段 4 前只保证结构与 CSS 变量，不做装饰性视觉定稿。
- 该壳层只规定导航与布局，不改变 D4 的 SVG graph/hotspot 地图数据协议。
- 阶段 0 的底部一级导航为“地图 / 聊天 / 资料 / 设置”。Provider 管理独占设置页，不与聊天纵向堆叠；调试面板保留到正式版，但收纳在“设置 → 高级与调试”且默认折叠，不再提供重复的顶栏入口。

### 8.2 聊天输入语义

- `发送消息` 只把当前文本追加到该角色的聊天记录，不调用 API；允许连续发送多条用户消息。
- `生成回复` 对最后一条助手回复之后的全部待回复用户消息发起一次合并请求；输入框仍有文本时先纳入本次请求。输入框为空时，已有待回复消息则合并生成，已有完整对话则请求角色继续回复。
- 不让单个“发送”按钮同时隐式表示追加与生成。用户消息在网络请求前即写入 IndexedDB，流式内容持续保存，请求失败时保留待回复消息以便重试。

---

## 9. 调试面板（阶段 0 就要有）

四个标签，缺一不可：
1. **Prompt** — 最终拼装结果，按 block 分组可折叠，显示各块 token 数与是否被裁
2. **Raw** — 原始回复全文（含被剥离的 ops 块）
3. **Ops** — 解析结果、校验失败项、clamp 触发、状态 diff（前后对照）
4. **State** — WorldState 树形查看器 + 手动改值入口

理由：本项目主要成本在 prompt 调试与参数手感，不是写代码。这个面板决定你的迭代速度。

调试面板是正式版的高级诊断能力，不是仅在开发构建中存在的临时页面；默认折叠，普通用户无需进入。

---

## 10. 红线

- 移动、查看、翻手机、点已生成话题：**零 API 调用**
- 每游戏日的 API 调用量应与"玩家实际互动次数"成正比，与 NPC 数量无关
- 内核任何函数不得直接发起网络请求
- `core/` 不依赖 DOM 或 IndexedDB；同一套内核必须可由 Node/Vitest/CLI 无头运行
- 除 `core/state` 的写入函数外，任何地方不得直接改 `WorldState`
