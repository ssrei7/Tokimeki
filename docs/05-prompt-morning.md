# 晨间世界更新 · Prompt 规范

对应任务 `world_morning`，阶段 6 启用。**每游戏日只调用一次**，合并产出报纸、天气、半正式 NPC 动向、世界微变。

这是全项目最能体现"世界在看着你"的一次调用，也是解决空沙盒问题的关键。

---

## 1. 为什么合并

单独实现的话是：报纸一次 + 每个半正式 NPC 一次 + 天气一次。20 个 NPC 就是 22 次调用/游戏日，成本不可接受（见 `04-decisions.md` D6/D7）。合并后每日恒定 1 次，与 NPC 数量无关。

正式角色**不参与**这次调用——他们的幕后生活由 `Schedule` 反推，只在玩家实际互动时单独调用。

---

## 2. 输入事实

组装器需要提供（缺失项省略，不要编造占位）：

```ts
interface MorningFacts {
  day: number;
  weekdayName: string;
  season?: string;
  worldSetting: string;          // 世界观摘要,200 字内
  newsFormat: string;            // '报纸' | '公会委托板' | '终端推送' | '酒馆流言'
  playerName: string;
  playerNodeName: string;        // 玩家昨夜所在地
  playerJob?: string;
  yesterdayDiary?: string;       // 关键:回声来源
  activeNodes: Array<{ id: string; name: string; regionName: string; kinds: string[] }>;
  semiNpcs: Array<{
    id: string; name: string; tags: string[];
    facts: string[];             // 上限 8
    homeNodeName?: string;
    lightMemory: string[];       // 上限 5
  }>;
  formalCharNames: string[];     // 只给名字,供 character 类条目提及
  slots: Array<{ id: string; name: string }>;
  weatherPool?: Array<{ id: string; label: string; tags: string[] }>;
  poolHooks: Array<{ id: string; text: string }>;   // 回池待重现的旧钩子
  expiredHooks: Array<{ id: string; text: string }>; // 需要写"已结案"式收尾的
  worldFlags: string[];          // 已触发的重要 flag 摘要
}
```

`yesterdayDiary` 是**不可省的一项**。它让世界产生回声：玩家昨天在码头闹事，今天报纸就提到码头骚乱。成本为零，效果质变。

---

## 3. System prompt 模板

```
你是一个开放世界叙事游戏的「世界模拟器」。你的任务是生成新一天的世界动态。

## 世界观
{{worldSetting}}

## 当前
第 {{day}} 天，{{weekdayName}}{{#season}}，{{season}}{{/season}}
玩家：{{playerName}}{{#playerJob}}（{{playerJob}}）{{/playerJob}}
玩家昨夜所在：{{playerNodeName}}
情报呈现形式：{{newsFormat}}

## 昨天发生了什么
{{yesterdayDiary}}

## 可用地点
{{#activeNodes}}- {{id}} | {{name}}（{{regionName}}，{{kinds}}）
{{/activeNodes}}

## 时段
{{#slots}}- {{id}} | {{name}}
{{/slots}}

## 需要安排动向的次要人物
{{#semiNpcs}}
- {{id}} | {{name}}｜标签：{{tags}}
  既定事实：{{facts}}
  {{#homeNodeName}}常在：{{homeNodeName}}{{/homeNodeName}}
  {{#lightMemory}}近况：{{lightMemory}}{{/lightMemory}}
{{/semiNpcs}}

## 世界中已知的重要人物（可在情报中提及，但不要安排他们的行程）
{{formalCharNames}}

{{#poolHooks}}
## 尚未被理会的旧线索（可择一二重新浮现，措辞需体现"过了些日子"）
{{#poolHooks}}- {{text}}
{{/poolHooks}}

{{#expiredHooks}}
## 已过期的线索（请写一句收尾，让玩家意识到错过了什么）
{{#expiredHooks}}- {{text}}
{{/expiredHooks}}

---

# 生成要求

## 情报条目（3–6 条，四类混排，至少各含 1 条 lead 与 1 条 ambience）

- **lead** 硬线索：必须指向 activeNodes 中真实存在的 nodeId，建议附 slotId。
  写法上给出"值得去看看"的理由，但不要预先剧透会发生什么。
- **ambience** 软氛围：纯世界观调味，不指向任何地点。让世界显得比玩家更大。
- **character** 角色相关：提及重要人物的动向或传闻，措辞含蓄。
  例如"某乐团首席近日频繁出入旧城区"。不要直接给出精确坐标。
- **ad** 系统入口，伪装成广告或告示：招聘、租房、店铺转让、委托。
  这是玩家接触工作与住所系统的唯一入口，请务必自然。

## 天气
从世界观合理范围内选择。天气会影响可发生的事件。

## 次要人物动向
为**每一位**列出的次要人物安排恰好一条动向：一个时段 + 一个真实存在的 nodeId + 一句正在做什么。
要符合其标签与既定事实，并尽量与昨天的世界状态呼应。

## 世界微变
一两句话，描述与玩家无直接关系但正在发生的变化。让世界有独立的生命。

## 铁律
- 只使用上面列出的 nodeId 与 slotId，禁止发明新的。
- 禁止决定玩家做了什么、想什么、感受到什么。
- 禁止在情报中直接写出数值、好感度、系统术语。
- 语气服从「{{newsFormat}}」这一媒介：报纸像报纸，流言像流言。
- 只输出下面指定的 JSON，不要任何解释、前言或代码块外的文字。
```

---

## 4. 期望返回

```json
{
  "news": [
    {
      "kind": "lead",
      "text": "西码头三号仓库昨夜传出异响，管事贴出告示，入夜后禁止闲人靠近。",
      "nodeId": "west-docks",
      "slotId": "night"
    },
    {
      "kind": "ambience",
      "text": "海关本周起加征香料税，旧城的商贩正忙着改价。"
    },
    {
      "kind": "character",
      "text": "有人说近来常在旧书店后巷听见提琴声，断断续续，总在傍晚。",
      "charIds": ["seir"]
    },
    {
      "kind": "ad",
      "text": "灯塔咖啡馆招夜班帮手，管一顿饭，问价面谈。",
      "nodeId": "lighthouse-cafe"
    }
  ],
  "weather": { "id": "drizzle", "label": "细雨", "tags": ["rain", "cold"] },
  "npcMoves": [
    { "charId": "npc-marta", "slotId": "morning", "nodeId": "old-market", "note": "在挑今天的鱼" },
    { "charId": "npc-ivo", "slotId": "evening", "nodeId": "west-docks", "note": "对着仓库的告示发愁" }
  ],
  "worldNote": "旧城的钟楼今天没有报时，修钟的人还没回来。"
}
```

对应 `MorningUpdate`（见 `02-data-model.md` 第 11 节）。`id` 与 `expiresDay` 由代码补齐，不要求 AI 生成。

---

## 5. 校验与降级

处理顺序：

1. zod `parse`
2. 引用完整性：`nodeId` / `slotId` / `charId` 必须存在。**非法引用只丢弃该条目，不废弃整个响应**
3. `lead` 条目缺 `nodeId` → 降级为 `ambience`
4. 补齐 `id`；为 `lead` 与 `ad` 写入 `expiresDay = day + 3~7`（随机）
5. `npcMoves` 写入对应角色的 `Schedule.overrides`；未被安排到的 NPC 回落 `grid`
6. 未被玩家选中的 `lead` 在过期时移入 `HookPool`

解析失败的三级降级（同架构 3.2）：严格 → 宽松修复 → `extract_ops` 式重抽。全败时**回落到纯代码晨报**：从 `HookPool` 抽 2 条旧钩子 + 随机天气 + NPC 全部按 `grid` 行动 + 省略 `worldNote`。今天照样能玩，只是世界安静一点。

这条回落路径是铁律「关掉 API 后系统仍能自洽运行」的一部分，必须实现，不是可选项。

---

## 6. 调参要点

上手后主要调这几处，都会明显改变手感：

- **条目数**：3 条略显冷清，6 条容易信息过载。默认 4，可设置项。
- **lead 占比**：过高会让每天变成任务列表，失去生活感；过低玩家不知道去哪。建议 4 条里 1–2 条。
- **过期天数**：太短会让玩家焦虑，太长则失去"错过"的重量。3–7 天是甜区。
- **过期不要修**。"我错过了什么"是好东西，是这套系统最有价值的副产品。
- **回声强度**：如果 `yesterdayDiary` 过长，世界会显得只围着玩家转。截断到 200 字左右反而更好。

可绑定中档模型。这次调用要求结构准确但不要求文笔顶级，把好模型留给 `narrate_main`。
