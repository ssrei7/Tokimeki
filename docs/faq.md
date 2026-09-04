# 项目答疑

这份文档记录使用体验、概念解释和讨论中的常见问题。它不是架构规范，也不替代 `AGENTS.md`、数据模型或路线图；确定后的技术约束仍以对应正式文档为准。

## 阶段 1 验收

### `custom-reputation` 是什么？

它不是 Tokimeki 已经定义好的正式属性，只是阶段 1 的演示 stat 名称，用来证明 `stats` 可以使用任意数字字段。当前 Mock 的 `perfect` fixture 会同时提出：

- `give_item`：给玩家一朵 `white-flower`
- `add_stat`：把玩家的 `custom-reputation` 从 0 增加到 2

因此，增加 2 不是“获得花必然增加声望”的游戏规则，而是为了在一次确定性验收中同时看到物品变化和通用 stat 变化。正式玩法中，是否因送花改变某个关系轴或其他 stat，要由阶段 5 的礼物规则和内核条件决定，不能由这个 fixture 推断。

### 自定义 stats 做什么？

自定义 stat 是玩家或世界的通用数字状态，例如 `money`、`trust`、`temperature` 或作者自定义的数值。阶段 1 的设置入口只负责创建或修改玩家 stat 的初始值；后续 AI 提出的 `add_stat` / `set_stat` 会经过白名单、schema、clamp 和单回合上限，再由内核写入。

它可以在游玩过程中生效：条件表达式、事件、礼物和关系规则可以读取这些值，前提是对应功能在后续阶段接入。阶段 1 目前只提供基础存储、操作和表达式封装，不自动赋予每个 stat 具体玩法含义。

用户可以随时修改初始值。修改是直接改当前存档的玩家状态，导出普通存档时会随存档一起保存。

字段名存储层支持中文，例如 `好感`；但当前 `expr-eval` 条件表达式的标识符语法不能直接解析中文成员名。需要被条件表达式引用的字段，当前建议使用稳定的 ASCII key（例如 `affection`），中文只作为 UI 显示名或描述。后续若要支持中文表达式，需要单独设计安全映射和迁移，不能在当前阶段偷偷改变表达式语法。

### 当前界面里物品栏和 Ops diff 在哪里？

- 物品定义和当前库存：`资料 → 物品定义`、`资料 → 物品栏（当前世界状态）`
- 状态变化 diff：生成回复后，打开 `设置 → 高级与调试 → Ops diff`
- Mock fixture：`设置 → 高级与调试 → Mock provider 验收工具`

当前分区是阶段 1 的结构性入口，不是最终信息架构。库存、角色、世界书和预设以后可以拆成独立页面、标签或手机终端 App；只要继续让 UI 读取同一份 `SaveFile`，不需要改变状态所有权。阶段 4 之前只优先保证结构清晰和可操作，不提前做最终视觉定稿。

### 你贴出的 Ops diff 对不对？

对。它表示：

- `stage: strict`：原始 `<ops>` JSON 一次解析成功，没有用修复或抽取回退
- `parsedOps`：包含一个 `give_item` 和一个 `add_stat`
- `applied: 2`：两个操作都通过校验并执行
- `changes`：库存从 0 到 1，`custom-reputation` 从 0 到 2
- `warnings`、`rejected`、`truncated` 都为空或 0：没有未注册 op、拒绝、clamp 或单回合截断

这里的 `description` 是调试用的人类可读说明；真正的状态事实由 `changes` 的路径和值以及最终存档持有。

## Mock fixture 速查

| fixture | 预期结果 |
|---|---|
| `perfect` | 正文显示；白色小花 +1；`custom-reputation` +2；Ops diff 有 2 条变更 |
| `malformed` | 正文保留；解析失败；无状态变化；显示重试和手动补录 |
| `fenced` | 正确去除 Markdown 围栏；空 ops；无状态变化 |
| `unregistered-op` | 未注册 op 丢弃；合法 `set_flag` 仍执行并产生警告 |
| `clamp-exceeded` | `delta: 100` 被限制为 `+10`；Ops diff 显示 clamp 警告 |
| `empty-ops` | 解析成功但数组为空；无状态变化，不算失败 |
| `interrupted-stream` | 显示已收到的正文；请求失败；可重试状态提取 |

