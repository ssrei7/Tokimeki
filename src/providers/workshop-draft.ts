import { WorkshopPackageSchema, type WorkshopPackage } from '../data/workshop';
import { streamChat, type StreamStatus } from './stream';
import type { ChatMessage, ProviderConfig } from './types';

export const WORKSHOP_DRAFT_REQUIREMENT_LIMIT = 4000;

const SYSTEM_PROMPT = `你是“小小地图”的声明式终端 App 草稿生成器。只输出一个 JSON 对象，不要 Markdown、解释或代码围栏。
输出必须是 workshop 包 v1，顶层只能包含 manifest、app、rules；不要输出 events、prompts、assetMeta，也不要引用图片。
manifest 固定 type="workshop"、packageVersion=1、runtimeVersion=1，id 只用 ASCII 字母、数字、点、下划线、连字符，version 使用 x.y.z。
页面组件只使用 title、text、fact、card（不得有 imageAssetId）、list、tabs、button、input、select、progress、confirm。
动作只使用 navigate 与 set-local。rules 必须是 {"rules":[]}。不得提交 op、触发事件、调用 Provider、生成 HTML/CSS/脚本或网络请求。
可读事实 resource 只能从 clock、world.stats、world.flags、player.identity、player.location、player.stats、player.flags、player.inventory、map、characters、relations、events、economy 中选择。
manifest.permissions 必须准确声明实际用到的 world.read resources、app.local-state 和 navigation.local，不要声明未使用权限。
所有数值只是界面展示常量或本地 App 状态，不能声称改变世界事实。若需求涉及尚未开放的确定性玩法，请制作记录/说明界面，并在正文中明确结果不会自动写入世界。
最小结构示例：{"manifest":{"type":"workshop","packageVersion":1,"runtimeVersion":1,"id":"sample.app","name":"示例","author":"AI Draft","version":"1.0.0","permissions":[]},"app":{"entryPageId":"home","pages":[{"id":"home","title":"首页","components":[{"kind":"text","text":"示例"}]}]},"rules":{"rules":[]}}`;

export function buildWorkshopDraftMessages(requirement: string): ChatMessage[] {
  const value = requirement.trim();
  if (!value) throw new Error('请先填写 App 需求。');
  if (value.length > WORKSHOP_DRAFT_REQUIREMENT_LIMIT) throw new Error(`App 需求不能超过 ${WORKSHOP_DRAFT_REQUIREMENT_LIMIT} 个字符。`);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: JSON.stringify({ requirement: value }) },
  ];
}

export function parseWorkshopDraftResponse(raw: string): WorkshopPackage {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1] ?? trimmed;
  let value: unknown;
  try { value = JSON.parse(candidate); }
  catch { throw new Error('Provider 返回的草稿不是有效 JSON。'); }
  const parsed = WorkshopPackageSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.length ? `（${first.path.map(String).join('.')}）` : '';
    throw new Error(`Provider 返回的草稿不符合工坊包 schema${path}：${first?.message ?? '未知错误'}`);
  }
  const pack = parsed.data;
  if (pack.events || pack.prompts || pack.assetMeta || pack.manifest.iconAssetId || pack.rules.rules.length) throw new Error('AI 草稿只能包含无资产的受限页面与空 rules，不能包含事件、Prompt、资产或规则。');
  const allowedPermissions = new Set(['world.read', 'app.local-state', 'navigation.local']);
  if (pack.manifest.permissions.some((permission) => !allowedPermissions.has(permission.capability))) throw new Error('AI 草稿声明了当前生成切片未开放的权限。');
  for (const page of pack.app.pages) for (const component of page.components) {
    if (component.kind === 'image' || (component.kind === 'card' && component.imageAssetId)) throw new Error('AI 草稿不能引用二进制图片资产。');
    if ((component.kind === 'button' || component.kind === 'confirm') && component.action.type !== 'navigate' && component.action.type !== 'set-local') throw new Error('AI 草稿包含当前生成切片未开放的动作。');
  }
  return pack;
}

export async function generateWorkshopDraft(config: ProviderConfig, requirement: string, options: { fetchImpl?: typeof fetch; signal?: AbortSignal; onStatus?: (status: StreamStatus) => void } = {}): Promise<WorkshopPackage> {
  const raw = await streamChat(config, buildWorkshopDraftMessages(requirement), () => undefined, {
    taskId: 'workshop_draft',
    outputMode: config.outputMode === 'off' ? 'off' : 'json_object',
    fetchImpl: options.fetchImpl,
    signal: options.signal,
    onStatus: options.onStatus,
  });
  return parseWorkshopDraftResponse(raw);
}
