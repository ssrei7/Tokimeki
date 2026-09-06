# 数据模型

本文件定义类型。协议与结构见 `01-architecture.md`，取舍理由见 `04-decisions.md`。
所有类型必须有对应 zod schema（`data/schema/`）。字段增删必须同时提交 migration。

---

## 0. 约定

```ts
type Id = string;
type NodeId = Id;   type CharId = Id;   type SlotId = Id;
type ItemId = Id;   type AxisId = string;
type Condition = string;   // expr-eval 表达式,禁止 eval
```

- ID 用 `kebab-case`，人可读，创建后不可变（重命名只改 `name`）。
- 一切数值走 `Record<string, number>`，一切布尔走 `Record<string, boolean>`。禁止新增业务专用数值字段。
- 时间坐标统一为 `(day, slotId)`，地点坐标统一为 `nodeId`。
- 派生值（阶段标签、可达节点、当前在场者）可缓存但必须能重算，且不作为事实来源。

`CURRENT_SCHEMA_VERSION = 7`

---

## 1. 时间

```ts
interface SlotDef {
  id: SlotId;        // 'morning' | 'noon' | 'evening' | 'night' ...
  name: string;      // 显示名
  label?: string;    // '07:00–11:00',纯装饰
  order: number;
}

interface CalendarConfig {
  slots: SlotDef[];              // 建世界时确定,默认锁定
  daysPerWeek: number;           // 日程网格宽度,默认 7
  weekdayNames: string[];
  preset: 'leisure' | 'standard' | 'tight' | 'sandbox';
  unlimitedSlots: boolean;       // 沙盒开关:不消耗时段
}

interface Clock {
  day: number;                   // 从 1 开始
  slotId: SlotId;
}
```

预设：leisure 6 槽 / standard 4 / tight 3。

**时段数变更是高危操作**：`Schedule.grid` 与 `ScheduledEvent` 均按 `slotId` 索引，删除槽位会造成日程空洞与日历错位。只允许通过带警告的重映射向导修改，不得作为普通设置项。

---

## 2. 行动成本

```ts
type ActionKind = string;

interface ActionCost {
  slotCost: number;
  energyCost?: number;           // 阶段 8 启用,现在只占位
}

type ActionCostTable = Record<ActionKind, ActionCost>;
```

内置 kind 与默认值：

```
move_cross_region   1
move_within_region  0
work                2
explore             1
rest                1
```

免费（不进成本表，硬性零消耗）：偶遇、对话、点击已生成话题、查看地图/物品栏/日记/手机。
事件可用 `EventDef.slotCost` 覆盖默认值。

---

## 3. 关系

```ts
interface AxisDef {
  id: AxisId;                    // 'intimacy' | 'trust' | 'tension' | 'familiarity' | 用户扩展
  name: string;
  min: number; max: number;
  initial: number;
  clampPerTurn: number;          // 单回合变更上限,对应 ops clamp
  monotonic?: boolean;           // familiarity 为 true,只增不减
  hidden?: boolean;
}

interface Knot {                 // 心结
  id: Id;
  text: string;
  sinceDay: number;
  resolveCondition?: Condition;
}

interface MemoryEntry {
  id: Id;
  text: string;
  day: number;
  nodeId?: NodeId;
  weight?: number;               // 压缩时保留优先级
}

interface RelationState {
  charId: CharId;
  axes: Record<AxisId, number>;
  stageId: string;               // 派生缓存
  mood?: { word: string; setDay: number; decayDays: number };
  situation?: string;            // 当下在做什么 / 忙不忙,一句话
  lastSeenDay?: number;
  metDay: number;
  knots: Knot[];
  memories: MemoryEntry[];
}

interface StageRule {
  id: string;                    // 'stranger' | 'acquaintance' | 'undercurrent' | 'lover' | 'estranged' ...
  name: string;
  when: Condition;
  order: number;                 // 升序求值,首个匹配胜出
}
```

进 prompt 的是 `stageId` 对应的 `name` + `mood` + `situation` + `已 N 天未见`（由 `lastSeenDay` 与 `clock.day` 算出），**不是数字**。`config.showNumbers` 默认 false。

---

## 4. 角色与 NPC

```ts
type AssetRef =
  | { kind: 'stored'; assetId: Id }
  | { kind: 'url'; url: string };

interface PortraitSet {
  id: Id;
  name: string;                  // '默认' | '冬装' | '制服'
  image: AssetRef;               // 单张,无表情
  transform?: { scale: number; offsetX: number; offsetY: number };
}

interface CharacterVisuals {
  avatar?: AssetRef;             // 地图图钉 / 联系人 / 消息头像
  portraits: PortraitSet[];
  activePortraitId?: Id;
  accentColor?: string;          // 无图时名牌占位配色
}

interface Character {            // 正式角色
  id: CharId;
  name: string;
  tier: 'formal';
  card: {
    description: string;
    personality: string;
    scenario?: string;
    firstMes?: string;
    exampleDialogue?: string;
  };
  visuals: CharacterVisuals;
  homeNodeId?: NodeId;
  schedule?: Schedule;
  initialAxes?: Record<AxisId, number>;
  giftPrefs?: {
    likeTags: string[];
    dislikeTags: string[];
    specialItems: Record<ItemId, number>;
  };
  worldbookIds?: Id[];
  source?: 'user' | 'imported_st' | 'promoted';
}

interface NpcLite {              // 半正式:打包进 npc_batch 调用
  id: CharId;
  name: string;
  tier: 'semi';
  facts: string[];               // 既成事实,上限 8
  tags: string[];
  homeNodeId?: NodeId;
  lightMemory: string[];         // 上限 5,FIFO
  seed?: number;
  templateId?: Id;
  visuals?: { avatar?: AssetRef };
}

interface NpcTemplate {          // 背景 NPC 生成模版
  id: Id;
  name: string;
  nameParts?: { given: string[]; family: string[] };
  traitPool: string[];
  occupationPool: string[];
  tagPool: string[];
}
```

背景 NPC 不落库，运行时由 `{ seed, templateId }` 现场生成。`promote_npc` op 负责 `NpcLite → Character` 的扩写与落库。

**视觉资产显示规则**：当前产品界面只维护一张可选立绘；新上传会替换旧图。存档暂时保留 `portraits[]` 与 `activePortraitId` 以兼容旧存档和导入内容，但内置编辑器写入时最多保留一项。面对面场景缺少立绘时保留空的立绘区域，不使用头像代替；地图/图钉头像缺失时使用 `accentColor + 角色名首字` 占位，不报错。

---

## 5. 地图

```ts
interface Region {
  id: Id;
  name: string;
  description?: string;
}

interface NodeMemory {
  id: Id;
  text: string;
  day: number;
  charIds: CharId[];
  pinned?: boolean;              // 保留优先
}

interface MapNode {
  id: NodeId;
  name: string;
  regionId: Id;
  kind: string[];                // 'indoor'|'outdoor'|'commercial'|'residential'|自由标签
  description?: string;
  worldbookIds: Id[];            // 进入即注入
  openSlots?: SlotId[];          // 省略 = 全时段开放
  discovered: boolean;           // 迷雾
  visitCount: number;
  memories: NodeMemory[];        // 上限 5
  pos: { x: number; y: number }; // graph 与 hotspot 共用
  parentNodeId?: NodeId;         // 子场景
  sceneBackground?: AssetRef;    // 面对面聊天场景背景
}

interface MapEdge {
  from: NodeId;
  to: NodeId;
  travelSlots: number;
  condition?: Condition;
  oneWay?: boolean;
}

interface MapView {
  mode: 'graph' | 'hotspot';
  background?: AssetRef;         // hotspot 模式的底图
  size: { w: number; h: number };
}
```

同区域内移动默认 0 消耗，跨区域按 `travelSlots`（缺省回落到 `move_cross_region`）。
`move_player` op 必须校验边可达与 `openSlots`，不可达则拒绝并记录警告。

---

## 6. NPC 日程

```ts
interface ScheduleCell {
  nodeId: NodeId;
  activity: string;              // '在琴房练习' —— 直接进 prompt
}

interface Schedule {
  grid: Record<string, ScheduleCell | null>;   // key = `${weekdayIndex}:${slotId}`
  overrides: Record<string, ScheduleCell>;     // key = `${day}:${slotId}`,move_npc 写入,仅当日有效
}
```

```ts
interface EncounterLogEntry {
  id: Id;
  day: number;
  slotId: SlotId;
  nodeId: NodeId;
  charIds: CharId[];                         // 最多 3 位
  trigger: 'enter' | 'leave' | 'character_move';
  scope: 'formal' | 'peripheral';
  outcome: 'continued' | 'urgent_leave';
}
```

"谁在这里"是纯代码查询：遍历所有 `Character.schedule` 与 `NpcLite.homeNodeId`，`overrides` 优先于 `grid`。**此查询禁止调用 API。**

---

## 7. 话题树

```ts
interface Topic {
  id: Id;
  label: string;                 // 按钮文字
  kind: 'daily' | 'story';       // daily 按天刷新,story 永久保留
  terminal: boolean;             // true = 推进型,选后结束场景
  require?: Condition;           // 不满足时按 config.hiddenTopicStyle 处理
  response: string;              // 内联正文,点击即渲染,零 API
  usedResponse?: string;         // 已聊过时的敷衍变体
  ops?: unknown[];               // 预置状态变更,走同一套校验
  unlocks?: Id[];                // unlock_topic 路径
  generatedDay: number;
}

interface TopicTree {
  charId: CharId;
  nodeId: NodeId;
  topics: Topic[];
  generatedDay: number;
}
```

- 存档持有 `usedTopics: Record<Id, number>`（值 = 使用日），`require` 条件可直接引用。
- 一次 `topic_tree` 调用生成 4–8 个 topic 及其 `response`，之后纯本地渲染。
- 已用话题**不置灰**，改为返回 `usedResponse`。
- 自由输入永远与按钮并存，允许 AI 反向 `unlock_topic`。
- 树的 key = `` `${charId}:${nodeId}` ``；`kind: 'daily'` 的树跨天失效重生成，`story` 保留。

---

## 8. 事件与导演

```ts
interface EventDef {
  id: Id;
  title: string;
  trigger: {
    nodeIds?: NodeId[];
    slotIds?: SlotId[];
    charIds?: CharId[];
  };
  when?: Condition;
  cooldownDays?: number;
  once?: boolean;
  weight?: number;
  slotCost?: number;             // 覆盖成本表
  prompt?: string;               // 交给 AI 的场景指令
  content?: string;              // 或纯静态文本,不调 API
  ops?: unknown[];
  packId?: Id;                   // 事件包来源
}

interface ScheduledEvent {       // pending 队列 = 伏笔
  id: Id;
  eventId: Id;
  day: number;
  slotId: SlotId;
  nodeId: NodeId;
  charIds?: CharId[];
  revealed?: boolean;            // 是否已向玩家预告
}

interface DirectorState {
  scheduled: ScheduledEvent[];
  lastFiredDay: Record<Id, number>;
  tension: number;               // 张力曲线,连续平淡则上升
  globalCooldownUntilDay?: number;
}
```

事件坐标恒为三元组 `(nodeId, day, slotId)`。导演只往日历里排，不即时触发。

---

## 9. 物品与礼物

```ts
interface ItemDef {
  id: ItemId;
  name: string;
  tags: string[];                // 与 giftPrefs 匹配
  description?: string;
  icon?: AssetRef;
  stackable?: boolean;
  giftable?: boolean;
  value?: number;
}

interface InventoryEntry {
  itemId: ItemId;
  count: number;
  gotDay: number;
  gotNodeId?: NodeId;            // 物品记住来处
  fromCharId?: CharId;
}
```

礼物结果由代码算（tag 匹配 + `specialItems` + 当前阶段 + `mood`），AI 只负责写反应文字。

---

## 10. 约定

```ts
interface Appointment {
  id: Id;
  charId: CharId;
  day: number;
  slotId: SlotId;
  nodeId: NodeId;
  status: 'pending' | 'kept' | 'late' | 'missed';
  note?: string;
}
```

到期未到场 → `missed`，由 `onDaySettle` 判定并写入 knot 或 axes 变化。

---

## 11. 晨间世界更新

```ts
interface NewsItem {
  id: Id;
  kind: 'lead' | 'ambience' | 'character' | 'ad';
  text: string;
  nodeId?: NodeId;               // lead 必须带
  slotId?: SlotId;
  charIds?: CharId[];
  expiresDay?: number;
  taken?: boolean;
}

interface Weather {
  id: string;
  label: string;
  tags: string[];                // 'rain' 可门控事件
}

interface MorningUpdate {        // world_morning 单次调用的返回结构
  day: number;
  news: NewsItem[];              // 3–6 条,四类混排
  weather: Weather;
  npcMoves: Array<{ charId: CharId; slotId: SlotId; nodeId: NodeId; note?: string }>;
  worldNote?: string;            // 世界微变,一两句
}

interface HookPool {
  items: NewsItem[];             // 未被选中的钩子回池,数日后重现或过期
}
```

`kind: 'ad'` 是经济与职业系统的入口（招聘、租房、店铺转让），不需要额外菜单。
生成 prompt 必须带入前一天的 `DiaryEntry` 以产生回声。
`npcMoves` 写入对应角色的 `Schedule.overrides`。

---

## 12. 日记与结算

```ts
interface DiaryEntry {
  day: number;
  text: string;
  editedAt?: string;             // 用户手动修改时间；缺省表示未编辑
}

interface DailySettlement {
  day: number;
  footprint: NodeId[];
  met: CharId[];
  relationChanges: Array<{ charId: CharId; prose: string; raw?: Record<AxisId, number> }>;
  income: number;
  expense: number;
  itemsGained: InventoryEntry[];
  diary: string;
  appointmentsTomorrow: Appointment[];
}

interface ChapterSummary {
  id: Id;
  fromDay: number;
  toDay: number;
  text: string;
}

interface Milestone {
  id: Id;
  day: number;
  text: string;
  charIds: CharId[];
}
```

长期上下文 = 角色卡 + `RelationState` 摘要 + 最近 7 天 `DiaryEntry` + `Milestone[]`；更早压为 `ChapterSummary`，原始对话可丢弃。
`relationChanges.prose` 是给玩家看的散文，`raw` 仅在 `showNumbers` 开启时显示。

---

## 13. 世界书

```ts
interface WorldbookEntry {
  id: Id;
  name: string;
  content: string;
  nodeIds?: NodeId[];            // 位置触发,优先级高
  charIds?: CharId[];
  keys?: string[];               // 关键词触发,优先级低
  constant?: boolean;            // 常驻
  priority?: number;
  enabled: boolean;
  tokenBudget?: number;
}
```

位置注入（`node_worldbook`）优先于关键词注入（`worldbook_keyword`）。

### 13.1 资料预设（文风 / 提示词 preset）

```ts
interface Preset {
  id: Id;
  name: string;
  systemPrompt: string;          // 文风与提示词模板
  enabled: boolean;              // 是否参与当前预设包的 prompt 组装
  temperature: number;           // 可选的生成偏好覆盖，不是 Provider 身份
  maxOutputTokens: number;       // 可选的生成长度覆盖，不是 Provider 身份
  updatedAt: string;
}

interface PresetBundle {
  id: Id;
  name: string;
  entries: Preset[];              // 数组顺序就是 prompt 顺序，首项为核心预设
  updatedAt: string;
}
```

这里的预设条目属于资料内容，主要作用是复用文风和提示词。用户切换的是 `PresetBundle`；包内启用条目在下一次生成时按数组顺序注入，越靠上的条目越早发送，首项标记为核心预设并位于所有内置 prompt block 之前。条目可以单独停用而不删除。内置“基础叙事控制”包将“玩家代写方式”和“旁白人称”拆成两个可独立编辑、启用和排序的条目，不把玩家叙事主权写死在格式契约中。Provider、endpoint、API key 与任务路由仍由独立的 Provider 设置管理；预设包不等于 Provider 配置。

角色卡、世界书与预设均由本地 IndexedDB 管理；它们不写入 `SaveFile.world`，导出角色包/世界包时再按 `manifest.type` 选择性打包。

聊天记录按角色保存在本地 IndexedDB，不写入 Provider 配置或 API key；角色卡、世界书、预设均支持独立 JSON/zip 导入导出。连续追加但尚未生成回复的用户消息也是有效记录，必须在请求发出前持久化；请求失败不得删除，流式助手文本按节流/收尾策略持续落库。

Provider 配置单独保存在本地 Provider 数据库，不属于 `SaveFile`。普通 `save.zip` 不导出也不覆盖 Provider 配置或 API key，导入完成后必须明确提示该边界；全局备份及可选加密密钥导出属于后续独立设计，不在阶段 0 的普通存档格式中暗中加入。

---

## 14. 玩家

```ts
interface PlayerPersona {
  id: string;
  name: string;              // 面具管理名称
  displayName: string;      // 对话框显示称呼
  description: string;      // 注入提示词的自我描述
  updatedAt: string;
}

interface PlayerState {
  name: string;
  persona?: string;
  personaId?: string;              // 当前世界绑定的面具身份 ID
  nodeId: NodeId;
  homeNodeId?: NodeId;           // 邻近度加权偶遇
  stats: Record<string, number>; // money / energy / reputation ...
  flags: Record<string, boolean>;
  inventory: InventoryEntry[];
  job?: { nodeId: NodeId; slotIds: SlotId[]; wage: number; title: string };
  shop?: { nodeId: NodeId; slotIds: SlotId[]; name: string };
  visuals?: { avatar?: AssetRef };
}
```

`PlayerPersona` 保存在本地资料库；一个 `SaveFile` 通过 `player.personaId` 绑定一个当前身份。旧存档的 `persona` 文本必须保留，不能静默丢弃；当前版本提供设置页补创建/绑定面具身份的入口，后续可再增加旧文本自动转为默认身份。`displayName` 只影响面对面/事件对话框的玩家名牌，`name` 仍是世界事实中的玩家姓名。

`job` / `shop` 绑定节点并占用时段——玩家因此成为地图上的一个点，角色会路过来找。

---

## 15. 世界状态

```ts
interface WorldState {
  clock: Clock;
  slotsUsedToday: number;

  player: PlayerState;
  characters: Record<CharId, Character>;
  npcs: Record<CharId, NpcLite>;
  relations: Record<CharId, RelationState>;

  encounterLog: EncounterLogEntry[];

  map: {
    regions: Record<Id, Region>;
    nodes: Record<NodeId, MapNode>;
    edges: MapEdge[];
    view: MapView;
  };

  worldbook: Record<Id, WorldbookEntry>;
  items: Record<ItemId, ItemDef>;
  npcTemplates: Record<Id, NpcTemplate>;

  topicTrees: Record<string, TopicTree>;   // `${charId}:${nodeId}`
  usedTopics: Record<Id, number>;

  eventDefs: Record<Id, EventDef>;
  director: DirectorState;

  appointments: Appointment[];
  morning: { today?: MorningUpdate; pool: HookPool };

  diary: DiaryEntry[];
  settlements: DailySettlement[];
  chapters: ChapterSummary[];
  milestones: Milestone[];

  stats: Record<string, number>;    // 世界级数值
  flags: Record<string, boolean>;
}
```

阶段 2 的 schema v3 在 `WorldState` 中新增 `slotsUsedToday`、`diary` 与 `settlements`，并为 v2 存档提供自动迁移；旧存档缺失字段时分别默认为 `0` 与空数组。`DailySettlement` 记录每日足迹、相遇、关系变化、收支、新物品、日记和次日待办。

---

## 16. 存档根类型

```ts
interface EncounterConfig {
  enabled: boolean;
  triggerOnLeave: boolean;
  leaveProbability: number;      // 0–1
  guaranteeAfterDays: number;
  maxParticipants: number;       // 1–3
  weights: Record<CharId, number>;
}
```

```ts
interface SaveFile {
  schemaVersion: number;

  meta: {
    id: Id;
    title: string;
    createdAt: string;
    updatedAt: string;
    appVersion: string;
  };

  config: {
    calendar: CalendarConfig;
    actionCosts: ActionCostTable;
    axisDefs: AxisDef[];
    stageRules: StageRule[];
    showNumbers: boolean;                          // 默认 false
    hiddenTopicStyle: 'hide' | 'question_marks';
    realTimeAwareness: boolean;                    // 默认 false,见 D2
    opsLimitPerTurn: number;                       // 默认 12
    encounter: EncounterConfig;
  };

  world: WorldState;
}
```

**不进存档**：provider 配置与 API key（独立 store，导出时剔除）、token 计数、prompt 缓存、派生索引、资产二进制（存 IndexedDB，导出时进 zip）。

导出包结构：

```
manifest.json      { type: 'save'|'character'|'world'|'events', appVersion, schemaVersion }
save.json          （或 character.json / world.json / events.json）
assets/<assetId>.<ext>
```

---

## 17. 校验

- 每个类型对应一个 zod schema，`SaveFileSchema` 为根。
- 加载时全量 `parse`；失败给出字段级错误与"尽力修复"选项，禁止静默丢数据。
- AI 返回的结构（`MorningUpdate`、`TopicTree`、地图 JSON）一律先 `parse` 再入库，失败走三级降级（见架构 3.2）。
- 引用完整性检查器：孤立 `nodeId`、指向不存在角色的 `charId`、断裂的 `unlocks` 链，在调试面板列出但不阻断游玩。
