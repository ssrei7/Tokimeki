import { CircleHelp, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { createEventPackageTemplate, createWorldPackageTemplate } from '../data/io/package-template';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';

export type PackageHelpKind = 'world' | 'event';

export function PackageHelpPortal({ kind, targetSelector }: { kind: PackageHelpKind; targetSelector: string }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { setTarget(document.querySelector<HTMLElement>(targetSelector)); }, [targetSelector]);
  return target ? createPortal(<PackageHelpButton kind={kind} />, target) : null;
}

export function PackageHelpButton({ kind }: { kind: PackageHelpKind }) {
  const label = kind === 'world' ? '查看世界包制作教程' : '查看事件包制作教程';
  const [downloading, setDownloading] = useState(false);
  const downloadLabel = kind === 'world' ? '下载世界包模板' : '下载事件包模板';
  const downloadTemplate = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const blob = kind === 'world' ? await createWorldPackageTemplate() : await createEventPackageTemplate();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = kind === 'world' ? 'tokimeki-world-package-template.zip' : 'tokimeki-event-package-template.zip';
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(error instanceof Error ? `模板生成失败：${error.message}` : '模板生成失败。');
    } finally {
      setDownloading(false);
    }
  };
  return <>
    <Dialog>
      <DialogTrigger asChild><button type="button" className="package-help-trigger" aria-label={label} title={label}><CircleHelp aria-hidden="true" /></button></DialogTrigger>
      <DialogContent className="package-help-dialog">
        <DialogHeader>
          <DialogTitle>{kind === 'world' ? '世界包制作与导入教程' : '事件包制作与导入教程'}</DialogTitle>
          <DialogDescription>{kind === 'world' ? '把可复用的世界静态内容分享给其他存档。' : '制作、检查并分享确定性的事件定义。'}</DialogDescription>
        </DialogHeader>
        <button type="button" className="package-template-download" onClick={() => void downloadTemplate()} disabled={downloading}><Download aria-hidden="true" />{downloading ? '正在生成…' : downloadLabel}</button>
        {kind === 'world' ? <WorldPackageGuide /> : <EventPackageGuide />}
      </DialogContent>
    </Dialog>
    <button type="button" className="package-template-trigger" onClick={() => void downloadTemplate()} disabled={downloading} aria-label={downloadLabel} title={downloadLabel}><Download aria-hidden="true" /><span>下载模板</span></button>
  </>;
}

function WorldPackageGuide() {
  return <div className="package-help-content">
    <section><h3>世界包与世界存档有什么区别？</h3><p>世界包是“可复用设定模板”，世界存档是“一次实际游玩现场”。世界包包含地图、正式角色、NPC、NPC 模板、物品定义、事件定义，以及本机资料库中的世界书和角色卡；不会带走玩家时间、当前位置、关系进度、库存、终端消息、预约、事件历史或 API 配置。</p></section>
    <section><h3>推荐制作流程</h3><ol><li>点击“下载世界包模板”，解压后先阅读 README.md，再编辑 world.json；也可以先在一个专门用于制作的世界中完成内容后导出。</li><li>检查稳定 ID。地点、角色、物品和事件之间的引用必须使用实际 ID；发布后尽量不要随意改 ID。</li><li>配置头像、立绘和场景背景。需要让接收者离线获得图片时，导出前勾选“含本地图片”。外链图片只保留 URL。</li><li>重新压缩模板，或点击“导出当前世界包”得到 zip。在另一个测试世界中导入一次，检查地图连接、角色、事件和图片。</li><li>确认无误后再分享 zip。建议同时写明适用的 Tokimeki 版本和包内容简介。</li></ol></section>
    <section><h3>导入会发生什么？</h3><ul><li>世界包会合并到当前世界，不会新建账号或上传数据。</li><li>同 ID 的地图节点、角色、NPC、物品或事件会先要求确认，确认后只覆盖这些静态定义。</li><li>玩家已有进度会保留。导入前仍建议先做一次世界存档或全局备份。</li><li>包内本地图片会写入 Assets IndexedDB，并改成当前浏览器自己的资产 ID。</li></ul></section>
    <section><h3>高级作者：zip 结构</h3><pre className="package-help-code">{`manifest.json       type 必须为 "world"，世界包 schema 当前为 1\nworld.json          世界包主体\ndata/asset-meta.json  可选，本地图片元数据\nassets/<assetId>    可选，本地图片二进制`}</pre><p>最稳妥的做法是先从应用导出模板，再编辑副本。不要把 API key、Provider 配置、存档进度或 base64 图片手工写进 world.json。</p></section>
    <section><h3>发布前检查</h3><ul><li>地图边是否都指向存在的节点。</li><li>角色住所、事件地点和参与角色 ID 是否存在。</li><li>事件引用的物品是否已经包含在物品定义中。</li><li>“仅保留引用”模式下，接收者是否能访问外链图片。</li></ul></section>
  </div>;
}

function EventPackageGuide() {
  return <div className="package-help-content">
    <section><h3>事件包是什么？</h3><p>事件包只包含可执行的事件定义，不是已经发生的事件回顾，也不是世界存档。导入只安装定义，不会立即排程、触发剧情、推进时间或调用 API。</p></section>
    <section><h3>推荐制作流程</h3><ol><li>点击“下载事件包模板”，解压后先阅读 README.md；如果当前世界已有事件，也可以导出当前事件包作为起点。</li><li>完整可视化事件编辑器尚未提供；编辑 <code>events.json</code> 后，把 manifest.json、events.json 和 README.md 按原目录结构重新压成 zip。</li><li>为每个事件设置稳定且不重复的 <code>id</code>、标题、触发条件，以及 <code>content</code>、<code>prompt</code> 或 <code>choices</code> 中至少一种内容。</li><li>重新导入测试包。应用会检查 schema、地点、角色、关系阶段和安全条件表达式；错误会阻止导入，警告需要用户确认。</li><li>在测试世界走到对应地点和时段，带上要求的角色，确认事件能够进入候选并正常触发。</li></ol></section>
    <section><h3>最小示例</h3><pre className="package-help-code">{`{
  "id": "harbor-events",
  "name": "港口事件",
  "events": [{
    "id": "harbor-evening-meet",
    "title": "黄昏相遇",
    "trigger": {
      "nodeIds": ["harbor"],
      "slotIds": ["evening"],
      "charIds": ["rin"],
      "scope": "formal"
    },
    "once": true,
    "weight": 1,
    "content": "暮色落在码头，你们在潮声里相遇。"
  }]
}`}</pre><p>zip 根目录还必须有 <code>manifest.json</code>，其中 <code>type</code> 为 <code>events</code>。建议保留应用导出模板中的 appVersion 和 schemaVersion，不要凭空填写更高版本。</p></section>
    <section><h3>触发难度由什么决定？</h3><ul><li><code>nodeIds</code>：玩家必须位于其中一个地点。</li><li><code>slotIds</code>：当前时段必须匹配。</li><li><code>charIds</code>：列出的角色必须全部成为本次参与者，最多 3 人。</li><li><code>scope</code>：<code>formal</code> 要求正式进入地点；<code>peripheral</code> 要求外围相遇。限定 nodeIds 而未写 scope 时默认按 formal 检查。</li><li><code>when</code>、<code>stageRange</code> 和 <code>tension</code> 会继续收紧资格；<code>once</code> 与 <code>cooldownDays</code> 控制重复触发。</li><li><code>weight</code> 只影响多个合格事件之间的选择概率；设为 0 时不会被导演选中。</li></ul></section>
    <section><h3>总是触发不了怎么办？</h3><ol><li>先只保留一个 nodeId 或 slotId，暂时移除 <code>when</code>、<code>stageRange</code> 和 tension 限制。</li><li>确认地点、时段和角色使用的是 ID，不是显示名称；charIds 中的角色必须实际参与当前相遇。</li><li>检查事件是否已经触发过 once，或仍处于 cooldownDays / 全局冷却。</li><li>把 weight 设为 1 以上，并暂时减少同一坐标上的竞争事件。</li><li>重新导入后留意检查提示。不存在的地点、角色、关系阶段或无效 when 会被明确列出，不会静默安装。</li></ol></section>
    <section><h3>安全边界</h3><p>事件中的 ops 只是提议，运行时仍经过已注册 op 的白名单和参数校验。事件包不能绕过内核直接写入任意时间、数值、位置或状态，也不应携带 API key、Provider 配置或用户聊天记录。</p></section>
  </div>;
}
