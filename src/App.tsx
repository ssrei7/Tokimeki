import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PromptAssembler } from './core/prompt/assembler';
import type { AssembledPrompt } from './core/prompt/assembler';
import { createDefaultPromptBlocks } from './core/prompt/default-blocks';
import { EventBus } from './core/events/bus';
import { createDefaultOpRegistry, OpsStreamSplitter, parseReply } from './core/ops';
import type { ApplyOpsResult, ParsedReply } from './core/ops';
import { advanceAction, availableSlots, endDay, updateDiaryEntry } from './core/time';
import { PresetBundleSchema, type CharacterCard, type ChatMessage, type ChatRecord, type Preset, type PresetBundle, type WorldbookEntry } from './data/content';
import { clearChats, contentDb, deleteCharacter, deletePreset, deletePresetBundle, deleteWorldbook, loadChat, saveCharacter, saveChat, savePreset, savePresetBundle, saveWorldbook } from './data/db/content';
import { exportPresetBundle, exportSaveZip, importPresetBundle, importSaveZip } from './data/io/zip';
import { DEFAULT_ACTION_COSTS, DEFAULT_SLOT_DEFS, SaveFileSchema, type SaveFile } from './data/schema/save';
import { testProviderConnection } from './providers/connection-test';
import { providerDb } from './providers/db';
import { listProviderModels } from './providers/models';
import { resolveProviderForTask } from './providers/router';
import { streamChat, type StreamStatus } from './providers/stream';
import { createMockProviderConfig } from './providers/adapters/mock';
import { MOCK_FIXTURE_IDS, type MockFixtureId } from './providers/mock/fixtures';
import { ProviderBindingSchema, ProviderConfigSchema, ProviderSettingSchema, TASK_IDS, type ProviderBinding, type ProviderConfig, type TaskId } from './providers/types';
import { canGenerateReply, hasQueuedUserMessage } from './ui/chat-state';
import './ui/theme/app.css';

type Tab = 'map' | 'day' | 'chat' | 'library' | 'settings';
type ContentKind = 'character' | 'worldbook' | 'preset';
type RequestStatus = 'idle' | StreamStatus;
type Feedback = { tone: 'info' | 'success' | 'error'; text: string } | null;
type DebugState = { prompt: AssembledPrompt | null; raw: string; ops: string; state: string };
type PendingOpsRecovery = { raw: string; actorId?: string; streamError?: string };

const now = () => new Date().toISOString();
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now()}`;
const newProvider = (): ProviderConfig => ({ id: `provider-${Date.now()}`, name: '新 Provider', kind: 'openai-compatible', endpoint: '', model: '', contextWindow: 8192, maxOutputTokens: 1024, temperature: 0.7 });
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
const TASK_LABELS: Record<TaskId, string> = {
  narrate_main: '主线叙述', narrate_daily: '日常对话', topic_tree: '话题树', world_morning: '晨间世界更新',
  world_gen: '世界生成', map_gen: '地图生成', npc_batch: 'NPC 批处理', extract_ops: '状态变化整理',
  summarize_day: '日记总结', summarize_chapter: '章节总结', image: '图像生成', tts: '语音生成',
};
const MOCK_FIXTURE_DESCRIPTIONS: Record<MockFixtureId, string> = {
  perfect: '正常正文 + 2 个合法 ops：物品栏增加一朵白色小花，custom-reputation +2。',
  malformed: '损坏 JSON：正文保留，提示“本回合未产生状态变更”，可重试或手动补录。',
  fenced: 'Markdown 围栏包裹：应成功解析，ops 为空，只有正文。',
  'unregistered-op': '一个未注册 op + 一个合法 set_flag：非法项丢弃，mock-valid 变为 true。',
  'clamp-exceeded': '请求 delta=100：被 clamp 到 +10，并在 Ops diff 警告中显示。',
  'empty-ops': '合法空数组：正文显示，状态不变，不视为解析失败。',
  'interrupted-stream': '流式中断：显示已收到正文，请求标记失败，可重试状态提取。',
};

function parseHeadersDraft(value: string): Record<string, string> {
  let parsed: unknown;
  try { parsed = JSON.parse(value); }
  catch { throw new Error('自定义 headers 不是有效 JSON。'); }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('自定义 headers 必须是 JSON 对象。');
  if (!Object.values(parsed).every((item) => typeof item === 'string')) throw new Error('自定义 headers 的键和值都必须是字符串。');
  return parsed as Record<string, string>;
}

function formatOpsDebug(reply: ParsedReply, applied: ApplyOpsResult, logs: string[]): string {
  return JSON.stringify({
    stage: reply.stage,
    parsedOps: reply.ops,
    parseWarnings: reply.warnings,
    applied: applied.applied,
    changes: applied.changes,
    warnings: applied.warnings,
    rejected: applied.rejected,
    truncated: applied.truncated,
    log: logs,
  }, null, 2);
}

const defaultSave: SaveFile = SaveFileSchema.parse({
  schemaVersion: 3,
  meta: { id: 'local-save', title: '我的世界', createdAt: now(), updatedAt: now(), appVersion: '0.0.1' },
  config: { calendar: { slots: [...DEFAULT_SLOT_DEFS], daysPerWeek: 7, weekdayNames: ['一', '二', '三', '四', '五', '六', '日'], preset: 'standard', unlimitedSlots: false }, actionCosts: { ...DEFAULT_ACTION_COSTS }, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 },
  world: {
    clock: { day: 1, slotId: 'morning' },
    slotsUsedToday: 0,
    player: { name: '旅人', nodeId: 'start', stats: { 'custom-reputation': 0 }, flags: {}, inventory: [] },
    stats: {}, flags: {},
    items: { 'white-flower': { id: 'white-flower', name: '白色小花', tags: ['flower'], description: '一朵可用于 Mock 验收的白色小花。', stackable: true, giftable: true } },
    relations: {},
    diary: [], settlements: [],
  },
});

export function App() {
  const [tab, setTab] = useState<Tab>('map');
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [worldbooks, setWorldbooks] = useState<WorldbookEntry[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetBundles, setPresetBundles] = useState<PresetBundle[]>([]);
  const [selectedPresetBundleId, setSelectedPresetBundleId] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const [loadedChatCharacterId, setLoadedChatCharacterId] = useState('');
  const [name, setName] = useState('');
  const [draftText, setDraftText] = useState('');
  const [presetBundleName, setPresetBundleName] = useState('');
  const [editing, setEditing] = useState<{ kind: ContentKind; id: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [provider, setProvider] = useState<ProviderConfig>(newProvider);
  const [bindings, setBindings] = useState<ProviderBinding[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState('');
  const [headersDraft, setHeadersDraft] = useState('{}');
  const [models, setModels] = useState<string[]>([]);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [save, setSave] = useState<SaveFile>(defaultSave);
  const saveRef = useRef(save);
  const pendingDiaryDaysRef = useRef<number[]>([]);
  const [pendingOps, setPendingOps] = useState<PendingOpsRecovery | null>(null);
  const [manualOps, setManualOps] = useState('[]');
  const [mockFixtureId, setMockFixtureId] = useState<MockFixtureId | ''>('');
  const [itemName, setItemName] = useState('');
  const [itemTags, setItemTags] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [statKey, setStatKey] = useState('');
  const [statValue, setStatValue] = useState('0');
  const [includeChatsOnExport, setIncludeChatsOnExport] = useState(true);
  const [summarizingDay, setSummarizingDay] = useState<number | null>(null);
  const [debugTab, setDebugTab] = useState<'Prompt' | 'Raw' | 'Ops' | 'State'>('Prompt');
  const [debug, setDebug] = useState<DebugState>({ prompt: null, raw: '', ops: '尚未解析状态变化。', state: JSON.stringify(defaultSave, null, 2) });

  useEffect(() => {
    void Promise.all([contentDb.characters.toArray(), contentDb.worldbooks.toArray(), contentDb.presets.toArray(), contentDb.presetBundles.toArray(), providerDb.providers.toArray(), providerDb.bindings.toArray(), providerDb.settings.get('defaultProviderId')]).then(([c, w, p, bundles, ps, bs, setting]) => {
      const validBundles = bundles.flatMap((bundle) => {
        const parsed = PresetBundleSchema.safeParse(bundle);
        return parsed.success ? [parsed.data] : [];
      });
      const fallback = validBundles.length || !p.length ? validBundles : [{ id: 'bundle-legacy', name: '默认预设包', entries: p, updatedAt: now() }];
      setCharacters(c); setWorldbooks(w); setPresets(p); setPresetBundles(fallback); setSelectedPresetBundleId(fallback[0]?.id ?? ''); setProviders(ps);
      if (!validBundles.length && fallback[0]) void savePresetBundle(fallback[0]);
      setBindings(bs);
      if (c[0]) setSelectedCharacterId(c[0].id);
      if (ps[0]) setProvider(ps[0]);
      const resolvedDefaultProviderId = ps.some((item) => item.id === setting?.value) ? setting?.value ?? '' : ps[0]?.id ?? '';
      setDefaultProviderId(resolvedDefaultProviderId);
      if (resolvedDefaultProviderId && setting?.value !== resolvedDefaultProviderId) {
        void providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: resolvedDefaultProviderId }));
      }
    });
  }, []);

  useEffect(() => { setHeadersDraft(JSON.stringify(provider.headers ?? {}, null, 2)); }, [provider.id]);

  useEffect(() => {
    let cancelled = false;
    setLoadedChatCharacterId('');
    if (!selectedCharacterId) { setMessages([]); return () => { cancelled = true; }; }
    setMessages([]);
    void loadChat(selectedCharacterId).then((record) => {
      if (!cancelled) { setMessages(record?.messages ?? []); setLoadedChatCharacterId(selectedCharacterId); }
    });
    return () => { cancelled = true; };
  }, [selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacterId || loadedChatCharacterId !== selectedCharacterId) return;
    const timeout = window.setTimeout(() => { void saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() }); }, 150);
    return () => window.clearTimeout(timeout);
  }, [loadedChatCharacterId, messages, selectedCharacterId]);

  const activeCharacter = characters.find((item) => item.id === selectedCharacterId);
  const promptEvents = useMemo(() => new EventBus(), []);
  const opRegistry = useMemo(() => createDefaultOpRegistry(), []);
  const assembler = useMemo(() => {
    const instance = new PromptAssembler();
    for (const block of createDefaultPromptBlocks(opRegistry.promptDocs())) instance.register(block);
    return instance;
  }, [opRegistry]);

  useEffect(() => promptEvents.subscribe('onDaySettle', ({ day }) => {
    if (!pendingDiaryDaysRef.current.includes(day)) pendingDiaryDaysRef.current.push(day);
  }), [promptEvents]);

  function commitSave(next: SaveFile): void {
    const parsed = SaveFileSchema.parse({ ...next, meta: { ...next.meta, updatedAt: now() } });
    saveRef.current = parsed;
    setSave(parsed);
    setDebug((current) => ({ ...current, state: JSON.stringify(parsed, null, 2) }));
    const settledDays = pendingDiaryDaysRef.current.splice(0);
    if (settledDays.length) queueMicrotask(() => settledDays.forEach((day) => { void generateDayDiary(day); }));
  }

  async function generateDayDiary(day: number): Promise<void> {
    const settlement = saveRef.current.world.settlements.find((item) => item.day === day);
    const diaryProvider = resolveProviderForTask(providers, bindings, 'summarize_day', defaultProviderId);
    if (!settlement || !diaryProvider) return;
    setSummarizingDay(day);
    let generated = '';
    const splitter = new OpsStreamSplitter();
    try {
      const parsed = ProviderConfigSchema.parse(diaryProvider);
      await streamChat(parsed, [
        { role: 'system', content: '根据确定性日结事实写一段简短中文日记。只返回日记正文，不输出 JSON、ops 或未提供的事实。' },
        { role: 'user', content: JSON.stringify(settlement) },
      ], (delta) => { generated += splitter.push(delta); }, { taskId: 'summarize_day' });
      generated += splitter.finish().text;
      const text = generated.trim();
      if (!text) return;
      const next = structuredClone(saveRef.current);
      const diaryEntry = next.world.diary.find((entry) => entry.day === day);
      if (!diaryEntry || diaryEntry.editedAt) return;
      diaryEntry.text = text;
      const nextSettlement = next.world.settlements.find((item) => item.day === day);
      if (nextSettlement) nextSettlement.diary = text;
      commitSave(next);
      setFeedback({ tone: 'success', text: `第 ${day} 天日记已生成；仍可手动编辑。` });
    } catch (error) {
      setFeedback({ tone: 'info', text: `第 ${day} 天已使用本地事实日记：${errorMessage(error, '日记生成失败')}` });
    } finally {
      setSummarizingDay((current) => current === day ? null : current);
    }
  }

  function runDayAction(kind: string): void {
    const next = structuredClone(saveRef.current);
    const result = advanceAction(next.world, next.config.calendar, next.config.actionCosts, kind, promptEvents);
    commitSave(next);
    if (result.settledDays.length) {
      setTab('day');
      setFeedback({ tone: 'success', text: `第 ${result.settledDays.at(-1)} 天已结算，已进入下一天。` });
      return;
    }
    setFeedback({ tone: 'info', text: result.advanced ? `行动完成，消耗 ${result.advanced} 个时段。` : '当前模式不消耗时段。' });
  }

  function sleepEarly(): void {
    const next = structuredClone(saveRef.current);
    const settlement = endDay(next.world, next.config.calendar, promptEvents);
    commitSave(next);
    setTab('day');
    setFeedback({ tone: 'success', text: `第 ${settlement.day} 天已提前结算，已进入下一天。` });
  }

  function saveDiaryEdit(day: number, text: string): void {
    if (!text.trim()) { setFeedback({ tone: 'error', text: '日记内容不能为空。' }); return; }
    const next = structuredClone(saveRef.current);
    if (!updateDiaryEntry(next.world, day, text.trim(), now())) return;
    commitSave(next);
    setFeedback({ tone: 'success', text: `第 ${day} 天日记已保存。` });
  }

  function setCalendarPreset(preset: SaveFile['config']['calendar']['preset']): void {
    if (saveRef.current.world.slotsUsedToday > 0) { setFeedback({ tone: 'info', text: '请在一天开始、尚未消耗时段时切换节奏。' }); return; }
    const next = structuredClone(saveRef.current);
    next.config.calendar.preset = preset;
    next.config.calendar.unlimitedSlots = preset === 'sandbox';
    const orderedSlots = [...next.config.calendar.slots].sort((a, b) => a.order - b.order);
    next.world.clock.slotId = orderedSlots[0]?.id ?? next.world.clock.slotId;
    commitSave(next);
    setFeedback({ tone: 'success', text: `每日节奏已切换为 ${preset}。` });
  }

  async function appendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    if (!selectedCharacterId) { setFeedback({ tone: 'error', text: '请先选择聊天角色。' }); return; }
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next); setInput(''); setRequestStatus('idle');
    setFeedback({ tone: 'info', text: '消息已发送，点击“生成回复”后才会请求 API。' });
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
  }

  async function generateReply() {
    if (busy) return;
    if (!selectedCharacterId) { setFeedback({ tone: 'error', text: '请先选择聊天角色。' }); return; }
    const text = input.trim();
    const next = text ? [...messages, { role: 'user' as const, content: text }] : messages;
    if (!hasQueuedUserMessage(next) && next.length === 0) { setFeedback({ tone: 'error', text: '请先发送第一条消息。' }); return; }
    const routedProvider = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForTask(providers, bindings, 'narrate_main', defaultProviderId);
    let parsed: ProviderConfig;
    try {
      if (!routedProvider) throw new Error('请先保存并设置默认 Provider，或在高级调试中启用 Mock fixture。');
      parsed = ProviderConfigSchema.parse(routedProvider);
    } catch (error) { setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效，请在设置中检查基础 URL、模型与渠道。') }); return; }

    setMessages(next); setInput(''); setBusy(true); setRequestStatus('requesting'); setFeedback(null); setPendingOps(null);
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
    let narrative = '';
    const splitter = new OpsStreamSplitter();
    const latestInput = [...next].reverse().find((message) => message.role === 'user')?.content ?? '';
    const activePresetBundle = presetBundles.find((item) => item.id === selectedPresetBundleId);
    const promptFacts = { input: latestInput, character: activeCharacter, presetBundle: activePresetBundle, worldbooks, history: next, world: saveRef.current.world };
    promptEvents.emit('beforePromptAssemble', { facts: promptFacts, task: 'narrate_main' });
    const assembled = assembler.assemble(promptFacts, { budget: Math.max(1, parsed.contextWindow - parsed.maxOutputTokens), task: 'narrate_main' });
    setDebug((current) => ({ ...current, prompt: assembled }));
    try {
      await streamChat(parsed, assembled.messages, (delta) => {
        narrative += splitter.push(delta);
        setMessages([...next, { role: 'assistant', content: narrative }]);
      }, { taskId: 'narrate_main', onStatus: (status) => setRequestStatus(status) });
      const finished = splitter.finish();
      narrative += finished.text;
      const completed = [...next, { role: 'assistant' as const, content: narrative }];
      setMessages(completed);
      await saveChat({ characterId: selectedCharacterId, messages: completed, updatedAt: now() });
      const reply = await parseReply(finished.raw, extractOps);
      applyReplyOps(reply, selectedCharacterId);
    } catch (error) {
      const message = errorMessage(error, '请求失败');
      const finished = splitter.finish();
      narrative += finished.text;
      if (narrative) {
        const completed = [...next, { role: 'assistant' as const, content: narrative }];
        setMessages(completed);
        await saveChat({ characterId: selectedCharacterId, messages: completed, updatedAt: now() });
      } else {
        setMessages(next);
      }
      setRequestStatus('error'); setFeedback({ tone: 'error', text: message });
      if (finished.raw) setPendingOps({ raw: finished.raw, actorId: selectedCharacterId, streamError: message });
      setDebug((current) => ({
        ...current,
        raw: finished.raw || message,
        ops: JSON.stringify({ stage: 'stream-error', applied: 0, warnings: [message], message: '本回合未产生状态变更。' }, null, 2),
      }));
    } finally { setBusy(false); }
  }

  async function extractOps(rawReply: string): Promise<string> {
    const candidate = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForTask(providers, bindings, 'extract_ops', defaultProviderId);
    if (!candidate) throw new Error('未配置 extract_ops Provider 或默认 Provider。');
    const extractProvider = ProviderConfigSchema.parse(candidate);
    let extracted = '';
    await streamChat(extractProvider, [
      { role: 'system', content: '只从回复中提取状态变化，严格输出 JSON ops 数组，不要输出正文、Markdown 或解释。无法提取时输出 []。' },
      { role: 'user', content: rawReply },
    ], (delta) => { extracted += delta; }, { taskId: 'extract_ops' });
    return extracted;
  }

  function applyReplyOps(reply: ParsedReply, actorId?: string): void {
    if (reply.opsFailed) {
      setPendingOps({ raw: reply.raw, actorId });
      setManualOps('[]');
      setDebug((current) => ({ ...current, raw: reply.raw, ops: JSON.stringify({ stage: reply.stage, opsFailed: true, warnings: reply.warnings, message: '本回合未产生状态变更。' }, null, 2) }));
      setFeedback({ tone: 'info', text: '回复正文已保留，但状态变化解析失败；本回合未产生状态变更。' });
      return;
    }

    const nextSave = structuredClone(saveRef.current);
    const logs: string[] = [];
    const world = nextSave.world;
    const applied = opRegistry.applyAll(reply.ops, {
      world,
      actorId,
      day: world.clock.day,
      slotId: world.clock.slotId,
      nodeId: world.player.nodeId,
      calendar: nextSave.config.calendar,
      actionCosts: nextSave.config.actionCosts,
      events: promptEvents,
      log: (message) => logs.push(message),
    }, nextSave.config.opsLimitPerTurn);
    commitSave(nextSave);
    promptEvents.emit('onOpsApply', { changes: applied.changes });
    setPendingOps(null);
    setManualOps('[]');
    setDebug((current) => ({ ...current, raw: reply.raw, ops: formatOpsDebug(reply, applied, logs) }));
    const issues = reply.warnings.length + applied.warnings.length + applied.rejected.length + applied.truncated;
    setFeedback({
      tone: issues ? 'info' : 'success',
      text: applied.changes.length ? `回复已生成并应用 ${applied.applied} 个状态操作。` : '回复已生成，本回合没有状态变化。',
    });
  }

  async function retryOpsExtraction(): Promise<void> {
    if (!pendingOps || busy) return;
    setBusy(true); setRequestStatus('requesting'); setFeedback({ tone: 'info', text: '正在重新提取状态变化…' });
    try {
      const reply = await parseReply(pendingOps.raw, extractOps);
      applyReplyOps(reply, pendingOps.actorId);
      setRequestStatus('success');
    } catch (error) {
      setRequestStatus('error');
      setFeedback({ tone: 'error', text: errorMessage(error, '重新提取失败，本回合仍未产生状态变更。') });
    } finally { setBusy(false); }
  }

  async function applyManualOps(): Promise<void> {
    if (!pendingOps || busy) return;
    const reply = await parseReply(`手动补录\n<ops>\n${manualOps}\n</ops>`);
    if (reply.opsFailed) {
      setFeedback({ tone: 'error', text: '手动 ops 不是有效的 JSON 数组。' });
      return;
    }
    applyReplyOps({ ...reply, raw: pendingOps.raw }, pendingOps.actorId);
  }

  function addItemDefinition(): void {
    const trimmedName = itemName.trim();
    if (!trimmedName) return;
    const id = slug(trimmedName);
    const next = structuredClone(saveRef.current);
    next.world.items[id] = {
      id,
      name: trimmedName,
      tags: itemTags.split(',').map((tag) => tag.trim()).filter(Boolean),
      ...(itemDescription.trim() ? { description: itemDescription.trim() } : {}),
      stackable: true,
      giftable: true,
    };
    commitSave(next);
    setItemName(''); setItemTags(''); setItemDescription('');
    setFeedback({ tone: 'success', text: `物品定义 ${trimmedName} 已保存。` });
  }

  function addCustomStat(): void {
    const key = slug(statKey);
    const value = Number(statValue);
    if (!statKey.trim() || !Number.isFinite(value)) {
      setFeedback({ tone: 'error', text: '请输入 stat 名称和有效数字。' });
      return;
    }
    const next = structuredClone(saveRef.current);
    next.world.player.stats[key] = value;
    commitSave(next);
    setStatKey(''); setStatValue('0');
    setFeedback({ tone: 'success', text: `自定义 stat ${key} 已保存。` });
  }

  function parseEditedProvider(): ProviderConfig {
    const candidate = provider.kind === 'generic' ? { ...provider, headers: parseHeadersDraft(headersDraft) } : provider;
    return ProviderConfigSchema.parse(candidate);
  }

  async function saveProviderConfig() {
    try {
      const parsed = parseEditedProvider();
      const needsDefault = !defaultProviderId || !providers.some((item) => item.id === defaultProviderId);
      await providerDb.transaction('rw', providerDb.providers, providerDb.settings, async () => {
        await providerDb.providers.put(parsed);
        if (needsDefault) await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: parsed.id }));
      });
      setProviders(await providerDb.providers.toArray()); setProvider(parsed); setRequestStatus('success');
      if (needsDefault) setDefaultProviderId(parsed.id);
      setFeedback({ tone: 'success', text: 'Provider 配置已保存到此浏览器。' });
    } catch (error) { setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效，请检查基础 URL、模型和数值参数。') }); }
  }

  async function deleteProviderConfig() {
    if (!providers.some((item) => item.id === provider.id)) return;
    const storedBindings = await providerDb.bindings.toArray();
    const remaining = providers.filter((item) => item.id !== provider.id);
    const nextDefaultProviderId = remaining.some((item) => item.id === defaultProviderId) ? defaultProviderId : remaining[0]?.id ?? '';
    await providerDb.transaction('rw', providerDb.providers, providerDb.bindings, providerDb.settings, async () => {
      await providerDb.providers.delete(provider.id);
      await providerDb.bindings.bulkDelete(storedBindings.filter((binding) => binding.providerId === provider.id).map((binding) => binding.taskId));
      if (nextDefaultProviderId) await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: nextDefaultProviderId }));
      else await providerDb.settings.delete('defaultProviderId');
    });
    setProviders(remaining); setBindings(storedBindings.filter((binding) => binding.providerId !== provider.id)); setDefaultProviderId(nextDefaultProviderId);
    setProvider(remaining[0] ?? newProvider()); setModels([]);
    setFeedback({ tone: 'success', text: 'Provider 配置已删除，相关任务绑定已清理。' });
  }

  async function updateDefaultProvider(providerId: string) {
    if (!providers.some((item) => item.id === providerId)) return;
    await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: providerId }));
    setDefaultProviderId(providerId);
    setFeedback({ tone: 'success', text: '默认 Provider 已更新。' });
  }

  async function updateTaskBinding(taskId: TaskId, providerId: string) {
    if (!providerId) {
      await providerDb.bindings.delete(taskId);
      setBindings((items) => items.filter((item) => item.taskId !== taskId));
    } else {
      if (!providers.some((item) => item.id === providerId)) return;
      const binding = ProviderBindingSchema.parse({ taskId, providerId });
      await providerDb.bindings.put(binding);
      setBindings((items) => [...items.filter((item) => item.taskId !== taskId), binding]);
    }
    setFeedback({ tone: 'success', text: `${TASK_LABELS[taskId]}路由已更新。` });
  }

  async function discoverModels() {
    setRequestStatus('requesting'); setFeedback({ tone: 'info', text: '正在拉取模型列表…' });
    try {
      const found = await listProviderModels(provider);
      setModels(found);
      setProvider((current) => ({ ...current, model: '' }));
      setRequestStatus('success'); setFeedback({ tone: 'success', text: `已发现 ${found.length} 个模型，请在模型栏中选择。` });
      setDebug((current) => ({ ...current, raw: `已发现 ${found.length} 个模型。` }));
    } catch (error) {
      const message = errorMessage(error, '模型列表获取失败，请手动填写模型名。');
      setRequestStatus('error'); setFeedback({ tone: 'error', text: message });
      setDebug((current) => ({ ...current, raw: message }));
    }
  }

  async function testConnection() {
    setRequestStatus('requesting'); setFeedback({ tone: 'info', text: '正在测试连接…' });
    try {
      const result = await testProviderConnection(parseEditedProvider());
      const message = `${result.message}${result.suggestion ? `：${result.suggestion}` : ''}`;
      setRequestStatus(result.ok ? 'success' : 'error'); setFeedback({ tone: result.ok ? 'success' : 'error', text: message });
      setDebug((current) => ({ ...current, raw: message }));
    } catch (error) { setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效，请检查基础 URL、模型与渠道。') }); }
  }

  async function addContent(kind: ContentKind) {
    if (!name.trim()) return;
    const id = editing?.kind === kind ? editing.id : slug(name);
    if (kind === 'character') { const item = await saveCharacter({ id, name, description: draftText, personality: '', updatedAt: now() }); setCharacters((items) => [...items.filter((old) => old.id !== id), item]); if (!selectedCharacterId) setSelectedCharacterId(id); }
    if (kind === 'worldbook') { const item = await saveWorldbook({ id, name, content: draftText, keys: [], enabled: true, priority: 50 }); setWorldbooks((items) => [...items.filter((old) => old.id !== id), item]); }
    if (kind === 'preset') {
      const item = await savePreset({ id, name, systemPrompt: draftText, temperature: 0.7, maxOutputTokens: 1024, updatedAt: now() });
      const current = presetBundles.find((bundle) => bundle.id === selectedPresetBundleId);
      const bundle = current ?? { id: `bundle-${slug(name)}`, name: `${name}预设包`, entries: [], updatedAt: now() };
      const updated = await savePresetBundle({ ...bundle, entries: [...bundle.entries.filter((entry) => entry.id !== id), item], updatedAt: now() });
      setPresets((items) => [...items.filter((old) => old.id !== id), item]);
      setPresetBundles((items) => [...items.filter((old) => old.id !== updated.id), updated]);
      if (!selectedPresetBundleId) setSelectedPresetBundleId(updated.id);
    }
    setName(''); setDraftText(''); setEditing(null); setFeedback({ tone: 'success', text: '内容已保存。' });
  }

  function downloadJson(kind: ContentKind, value: unknown, nameValue: string) {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `${slug(nameValue)}.${kind}.json`; anchor.click(); URL.revokeObjectURL(url);
  }

  async function importContent(kind: ContentKind, file?: File) {
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      if (kind === 'character') { const item = await saveCharacter(value as CharacterCard); setCharacters((items) => [...items.filter((old) => old.id !== item.id), item]); }
      if (kind === 'worldbook') { const item = await saveWorldbook(value as WorldbookEntry); setWorldbooks((items) => [...items.filter((old) => old.id !== item.id), item]); }
      if (kind === 'preset') {
        const item = await savePreset(value as Preset);
        const current = presetBundles.find((bundle) => bundle.id === selectedPresetBundleId);
        const bundle = current ?? { id: `bundle-${slug(item.name)}`, name: `${item.name}预设包`, entries: [], updatedAt: now() };
        const updated = await savePresetBundle({ ...bundle, entries: [...bundle.entries.filter((entry) => entry.id !== item.id), item], updatedAt: now() });
        setPresets((items) => [...items.filter((old) => old.id !== item.id), item]);
        setPresetBundles((items) => [...items.filter((old) => old.id !== updated.id), updated]);
        if (!selectedPresetBundleId) setSelectedPresetBundleId(updated.id);
      }
      setFeedback({ tone: 'success', text: '导入成功。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '导入失败') }); }
  }

  async function exportPresetBundleFile(): Promise<void> {
    const bundle = presetBundles.find((item) => item.id === selectedPresetBundleId);
    if (!bundle) { setFeedback({ tone: 'error', text: '请先创建或选择一个预设包。' }); return; }
    const blob = await exportPresetBundle(bundle);
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tokimeki-presets.zip'; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: `已导出预设包“${bundle.name}”（${bundle.entries.length} 个条目）。` });
  }

  async function importPresetBundleFile(file?: File): Promise<void> {
    if (!file) return;
    try {
      const imported = await importPresetBundle(file);
      const bundle = await savePresetBundle(imported);
      setPresets((current) => [...current.filter((old) => !bundle.entries.some((item) => item.id === old.id)), ...bundle.entries]);
      setPresetBundles((current) => [...current.filter((old) => old.id !== bundle.id), bundle]);
      setSelectedPresetBundleId(bundle.id);
      setFeedback({ tone: 'success', text: `已导入预设包“${bundle.name}”（${bundle.entries.length} 个条目）。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '预设包导入失败') }); }
  }

  async function createPresetBundle(): Promise<void> {
    const bundleName = presetBundleName.trim();
    if (!bundleName) { setFeedback({ tone: 'error', text: '请先填写预设包名称。' }); return; }
    const bundle = await savePresetBundle({ id: `bundle-${slug(bundleName)}`, name: bundleName, entries: [], updatedAt: now() });
    setPresetBundles((items) => [...items.filter((item) => item.id !== bundle.id), bundle]);
    setSelectedPresetBundleId(bundle.id); setPresetBundleName('');
    setFeedback({ tone: 'success', text: `已创建预设包“${bundle.name}”，现在可以添加预设条目。` });
  }

  async function renamePresetBundle(): Promise<void> {
    const bundleName = presetBundleName.trim();
    const current = presetBundles.find((item) => item.id === selectedPresetBundleId);
    if (!current || !bundleName) return;
    const bundle = await savePresetBundle({ ...current, name: bundleName, updatedAt: now() });
    setPresetBundles((items) => items.map((item) => item.id === bundle.id ? bundle : item));
    setPresetBundleName(''); setFeedback({ tone: 'success', text: '预设包名称已更新。' });
  }

  async function removePresetBundle(id: string): Promise<void> {
    await deletePresetBundle(id);
    const remaining = presetBundles.filter((item) => item.id !== id);
    setPresetBundles(remaining);
    if (selectedPresetBundleId === id) setSelectedPresetBundleId(remaining[0]?.id ?? '');
    setFeedback({ tone: 'success', text: '预设包已删除。' });
  }

  async function downloadSave() {
    if (selectedCharacterId) await saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
    const extras: Record<string, unknown> = { characters, worldbooks, presets, presetBundles };
    if (includeChatsOnExport) extras.chats = await contentDb.chats.toArray();
    const blob = await exportSaveZip(saveRef.current, {}, extras);
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tokimeki-save.zip'; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: `存档已导出${includeChatsOnExport ? '，包含聊天记录' : '，未包含聊天记录'}；Provider 配置与 API key 未包含在内。` });
  }

  async function clearAllChats(): Promise<void> {
    if (!window.confirm('确定清除全部聊天记录吗？此操作不可撤销。')) return;
    await clearChats();
    setMessages([]); setLoadedChatCharacterId(selectedCharacterId);
    setFeedback({ tone: 'success', text: '全部聊天记录已清除；角色卡、世界状态和其他资料未受影响。' });
  }

  async function loadSave(file?: File) {
    if (!file) return;
    try {
      const imported = await importSaveZip(file); const extra = imported.extras;
      if (Array.isArray(extra.characters)) { const items = await Promise.all((extra.characters as CharacterCard[]).map(saveCharacter)); setCharacters(items); if (items[0]) setSelectedCharacterId(items[0].id); }
      if (Array.isArray(extra.worldbooks)) { const items = await Promise.all((extra.worldbooks as WorldbookEntry[]).map(saveWorldbook)); setWorldbooks(items); }
      if (Array.isArray(extra.presets)) { const items = await Promise.all((extra.presets as Preset[]).map(savePreset)); setPresets(items); }
      if (Array.isArray(extra.presetBundles)) { const bundles = await Promise.all((extra.presetBundles as PresetBundle[]).map(savePresetBundle)); setPresetBundles(bundles); setSelectedPresetBundleId(bundles[0]?.id ?? ''); }
      else if (Array.isArray(extra.presets) && extra.presets.length > 0) {
        const bundle = await savePresetBundle({ id: 'bundle-imported', name: '导入的预设包', entries: extra.presets as Preset[], updatedAt: now() });
        setPresetBundles([bundle]); setSelectedPresetBundleId(bundle.id);
      }
      const importedChats = Array.isArray(extra.chats)
        ? await Promise.all((extra.chats as ChatRecord[]).map(saveChat))
        : [];
      const legacyChat = extra.chat as { characterId?: string; messages?: ChatMessage[] } | undefined;
      if (importedChats.length === 0 && legacyChat?.characterId && Array.isArray(legacyChat.messages)) {
        importedChats.push(await saveChat({ characterId: legacyChat.characterId, messages: legacyChat.messages, updatedAt: now() }));
      }
      const activeImportedChat = importedChats.find((record) => record.characterId === selectedCharacterId) ?? importedChats[0];
      if (activeImportedChat) {
        setSelectedCharacterId(activeImportedChat.characterId); setMessages(activeImportedChat.messages); setLoadedChatCharacterId(activeImportedChat.characterId);
      }
      commitSave(imported.save);
      setDebug((current) => ({ ...current, raw: '已导入存档与内容；Provider 设置未改变。' }));
      setFeedback({ tone: 'success', text: '导入成功；Provider 配置与 API key 未覆盖。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '导入失败') }); }
  }

  const onDelete = async (kind: ContentKind, id: string) => {
    if (kind === 'character') { await deleteCharacter(id); setCharacters((items) => items.filter((item) => item.id !== id)); if (selectedCharacterId === id) setSelectedCharacterId(''); }
    if (kind === 'worldbook') { await deleteWorldbook(id); setWorldbooks((items) => items.filter((item) => item.id !== id)); }
    if (kind === 'preset') {
      await deletePreset(id);
      const affected = presetBundles.filter((bundle) => bundle.entries.some((entry) => entry.id === id));
      const updated = await Promise.all(affected.map((bundle) => savePresetBundle({ ...bundle, entries: bundle.entries.filter((entry) => entry.id !== id), updatedAt: now() })));
      setPresetBundles((items) => items.map((bundle) => updated.find((item) => item.id === bundle.id) ?? bundle));
      setPresets((items) => items.filter((item) => item.id !== id));
    }
    setFeedback({ tone: 'success', text: '内容已删除。' });
  };

  return <div className="app-shell">
    <header className="topbar"><div><small>第 {save.world.clock.day} 天 · {save.world.clock.slotId}</small><h1>Tokimeki</h1></div></header>
    <main className={`screen ${tab === 'chat' ? 'chat-screen-host' : ''}`}>
      {feedback && <div className={`feedback ${feedback.tone}`} role="status">{feedback.text}<button aria-label="关闭提示" onClick={() => setFeedback(null)}>×</button></div>}
      {tab === 'map' && <MapView onOpenChat={() => setTab('chat')} />}
      {tab === 'day' && <DayView save={save} summarizingDay={summarizingDay} onAction={runDayAction} onSleep={sleepEarly} onSaveDiary={saveDiaryEdit} onPresetChange={setCalendarPreset} />}
      {tab === 'chat' && <ChatView characters={characters} selectedCharacterId={selectedCharacterId} setSelectedCharacterId={setSelectedCharacterId} messages={messages} input={input} setInput={setInput} onAppend={appendMessage} onGenerate={generateReply} requestStatus={requestStatus} busy={busy} pendingOps={pendingOps} manualOps={manualOps} setManualOps={setManualOps} onRetryOps={retryOpsExtraction} onApplyManualOps={applyManualOps} />}
      {tab === 'library' && <LibraryView characters={characters} worldbooks={worldbooks} presets={presets} presetBundles={presetBundles} selectedPresetBundleId={selectedPresetBundleId} setSelectedPresetBundleId={setSelectedPresetBundleId} presetBundleName={presetBundleName} setPresetBundleName={setPresetBundleName} onCreatePresetBundle={createPresetBundle} onRenamePresetBundle={renamePresetBundle} onDeletePresetBundle={removePresetBundle} save={save} name={name} setName={setName} draftText={draftText} setDraftText={setDraftText} editing={editing} setEditing={setEditing} addContent={addContent} onDelete={onDelete} onExport={downloadJson} onImport={importContent} onExportSave={downloadSave} onImportSave={loadSave} onExportPresetBundle={exportPresetBundleFile} onImportPresetBundle={importPresetBundleFile} includeChatsOnExport={includeChatsOnExport} setIncludeChatsOnExport={setIncludeChatsOnExport} onClearChats={clearAllChats} itemName={itemName} setItemName={setItemName} itemTags={itemTags} setItemTags={setItemTags} itemDescription={itemDescription} setItemDescription={setItemDescription} onAddItem={addItemDefinition} />}
      {tab === 'settings' && <SettingsView provider={provider} setProvider={setProvider} providers={providers} bindings={bindings} defaultProviderId={defaultProviderId} headersDraft={headersDraft} setHeadersDraft={setHeadersDraft} models={models} requestStatus={requestStatus} onNewProvider={() => { setProvider(newProvider()); setModels([]); }} onSaveProvider={saveProviderConfig} onDeleteProvider={deleteProviderConfig} onDiscoverModels={discoverModels} onTestConnection={testConnection} onDefaultProviderChange={updateDefaultProvider} onBindingChange={updateTaskBinding} debug={debug} debugTab={debugTab} setDebugTab={setDebugTab} save={save} statKey={statKey} setStatKey={setStatKey} statValue={statValue} setStatValue={setStatValue} onAddStat={addCustomStat} mockFixtureId={mockFixtureId} setMockFixtureId={setMockFixtureId} />}
    </main>
    <nav className="bottom-nav">{([['map', '地图'], ['day', '日程'], ['chat', '聊天'], ['library', '资料'], ['settings', '设置']] as const).map(([id, label]) => <button key={id} className={tab === id ? 'selected' : ''} onClick={() => setTab(id)}>{label}</button>)}</nav>
  </div>;
}

function MapView({ onOpenChat }: { onOpenChat: () => void }) {
  return <section className="map-screen"><div className="map-canvas"><span className="map-pin active">你</span><span className="map-pin pin-a">旧市场</span><span className="map-pin pin-b">西码头</span><div className="map-road road-a" /><div className="map-road road-b" /></div><div className="place-card"><span className="eyebrow">当前位置</span><h2>起点街区</h2><p>从地图出发，去遇见今天的世界。</p><button onClick={onOpenChat}>打开聊天</button></div></section>;
}

function DayView(props: { save: SaveFile; summarizingDay: number | null; onAction: (kind: string) => void; onSleep: () => void; onSaveDiary: (day: number, text: string) => void; onPresetChange: (preset: SaveFile['config']['calendar']['preset']) => void }) {
  const { calendar } = props.save.config;
  const capacity = availableSlots(calendar);
  const used = props.save.world.slotsUsedToday;
  const remaining = Math.max(0, capacity - used);
  const latestSettlement = props.save.world.settlements.at(-1);
  const latestDiary = latestSettlement ? props.save.world.diary.find((entry) => entry.day === latestSettlement.day) : undefined;
  const archivedDiaries = [...props.save.world.diary].filter((entry) => entry.day !== latestDiary?.day).sort((a, b) => b.day - a.day);
  const slotName = calendar.slots.find((slot) => slot.id === props.save.world.clock.slotId)?.name ?? props.save.world.clock.slotId;
  const actionButtons = [
    { kind: 'explore', label: '探索', cost: props.save.config.actionCosts.explore?.slotCost ?? 0 },
    { kind: 'rest', label: '休息', cost: props.save.config.actionCosts.rest?.slotCost ?? 0 },
    { kind: 'work', label: '工作', cost: props.save.config.actionCosts.work?.slotCost ?? 0 },
  ];
  return <section>
    <div className="section-heading"><div><span className="eyebrow">生活节奏</span><h2>第 {props.save.world.clock.day} 天 · {slotName}</h2></div><span className="slot-count">{calendar.unlimitedSlots ? '无限时段' : `${used} / ${capacity}`}</span></div>
    <div className="day-card"><label>每日节奏<select value={calendar.preset} disabled={used > 0} onChange={(event) => props.onPresetChange(event.target.value as SaveFile['config']['calendar']['preset'])}><option value="leisure">悠闲 · 6 时段</option><option value="standard">标准 · 4 时段</option><option value="tight">紧凑 · 3 时段</option><option value="sandbox">沙盒 · 不消耗</option></select></label><p className="io-scope">行动只修改本地确定性状态，不调用 API。节奏仅能在当天尚未行动时切换。</p><div className="day-actions">{actionButtons.map((action) => <button key={action.kind} onClick={() => props.onAction(action.kind)} disabled={!calendar.unlimitedSlots && action.cost > remaining}>{action.label}<small>{calendar.unlimitedSlots ? '不消耗' : `${action.cost} 时段`}</small></button>)}<button className="secondary" onClick={props.onSleep}>提前休息<small>结算今天</small></button></div></div>
    <div className="settlement-card"><div className="list-heading"><h3>最近结算</h3>{props.summarizingDay === latestSettlement?.day && <span className="request-status requesting">正在生成日记…</span>}</div>{latestSettlement ? <><div className="settlement-grid"><span>日期<strong>第 {latestSettlement.day} 天</strong></span><span>足迹<strong>{latestSettlement.footprint.join('、') || '无'}</strong></span><span>遇见<strong>{latestSettlement.met.join('、') || '无人'}</strong></span><span>收支<strong>{latestSettlement.income - latestSettlement.expense}</strong></span><span>新物品<strong>{latestSettlement.itemsGained.length ? latestSettlement.itemsGained.map((entry) => `${entry.itemId} ×${entry.count}`).join('、') : '无'}</strong></span><span>明日待办<strong>{latestSettlement.appointmentsTomorrow.length ? latestSettlement.appointmentsTomorrow.map((item) => item.note ?? item.id).join('、') : '无'}</strong></span></div><div className="relation-summary"><strong>关系变化</strong>{latestSettlement.relationChanges.length ? latestSettlement.relationChanges.map((change) => <p key={change.charId}>{change.prose}</p>) : <p className="empty">本阶段暂无相遇记录。</p>}</div>{latestDiary && <DiaryEditor entry={latestDiary} onSave={props.onSaveDiary} />}</> : <p className="empty">完成今天或选择提前休息后，这里会显示日结算与日记。</p>}</div>
    <div className="diary-archive"><div className="list-heading"><h3>日记回顾</h3><span className="io-scope">共 {props.save.world.diary.length} 天</span></div>{archivedDiaries.length ? archivedDiaries.map((entry) => <details key={entry.day}><summary>第 {entry.day} 天{entry.editedAt ? ' · 已编辑' : ''}</summary><DiaryEditor entry={entry} onSave={props.onSaveDiary} /></details>) : <p className="empty">完成第一天结算后，这里会保留历日日记。</p>}</div>
  </section>;
}

function DiaryEditor(props: { entry: SaveFile['world']['diary'][number]; onSave: (day: number, text: string) => void }) {
  const [text, setText] = useState(props.entry.text);
  useEffect(() => { setText(props.entry.text); }, [props.entry.day, props.entry.text]);
  return <div className="diary-editor"><div className="list-heading"><strong>第 {props.entry.day} 天日记</strong>{props.entry.editedAt && <small>已手动编辑</small>}</div><textarea value={text} onChange={(event) => setText(event.target.value)} /><button onClick={() => props.onSave(props.entry.day, text)}>保存日记</button></div>;
}

function ChatView(props: {
  characters: CharacterCard[];
  selectedCharacterId: string;
  setSelectedCharacterId: (id: string) => void;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onAppend: () => Promise<void>;
  onGenerate: () => Promise<void>;
  requestStatus: RequestStatus;
  busy: boolean;
  pendingOps: PendingOpsRecovery | null;
  manualOps: string;
  setManualOps: (value: string) => void;
  onRetryOps: () => Promise<void>;
  onApplyManualOps: () => Promise<void>;
}) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const previousCharacterIdRef = useRef(props.selectedCharacterId);
  const [showOlderMessages, setShowOlderMessages] = useState(false);
  const statusText = props.requestStatus === 'requesting' ? '等待回复…' : props.requestStatus === 'generating' ? '正在生成…' : props.requestStatus === 'error' ? '请求失败' : '';
  const canGenerate = canGenerateReply(props.messages, props.input);
  const latestMessage = props.messages.at(-1)?.content;
  const olderMessageCount = Math.max(0, props.messages.length - 40);
  const visibleMessages = showOlderMessages ? props.messages : props.messages.slice(olderMessageCount);

  useEffect(() => {
    const scroller = messagesRef.current;
    if (!(scroller instanceof HTMLElement)) return;
    const updateFollowState = () => {
      followLatestRef.current = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 48;
    };
    scroller.addEventListener('scroll', updateFollowState, { passive: true });
    return () => scroller.removeEventListener('scroll', updateFollowState);
  }, []);

  useLayoutEffect(() => {
    if (previousCharacterIdRef.current !== props.selectedCharacterId) {
      previousCharacterIdRef.current = props.selectedCharacterId;
      followLatestRef.current = true;
      setShowOlderMessages(false);
    }
    if (followLatestRef.current) {
      const scroller = messagesRef.current;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
        requestAnimationFrame(() => { scroller.scrollTop = scroller.scrollHeight; });
      }
    }
  }, [latestMessage, props.busy, props.messages.length, props.requestStatus, props.selectedCharacterId]);

  return <section className="chat-screen">
    <div className="section-heading"><div><span className="eyebrow">日常相遇</span><h2>{props.characters.find((item) => item.id === props.selectedCharacterId)?.name ?? '选择角色聊天'}</h2></div>{statusText && <span className={`request-status ${props.requestStatus}`}>{statusText}</span>}</div>
    <div className="character-picker"><label>聊天角色<select value={props.selectedCharacterId} onChange={(event) => props.setSelectedCharacterId(event.target.value)}><option value="">未选择</option>{props.characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
    <div className="messages" ref={messagesRef}>{olderMessageCount > 0 && !showOlderMessages && <button className="history-toggle" onClick={() => setShowOlderMessages(true)}>查看更早的 {olderMessageCount} 条消息</button>}{props.messages.length === 0 && !props.busy && <p className="empty">选择角色后输入第一句话。</p>}{visibleMessages.map((message, index) => <div className={`message ${message.role}`} key={`${message.role}-${olderMessageCount + index}`}>{message.content}</div>)}{props.busy && props.requestStatus === 'requesting' && <div className="message assistant pending">等待回复…</div>}</div>
    {props.pendingOps && <div className="ops-recovery" role="alert">
      <strong>本回合未产生状态变更</strong>
      <p>{props.pendingOps.streamError ? '回复流中断，已保留收到的正文。你可以重试提取或手动补录。' : '正文已保留，但 ops 无法解析。你可以重试提取或手动补录。'}</p>
      <textarea aria-label="手动补录 ops JSON" spellCheck={false} value={props.manualOps} onChange={(event) => props.setManualOps(event.target.value)} />
      <div className="button-row"><button className="secondary" disabled={props.busy} onClick={() => void props.onRetryOps()}>重试提取</button><button disabled={props.busy} onClick={() => void props.onApplyManualOps()}>应用手动 ops</button></div>
    </div>}
    <div className="composer"><textarea value={props.input} onChange={(event) => props.setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void props.onAppend(); } }} placeholder="说点什么……" /><div className="composer-actions"><button className="secondary" onClick={() => void props.onAppend()} disabled={props.busy || !props.input.trim()}>发送消息</button><button onClick={() => void props.onGenerate()} disabled={props.busy || !canGenerate}>生成回复</button></div></div>
  </section>;
}

function SettingsView(props: {
  provider: ProviderConfig;
  setProvider: (provider: ProviderConfig) => void;
  providers: ProviderConfig[];
  bindings: ProviderBinding[];
  defaultProviderId: string;
  headersDraft: string;
  setHeadersDraft: (value: string) => void;
  models: string[];
  requestStatus: RequestStatus;
  onNewProvider: () => void;
  onSaveProvider: () => Promise<void>;
  onDeleteProvider: () => Promise<void>;
  onDiscoverModels: () => Promise<void>;
  onTestConnection: () => Promise<void>;
  onDefaultProviderChange: (providerId: string) => Promise<void>;
  onBindingChange: (taskId: TaskId, providerId: string) => Promise<void>;
  debug: { prompt: AssembledPrompt | null; raw: string; ops: string; state: string };
  debugTab: 'Prompt' | 'Raw' | 'Ops' | 'State';
  setDebugTab: (tab: 'Prompt' | 'Raw' | 'Ops' | 'State') => void;
  save: SaveFile;
  statKey: string;
  setStatKey: (value: string) => void;
  statValue: string;
  setStatValue: (value: string) => void;
  onAddStat: () => void;
  mockFixtureId: MockFixtureId | '';
  setMockFixtureId: (value: MockFixtureId | '') => void;
}) {
  const isSaved = props.providers.some((item) => item.id === props.provider.id);
  return <section>
    <div className="section-heading"><div><span className="eyebrow">本地设置</span><h2>Provider</h2></div>{props.requestStatus === 'requesting' && <span className="request-status requesting">请求中…</span>}</div>
    <div className="provider-card">
      <div className="field-with-action"><select aria-label="Provider 配置" value={isSaved ? props.provider.id : ''} onChange={(event) => { const found = props.providers.find((item) => item.id === event.target.value); if (found) props.setProvider(found); }}><option value="">未保存的新配置</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}</select><button className="secondary" onClick={props.onNewProvider}>新建</button></div>
      <label>渠道<select value={props.provider.kind} onChange={(event) => props.setProvider({ ...props.provider, kind: event.target.value as ProviderConfig['kind'] })}><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="generic">Generic</option></select></label>
      <label>配置名称<input value={props.provider.name} onChange={(event) => props.setProvider({ ...props.provider, name: event.target.value })} /></label>
      <label>基础 URL 或完整请求端点<input placeholder="https://example.com/v1" value={props.provider.endpoint} onChange={(event) => props.setProvider({ ...props.provider, endpoint: event.target.value })} /></label>
      <label>API key（仅本地）<input type="password" value={props.provider.apiKey ?? ''} onChange={(event) => props.setProvider({ ...props.provider, apiKey: event.target.value })} /></label>
      <label>模型<input list="model-list" placeholder="可手动填写" value={props.provider.model} onChange={(event) => props.setProvider({ ...props.provider, model: event.target.value })} /></label>
      <datalist id="model-list">{props.models.map((model) => <option key={model} value={model} />)}</datalist>
      <label>温度 {props.provider.temperature.toFixed(2)}<input type="range" min="0" max="2" step="0.05" value={props.provider.temperature} onChange={(event) => props.setProvider({ ...props.provider, temperature: Number(event.target.value) })} /></label>
      {props.provider.kind === 'generic' && <div className="generic-fields">
        <label>自定义 headers（JSON）<textarea spellCheck={false} value={props.headersDraft} onChange={(event) => props.setHeadersDraft(event.target.value)} /></label>
        <label>请求体模板<textarea spellCheck={false} placeholder={'{"model":{{model}},"messages":{{messages}},"stream":{{stream}}}'} value={props.provider.bodyTemplate ?? ''} onChange={(event) => props.setProvider({ ...props.provider, bodyTemplate: event.target.value || undefined })} /></label>
        <label>响应文本路径<input placeholder="$.choices[0].message.content" value={props.provider.responsePath ?? ''} onChange={(event) => props.setProvider({ ...props.provider, responsePath: event.target.value || undefined })} /></label>
        <label>流式分帧<select value={props.provider.streamFraming ?? 'sse'} onChange={(event) => props.setProvider({ ...props.provider, streamFraming: event.target.value as ProviderConfig['streamFraming'] })}><option value="sse">SSE</option><option value="ndjson">NDJSON</option><option value="json">普通 JSON</option></select></label>
      </div>}
      <div className="button-row"><button onClick={() => void props.onSaveProvider()}>保存配置</button><button className="secondary" onClick={() => void props.onDiscoverModels()}>拉取模型</button><button className="secondary" onClick={() => void props.onTestConnection()}>连接测试</button>{isSaved && <button className="danger" onClick={() => void props.onDeleteProvider()}>删除配置</button>}</div>
    </div>
    <div className="provider-card routing-card">
      <h3>任务路由</h3>
      <label>默认 Provider<select aria-label="默认 Provider" value={props.defaultProviderId} disabled={props.providers.length === 0} onChange={(event) => void props.onDefaultProviderChange(event.target.value)}><option value="">未设置</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="routing-list">{TASK_IDS.map((taskId) => <label key={taskId}><span>{TASK_LABELS[taskId]}<small>{taskId}</small></span><select aria-label={`${TASK_LABELS[taskId]} Provider`} value={props.bindings.find((binding) => binding.taskId === taskId)?.providerId ?? ''} disabled={props.providers.length === 0} onChange={(event) => void props.onBindingChange(taskId, event.target.value)}><option value="">使用默认 Provider</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>
    </div>
    <div className="provider-card">
      <h3>自定义 stats</h3>
      <p className="io-scope">给玩家增加通用数字状态，例如 money、trust 或 custom-reputation。AI 可通过已注册的 stat op 修改它，不需要改代码；这里仅设置初始值。</p>
      <div className="field-with-action"><input placeholder="stat 名称" value={props.statKey} onChange={(event) => props.setStatKey(event.target.value)} /><input type="number" placeholder="初始值" value={props.statValue} onChange={(event) => props.setStatValue(event.target.value)} /></div>
      <button className="secondary" onClick={props.onAddStat}>保存玩家 stat</button>
      <div className="stat-list">{Object.entries(props.save.world.player.stats).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>
    </div>
    <details className="advanced"><summary>高级与调试</summary><p className="io-scope">生成回复后打开下方“Ops diff”标签，可查看解析阶段、被拒绝操作、clamp 警告和状态前后变化。</p><DebugView debug={props.debug} tab={props.debugTab} setTab={props.setDebugTab} /></details>
    <details className="advanced"><summary>Mock provider 验收工具</summary><div className="provider-card mock-tools"><p className="io-scope">仅开发验收使用，不进入普通 Provider 列表；先在资料页创建角色并进入聊天，选择 fixture 后点击“生成回复”即可零 API 重现。</p><label>fixture<select aria-label="Mock fixture" value={props.mockFixtureId} onChange={(event) => props.setMockFixtureId(event.target.value as MockFixtureId | '')}><option value="">关闭 Mock</option>{MOCK_FIXTURE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>{props.mockFixtureId && <div className="fixture-help"><strong>预期结果</strong><p>{MOCK_FIXTURE_DESCRIPTIONS[props.mockFixtureId]}</p></div>}<div className="fixture-list">{MOCK_FIXTURE_IDS.map((id) => <div key={id}><strong>{id}</strong><span>{MOCK_FIXTURE_DESCRIPTIONS[id]}</span></div>)}</div></div></details>
  </section>;
}

function PresetBundleView(props: { presetBundles: PresetBundle[]; selectedPresetBundleId: string; setSelectedPresetBundleId: (value: string) => void; presetBundleName: string; setPresetBundleName: (value: string) => void; onCreatePresetBundle: () => Promise<void>; onRenamePresetBundle: () => Promise<void>; onDeletePresetBundle: (id: string) => Promise<void>; onExportPresetBundle: () => Promise<void>; onImportPresetBundle: (file?: File) => Promise<void>; onEditPreset: (entry: Preset) => void; onDeletePreset: (id: string) => Promise<void>; onExportPreset: (entry: Preset) => void }) {
  const bundles = Array.isArray(props.presetBundles) ? props.presetBundles.filter((bundle): bundle is PresetBundle => Boolean(bundle && typeof bundle === 'object')) : [];
  const selected = bundles.find((bundle) => bundle.id === props.selectedPresetBundleId);
  const selectedEntries = selected && Array.isArray(selected.entries)
    ? selected.entries.filter((entry): entry is Preset => Boolean(entry && typeof entry === 'object'))
    : [];
  return <div className="list-card">
    <div className="list-heading"><h3>预设包</h3><div className="button-row"><button className="secondary" disabled={!selected} onClick={() => void props.onExportPresetBundle()}>导出当前预设包</button><label className="file-button">导入预设包<input type="file" accept=".zip" onChange={(event) => void props.onImportPresetBundle(event.target.files?.[0])} /></label></div></div>
    <div className="field-with-action"><input placeholder="预设包名称" value={props.presetBundleName} onChange={(event) => props.setPresetBundleName(event.target.value)} /><button onClick={() => void (selected ? props.onRenamePresetBundle() : props.onCreatePresetBundle())}>{selected ? '更新包名称' : '新建预设包'}</button></div>
    <label>当前预设包<select value={props.selectedPresetBundleId} onChange={(event) => { const id = event.target.value; props.setSelectedPresetBundleId(id); props.setPresetBundleName(bundles.find((bundle) => bundle.id === id)?.name ?? ''); }}><option value="">不使用预设包</option>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select></label>
    <p className="io-scope">切换预设包后，包内所有条目会在下一次生成回复时同时生效。</p>
    {selected ? <div className="list-card"><div className="list-heading"><strong>{selected.name}</strong><span className="button-row"><button onClick={() => props.setPresetBundleName(selected.name)}>编辑</button><button onClick={() => void props.onDeletePresetBundle(selected.id)}>删除</button></span></div>{selectedEntries.length === 0 ? <p className="empty">暂无预设条目</p> : selectedEntries.map((entry) => <div className="list-row" key={entry.id}><span>{entry.name}<small>{entry.systemPrompt || '无提示词内容'}</small></span><span className="button-row"><button onClick={() => props.onEditPreset(entry)}>编辑</button><button onClick={() => void props.onDeletePreset(entry.id)}>删除</button><button onClick={() => props.onExportPreset(entry)}>导出</button></span></div>)}</div> : <p className="empty">请选择或创建预设包</p>}
  </div>;
}

function LibraryView(props: { characters: CharacterCard[]; worldbooks: WorldbookEntry[]; presets: Preset[]; presetBundles: PresetBundle[]; selectedPresetBundleId: string; setSelectedPresetBundleId: (value: string) => void; presetBundleName: string; setPresetBundleName: (value: string) => void; onCreatePresetBundle: () => Promise<void>; onRenamePresetBundle: () => Promise<void>; onDeletePresetBundle: (id: string) => Promise<void>; save: SaveFile; name: string; setName: (value: string) => void; draftText: string; setDraftText: (value: string) => void; editing: { kind: ContentKind; id: string } | null; setEditing: (editing: { kind: ContentKind; id: string } | null) => void; addContent: (kind: ContentKind) => Promise<void>; onDelete: (kind: ContentKind, id: string) => Promise<void>; onExport: (kind: ContentKind, value: unknown, name: string) => void; onImport: (kind: ContentKind, file?: File) => Promise<void>; onExportSave: () => Promise<void>; onImportSave: (file?: File) => Promise<void>; onExportPresetBundle: () => Promise<void>; onImportPresetBundle: (file?: File) => Promise<void>; includeChatsOnExport: boolean; setIncludeChatsOnExport: (value: boolean) => void; onClearChats: () => Promise<void>; itemName: string; setItemName: (value: string) => void; itemTags: string; setItemTags: (value: string) => void; itemDescription: string; setItemDescription: (value: string) => void; onAddItem: () => void; selectedPresetId?: string; setSelectedPresetId?: (value: string) => void }) {
  return <section><div className="section-heading"><div><span className="eyebrow">本地资料</span><h2>角色 / 世界书 / 预设包</h2></div></div><div className="editor-card"><input placeholder="名称" value={props.name} onChange={(event) => props.setName(event.target.value)} /><textarea placeholder="描述或内容" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} /><div className="button-row"><button onClick={() => void props.addContent('character')}>保存角色卡</button><button onClick={() => void props.addContent('worldbook')}>保存世界书</button><button onClick={() => void props.addContent('preset')}>添加预设条目</button></div></div><ContentList title="角色卡" kind="character" items={props.characters.map((item) => ({ ...item, text: item.description }))} onEdit={(kind, item) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); }} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><ContentList title="世界书" kind="worldbook" items={props.worldbooks.map((item) => ({ ...item, text: item.content }))} onEdit={(kind, item) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); }} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><PresetBundleView presetBundles={props.presetBundles} selectedPresetBundleId={props.selectedPresetBundleId} setSelectedPresetBundleId={props.setSelectedPresetBundleId} presetBundleName={props.presetBundleName} setPresetBundleName={props.setPresetBundleName} onCreatePresetBundle={props.onCreatePresetBundle} onRenamePresetBundle={props.onRenamePresetBundle} onDeletePresetBundle={props.onDeletePresetBundle} onExportPresetBundle={props.onExportPresetBundle} onImportPresetBundle={props.onImportPresetBundle} onEditPreset={(entry) => { props.setEditing({ kind: 'preset', id: entry.id }); props.setName(entry.name); props.setDraftText(entry.systemPrompt); }} onDeletePreset={(id) => props.onDelete('preset', id)} onExportPreset={(entry) => props.onExport('preset', entry, entry.name)} /><div className="list-card"><h3>物品栏</h3>{props.save.world.player.inventory.length === 0 ? <p className="empty">暂无物品</p> : props.save.world.player.inventory.map((entry) => <div className="list-row" key={`${entry.itemId}-${entry.gotDay}`}><span>{props.save.world.items[entry.itemId]?.name ?? entry.itemId}</span><span>x{entry.count}</span></div>)}</div><div className="io-card"><div><strong>世界存档</strong><p className="io-scope">包含资料和可选聊天；不包含 Provider 配置与 API key。</p><label className="checkbox-line"><input type="checkbox" checked={props.includeChatsOnExport} onChange={(event) => props.setIncludeChatsOnExport(event.target.checked)} />包含聊天记录</label></div><button onClick={() => void props.onExportSave()}>导出世界存档</button><label className="file-button">导入世界存档<input type="file" accept=".zip" onChange={(event) => void props.onImportSave(event.target.files?.[0])} /></label><button className="danger" onClick={() => void props.onClearChats()}>清除全部聊天</button></div></section>;
  const edit = (kind: ContentKind, item: { id: string; name: string; text: string }) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); };
  const inventory = props.save.world.player.inventory;
  const characterNames = new Map(props.characters.map((character) => [character.id, character.name]));
  // @ts-ignore Legacy unreachable markup is retained temporarily for migration compatibility.
  return <section><div className="section-heading"><div><span className="eyebrow">本地资料</span><h2>角色 / 世界书 / 预设</h2></div></div><div className="editor-card"><input placeholder="名称" value={props.name} onChange={(event) => props.setName(event.target.value)} /><textarea placeholder="描述或内容" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} /><div className="button-row"><button onClick={() => void props.addContent('character')}>保存角色卡</button><button onClick={() => void props.addContent('worldbook')}>保存世界书</button><button onClick={() => void props.addContent('preset')}>保存预设</button></div></div><div className="list-card"><div className="list-heading"><h3>物品定义</h3></div><div className="editor-card"><input placeholder="物品名称" value={props.itemName} onChange={(event) => props.setItemName(event.target.value)} /><input placeholder="标签，用逗号分隔" value={props.itemTags} onChange={(event) => props.setItemTags(event.target.value)} /><textarea placeholder="物品描述" value={props.itemDescription} onChange={(event) => props.setItemDescription(event.target.value)} /><button onClick={props.onAddItem}>保存物品定义</button></div>{Object.values(props.save.world.items).map((item) => <div className="list-row" key={item.id}><span>{item.name}<small>{item.id} · {item.tags.join(', ')}</small></span></div>)}</div><div className="list-card"><div className="list-heading"><h3>物品栏（当前世界状态）</h3></div><p className="io-scope">这里显示内核实际持有的数量；每条记录都保留获得时的来源。</p>{inventory.length === 0 ? <p className="empty">暂无物品</p> : inventory.map((entry, index) => <div className="list-row" key={`${entry.itemId}-${entry.gotDay}-${index}`}><span>{props.save.world.items[entry.itemId]?.name ?? entry.itemId}<small>来源：{entry.fromCharId ? characterNames.get(entry.fromCharId) ?? entry.fromCharId : '世界/系统'} · 第 {entry.gotDay} 天{entry.gotNodeId ? ` · 地点 ${entry.gotNodeId}` : ''}</small></span><span>x{entry.count}</span></div>)}</div><ContentList title="角色卡" kind="character" items={props.characters.map((item) => ({ ...item, text: item.description }))} onEdit={edit} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><ContentList title="世界书" kind="worldbook" items={props.worldbooks.map((item) => ({ ...item, text: item.content }))} onEdit={edit} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><div className="list-card"><div className="list-heading"><h3>预设选项</h3><div className="button-row"><button className="secondary" onClick={() => void props.onExportPresetBundle()} disabled={props.presets.length === 0}>导出全部预设</button><label className="file-button">导入预设包<input type="file" accept=".zip" onChange={(event) => void props.onImportPresetBundle(event.target.files?.[0])} /></label></div></div><label>当前文风/提示词预设<select value={props.selectedPresetId} onChange={(event) => props.setSelectedPresetId(event.target.value)}><option value="">不使用预设</option>{props.presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="io-scope">预设包将多个文风/提示词预设作为独立选项保存；切换后下一次生成回复使用所选预设。</p>{props.presets.length === 0 ? <p className="empty">暂无内容</p> : props.presets.map((item) => <div className="list-row" key={item.id}><span>{item.name}</span><span className="button-row"><button onClick={() => props.onExport('preset', item, item.name)}>导出单项</button></span></div>)}</div><div className="io-card"><div><strong>世界存档</strong><p className="io-scope">包含角色卡、世界书、预设和可选聊天；不包含 Provider 配置与 API key。</p><label className="checkbox-line"><input type="checkbox" checked={props.includeChatsOnExport} onChange={(event) => props.setIncludeChatsOnExport(event.target.checked)} />包含聊天记录</label></div><button onClick={() => void props.onExportSave()}>导出世界存档</button><label className="file-button">导入世界存档<input type="file" accept=".zip" onChange={(event) => void props.onImportSave(event.target.files?.[0])} /></label><button className="danger" onClick={() => void props.onClearChats()}>清除全部聊天</button></div></section>;
}

function ContentList(props: { title: string; kind: ContentKind; items: Array<{ id: string; name: string; text: string }>; onEdit: (kind: ContentKind, item: { id: string; name: string; text: string }) => void; onDelete: (kind: ContentKind, id: string) => Promise<void>; onExport: (kind: ContentKind, value: unknown, name: string) => void; onImport: (kind: ContentKind, file?: File) => Promise<void> }) {
  return <div className="list-card"><div className="list-heading"><h3>{props.title}</h3><label className="file-button">导入<input type="file" accept=".json" onChange={(event) => void props.onImport(props.kind, event.target.files?.[0])} /></label></div>{props.items.length === 0 ? <p className="empty">暂无内容</p> : props.items.map((item) => <div className="list-row" key={item.id}><span>{item.name}</span><span className="button-row"><button onClick={() => props.onEdit(props.kind, item)}>编辑</button><button onClick={() => props.onExport(props.kind, item, item.name)}>导出</button><button onClick={() => void props.onDelete(props.kind, item.id)}>删除</button></span></div>)}</div>;
}

function DebugView(props: { debug: { prompt: AssembledPrompt | null; raw: string; ops: string; state: string }; tab: 'Prompt' | 'Raw' | 'Ops' | 'State'; setTab: (tab: 'Prompt' | 'Raw' | 'Ops' | 'State') => void }) {
  const renderPrompt = () => {
    const prompt = props.debug.prompt;
    if (!prompt) return <p className="debug-empty">暂无 Prompt 数据</p>;
    return <div className="prompt-debug"><div className="prompt-summary">总计 {prompt.estimatedTokens} / {prompt.budget} tokens</div>{prompt.blocks.map((block) => { const state = block.skipped ? '无数据' : block.dropped ? '已丢弃' : block.truncated ? '已截断' : '正常'; return <details key={block.id} className={`prompt-block ${block.skipped ? 'skipped' : block.dropped ? 'dropped' : block.truncated ? 'truncated' : ''}`}><summary><span>{block.id}</span><span>{block.estimatedTokens} tokens · {state}</span></summary>{block.text ? <pre>{block.text}</pre> : <p className="debug-empty">此块当前没有可注入内容。</p>}</details>; })}</div>;
  };
  const content = props.tab === 'Raw' ? props.debug.raw : props.tab === 'Ops' ? props.debug.ops : props.debug.state;
  return <div className="debug-view"><div className="debug-tab-buttons">{(['Prompt', 'Raw', 'Ops', 'State'] as const).map((tab) => <button key={tab} className={props.tab === tab ? 'selected' : ''} onClick={() => props.setTab(tab)}>{tab === 'Ops' ? 'Ops diff' : tab}</button>)}</div><article className="debug-output">{props.tab === 'Prompt' ? renderPrompt() : <pre>{content || '暂无数据'}</pre>}</article></div>;
}
