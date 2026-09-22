# 小小地图 · Tokimeki

小小地图（Tokimeki）是一个手机竖屏优先的开放世界 AI 叙事游戏。玩家从地图出发，在不同地点、日期和时段生活、移动、相遇和对话，而不是打开一个聊天窗口后等待角色回复。

项目坚持本地优先和用户自带 API：时间、地点、角色日程、关系、物品和其他存档事实由本地代码持有；AI 主要负责叙述文字和经过校验的操作提议。存档、聊天记录、资产和 API 配置保存在当前浏览器本地，项目不提供后端、账号或云端存储。

## 开始使用

需要 Node.js 和 npm。

```bash
npm install
npm run dev
```

生产构建和测试：

```bash
npm run build
npm test -- --run
```

构建产物位于 `dist/`。应用运行后，需要在设置中配置自己的 Provider、模型和 API endpoint；项目不会提供推理服务或代替用户承担 API 费用。

## 静态部署

所有平台都应使用同一组构建参数：

- 构建命令：`npm run build`
- 发布目录：`dist`
- 无需配置服务端环境变量

### Cloudflare Pages

1. 在 Cloudflare Pages 中连接 GitHub 仓库。
2. 框架预设选择 **Vite**。
3. 构建命令填写 `npm run build`，构建输出目录填写 `dist`。
4. 保存并部署。

也可以先在本地运行 `npm run build`，再将 `dist/` 作为静态站点发布。

### Netlify

1. 在 Netlify 中导入 Git 仓库，或直接上传本地构建后的 `dist/` 目录。
2. 使用构建命令 `npm run build`。
3. 将发布目录设置为 `dist`。

当前应用主要使用单页界面状态，不依赖后端路由。若后续增加需要直接访问的深层 URL，请在 Netlify 中为这些路径增加回退到 `index.html` 的重写规则。

### Vercel

1. 在 Vercel 中导入 Git 仓库。
2. 框架选择 **Vite**（通常会自动识别）。
3. 构建命令填写 `npm run build`，输出目录填写 `dist`。
4. 部署项目。

### GitHub Pages

GitHub Pages 可以发布本项目的静态构建产物，但仓库项目站点通常运行在 `https://<用户名>.github.io/<仓库名>/` 子路径下。当前仓库没有内置 GitHub Actions，也没有预设项目子路径，因此需要在部署前：

1. 在 `vite.config.ts` 中为项目站点设置对应的 `base`，例如 `/<仓库名>/`。
2. 使用 GitHub Pages 的 Actions / artifact 发布流程，或将构建后的 `dist/` 发布到 Pages 分支。
3. 如果使用自定义域名或用户站点根路径，确认 `base` 与实际访问路径一致。

不调整 `base` 时，项目站点的 JS、CSS 和图标路径可能无法正常加载。GitHub Pages 的具体工作流不包含在本仓库本次提交中。

## 数据与隐私边界

- 项目是纯前端静态站点，没有项目自有后端、账号系统或云端存档。
- 存档、聊天记录和本地资产保存在浏览器的 IndexedDB 等本地存储中；清理浏览器站点数据前，请先导出重要存档。
- API key 只应保存在自己的浏览器中，并只发送到用户明确配置的 endpoint。
- 不要把 API key、私密聊天内容或不应公开的存档提交到 Git 仓库、部署产物或问题追踪器。
- 第三方依赖和参考资源仍受各自许可证约束，相关说明见 [`docs/third-party-licenses.md`](docs/third-party-licenses.md)。

## 许可证

本项目使用 [PolyForm-NonCommercial-1.0.0](LICENSE)。该许可证允许符合条款的非商业使用、修改和再分发；商业用途不在本项目授予的许可范围内，具体权利和限制以 [`LICENSE`](LICENSE) 正文为准。

## 免责声明与使用边界

- 本项目默认面向成年人使用，建议仅由 18 岁及以上用户使用。
- AI 生成的文字、角色表现、地点描述、建议和其他内容可能不准确、不完整、不适宜，或与用户预期不同。
- 用户自行决定如何生成、保存、使用、分享或发布 AI 生成内容，并自行承担由此产生的责任和后果。
- AI 生成内容不代表开发者的立场、事实承诺或专业建议。
- 用户使用 AI 服务、模型输出和相关内容的行为与结果与开发者无关；用户仍需遵守适用法律、第三方服务条款和内容平台规则。

## 项目文档

- [项目愿景](docs/00-vision.md)
- [架构说明](docs/01-architecture.md)
- [游玩教程](docs/14-user-guide.md)
- [开发交接文档](docs/12-development-handoff.md)
- [第三方许可证说明](docs/third-party-licenses.md)
