# Service Worker 单次 Provider 请求代理评估

## 结论

小小地图不实现 Service Worker Provider 请求代理。继续采用“页面前台直连 Provider、切后台前落盘、返回前台识别中断、用户显式重试、requestId 防止重复 ops”的恢复方案。

这个结论不排除 Service Worker 用于两个独立用途：离线应用壳缓存、已获得权限后的通知展示。它们不得接管 Provider 鉴权或生成请求。

## 评估目标

原设想是：页面切到后台后，由 Service Worker 代持一次已经开始的 Provider 请求，把收到的流式片段写入 IndexedDB，回到前台后再回放。希望减少移动系统冻结页面造成的请求中断。

## 为什么不采用

### 1. 不能绕过 CORS

Service Worker 发起的跨域 `fetch` 与页面请求一样受浏览器 CORS、安全上下文和响应头限制。它不能替代原生 HTTP，也不能解决当前网页无法直连的 Provider。

### 2. 生命周期不可靠

`FetchEvent.respondWith()` 和 `ExtendableEvent.waitUntil()` 可以延长某次事件的处理时间，但不是常驻后台授权。Android 和 iOS 仍可暂停或终止 Service Worker；设备锁屏、内存压力、省电策略和网络变化都会中断任务。Background Sync 只表示浏览器以后可能重新运行任务，不保证时间，也不适合维持实时流。

### 3. 自动重试有外部副作用

多数生成 Provider 不提供可由客户端统一控制的幂等键。Service Worker 若在状态不明时重发请求，可能发生：

- 同一生成被计费两次。
- 返回两份不一致的叙述。
- 页面与后台同时完成，产生竞态。
- 同一响应中的 ops 被重复解析或应用。

小小地图的 `requestId` 可以防止本地重复应用已知 ops，但不能撤销 Provider 侧重复计费，也不能证明两次生成属于同一响应。因此禁止后台自动重放。

### 4. 扩大敏感数据范围

要在页面消失后恢复请求，后台任务通常需要保存 endpoint、headers、API key、完整 prompt 和请求体。即使仍只保存在同源 IndexedDB，也会新增一份长期存在的敏感副本，并要求 Service Worker 直接读取 Provider 配置。收益不足以覆盖这一暴露面。

### 5. 流式解析与状态同步复杂度过高

后台层需要同时处理 SSE、NDJSON、普通 JSON、各 Provider 响应结构、分片写入、版本更新、中途失败、页面重新连接和资产清理。这会把当前位于 `providers/` 的协议逻辑复制进 Service Worker，并增加跨版本恢复和双写竞态。即使实现完整，仍无法克服系统随时终止后台进程的根本限制。

## 继续采用的可靠降级

1. 用户显式触发一次生成，页面直接请求用户配置的端点。
2. 请求开始前保存输入、基础消息、requestId 和未应用 ops 状态。
3. 每个流式增量在前台更新可见正文与恢复记录。
4. `visibilitychange` / `pagehide` 时保存当前正文并标记请求中断。
5. 返回前台后展示已收到正文和明确的手动重试入口。
6. 手动重试从未污染的基础消息重新生成，不自动应用上一请求的未知结果。
7. requestId 和 `opsApplied` 防止同一已知结果重复写入确定性世界状态。

## 与后续通知和离线缓存的关系

- 通知切片可以评估 Service Worker 的 `showNotification()`，但只用于展示已经确定发生的本地事件；不得借通知 Worker 发起或重放 Provider 请求。
- 离线音乐和本地音频使用 Assets IndexedDB，不需要 Provider 请求代理。
- 若未来增加离线应用壳，缓存范围只包含版本化静态资源；用户存档、API key、Provider 响应和外链媒体不进入 Cache Storage。
- 远程推送需要推送服务和订阅端点，超出当前无后端架构，不借 Service Worker 名义隐式引入。

## 重新评估条件

只有同时满足以下条件才重新讨论后台生成：平台提供明确的受保障后台任务、Provider 提供可靠幂等语义、敏感请求无需长期复制、并且不引入与纯前端约束冲突的服务端。仅增加 Service Worker、Background Sync 或 Wake Lock 不满足条件。
