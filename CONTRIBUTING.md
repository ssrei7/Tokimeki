# 源码二改与贡献指南

感谢你考虑修改或扩展小小地图。本项目适合以小步、可验证的垂直切片进行二次开发。开始前请先阅读 [`AGENTS.md`](AGENTS.md)；它是仓库内的硬约束。

## 开发环境

需要 Node.js 和 npm：

```bash
npm install
npm run dev
```

提交前运行完整检查：

```bash
npm run build
npm test -- --run
git diff --check
```

不要提交 `dist/`、`node_modules/`、`*.tsbuildinfo`、API key、私密聊天内容或本地存档。

## 目录与职责

- `src/core/`：确定性内核。必须能在 Node 环境运行，不依赖 DOM、IndexedDB 或网络。
- `src/data/`：存档 schema、migration、数据库、导入导出和资源引用。
- `src/providers/`：Provider 路由、API 适配器和所有外部模型调用。
- `src/features/`：独立玩法功能，通过注册表和事件钩子接入。
- `src/ui/`、`src/components/`：页面、组件和本地 UI 偏好。
- `tests/`：核心逻辑、数据边界和 UI 行为的自动测试。

## 核心边界

### 状态与 AI

时间、位置、数值、`stats`、`flags`、物品、话题状态、NPC 日程、关系轴和事件队列必须由确定性代码持有。AI 只返回叙述文字和 ops 提议；AI 生成的数值、坐标、时间和状态不能直接写入世界，必须经过 schema、白名单和限制校验。

数值使用 `stats: Record<string, number>`，布尔使用 `flags: Record<string, boolean>`。条件使用安全表达式求值器，禁止 `eval` 和 `new Function`。

### 新增玩法

优先通过以下方式扩展，不要为单个功能重写核心循环：

1. 注册新的 op handler；
2. 订阅现有事件钩子；
3. 注册带优先级和 token 预算的 prompt block；
4. 添加事件包、世界包或角色包。

默认行为应保持本地、即时和低成本。移动、查看地图、读取已有内容和点击已生成话题不应新增 API 调用。新增 API 调用时，说明调用频率、是否可以合并，以及失败后的本地回退。

### 存档兼容

修改 `SaveFile` 或其他持久化 schema 时，必须在同一次提交中：

- 递增 `schemaVersion`；
- 添加顺序明确的 migration；
- 保留旧存档读取能力；
- 为新旧版本和异常数据补充测试。

如果无法自动迁移，必须给出明确提示和手动修复入口，不能静默丢失数据。纯 UI 偏好通常应使用 localStorage 或 IndexedDB，不要为了方便把它写进游戏存档。

### API、隐私与资源

- API 调用只能从 `src/providers/` 发起。
- 不得把用户代码、API key、存档或聊天内容发送到用户未明确配置的端点。
- 角色和存档只保存资源 id 或外链 URL，不要把 base64 图片写入 JSON。
- 二进制资源放在本地资源数据库，导出时再打包进 zip。
- 新增依赖前先说明理由并锁定版本。

## 推荐的改动流程

1. 先阅读相关的 `docs/`、现有测试和调用方，确认事实来源与边界。
2. 把改动拆成一个能独立运行的垂直切片。
3. 先补充或更新确定性测试，再实现最小改动。
4. 运行 `npm run build`、`npm test -- --run` 和 `git diff --check`。
5. 检查 diff 中没有无关格式变化、构建产物、密钥或存档。
6. 使用一个清晰的本地 commit 描述本次切片；不要直接 push 到上游。

## 文档与许可证

新增功能应同步更新用户可见文档或相关开发文档。第三方代码、图标、字体和视觉资源必须先确认许可证，并在 [`docs/third-party-licenses.md`](docs/third-party-licenses.md) 记录来源、版本、修改范围和使用限制。

本项目使用 [PolyForm-NonCommercial-1.0.0](LICENSE)。二次修改和再分发必须保留许可证及其要求的声明；商业用途需要获得项目许可范围之外的单独授权。
