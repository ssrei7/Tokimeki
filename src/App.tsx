import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent, type ReactNode } from 'react';
import { PromptAssembler } from './core/prompt/assembler';
import type { AssembledPrompt } from './core/prompt/assembler';
import { createDefaultPromptBlocks } from './core/prompt/default-blocks';
import { TOPIC_TREE_PROMPT_BLOCKS } from './core/prompt/topic-tree';
import { EventBus } from './core/events/bus';
import { evaluateEvidenceReaction, installEventDefs, listPendingEvents, resolveEventChoice, scheduleDirectorEvent, setScheduledEventRevealed, triggerScheduledEvent } from './core/events';
import { advanceStorySceneStage, confirmStoryScene, copyStoryScenePreset, createBuiltinStoryScenePresets, createStorySceneDraft, deleteStorySceneDraft, formatChatArchive, formatEventHistoryArchive, generateStorySceneDraftInput, readStorySceneStage, selectStorySceneReadingStage, updateStorySceneDraft, updateStorySceneStatus, type StorySceneDraftInput, type StoryScenePreset } from './core/story';
import { createMapNode, deleteMapNode, movePlayer, parseGeneratedMap, parseGeneratedMapExpansion, parseGeneratedNodeSuggestion, updateMapNode, type CreateMapNodeInput, type UpdateMapNodeInput } from './core/map';
import { parseGeneratedTopicTree } from './core/topics/parser';
import { isTopicTreeFresh, mergeDailyTopicTree, topicResponse, topicTreeKey, topicVisibility, visibleTopics } from './core/topics';
import { addCharacterToWorld, deriveNodeScope, nodeScopeLabel, proposeDeparture, recentEncounterTraces, resolveDeparture, triggerEncounter, updateEncounterOutcome, whoIsHere, whoIsWhere, type EncounterCandidate, type EncounterTrace } from './core/encounter';
import { attachTerminalVoiceToMessage, buildTerminalReplyPrompt, confirmTerminalAppointment, createFriendRequest, createTerminalAppointmentRequest, createTerminalOpRegistry, deleteTerminalMessage, deliverNightlyTerminalMessage, editTerminalMessage, isAcceptedFriend, listContactCandidates, listTerminalAppointmentRequests, listTerminalCalls, listTerminalMessages, listTerminalMessageThreads, listTerminalTransfers, recordTerminalCall, resolveFriendRequest, resolveIncomingTransfer as resolveIncomingTransferOp, resolveTerminalAppointmentRequest, sendPlayerTransfer, sendTerminalRejoinRequest, sendTerminalReplyMessage, sendTerminalStickerMessage, sendTerminalTextMessage, simulateTerminalAppointmentAcceptance, TERMINAL_PLAYER_ID, type ContactDirection, type TerminalAppointmentAction, type TerminalAppointmentInput, type TerminalCallStatus, type TransferAction } from './core/terminal';
import { createDefaultOpRegistry, OpsStreamSplitter, parseReply } from './core/ops';
import type { ApplyOpsResult, ParsedReply } from './core/ops';
import { advanceAction, availableSlots, endDay, updateDiaryEntry } from './core/time';
import { PresetBundleSchema, PresetSchema, normalizeChatMessages, type CharacterCard, type ChatCgAttachment, type ChatMessage, type ChatRecord, type ChatRecoveryRecord, type Persona, type Preset, type PresetBundle, type TerminalStickerRecord, type VoiceAttachment, type WorldbookEntry } from './data/content';
import { clearChatRecovery, clearChats, clearMemoryVectors, contentDb, deleteCharacter, deletePersona, deletePreset, deletePresetBundle, deleteStoryScenePreset, deleteTerminalSticker, deleteWorldbook, listTerminalStickers, loadChat, loadChatRecovery, loadMemoryVectors, saveCharacter, saveChat, saveChatRecovery, saveMemoryVectors, savePersona, savePreset, savePresetBundle, saveStoryScenePreset, saveTerminalSticker, saveWorldbook } from './data/db/content';
import { BUILTIN_NARRATION_PRESET_BUNDLE_ID, createBuiltinNarrationPresetBundle, mergeBuiltinNarrationPresetBundle } from './data/presets/builtins';
import { assetDb, deleteAsset, findVoiceAssetByFingerprint, listAssets, listMusicAssets, listVoiceAssets, loadAsset, saveAsset, saveVoiceAsset, summarizeMusicAssets, summarizeVoiceCache, unmarkVoiceAsset, type MusicAssetStats, type StoredAsset, type VoiceCacheStats } from './data/db/assets';
import { listSnapshots, loadCurrentSave, loadSnapshot, saveCurrentSave, saveDailySnapshot, saveSnapshotRecords, saveDb, type SaveSnapshot } from './data/db/save';
import { collectStoredAssetIds, countVoiceAssetReferences, detachVoiceAssetsFromChat, detachVoiceAssetsFromSave } from './data/voice-cache';
import { auditAssetReferences, type AssetIntegrityReport } from './data/reference-integrity';
import { orphanedImageAssetIds, summarizeImageAssets, type ImageAssetStats } from './data/image-assets';
import { downsampleImage, externalImageAssetRef } from './data/assets/image';
import { exportCharacterPackage, exportEventPackage, exportPresetBundle, exportSaveZip, exportWorldPackage, importCharacterPackage, importEventPackage, importPresetBundle, importSaveZip, importWorldPackage } from './data/io/zip';
import { characterCardForPackage, remapCharacterCardAssetIds } from './data/io/character-package';
import { createWorldPackage, mergeWorldPackage, remapWorldPackageAssetIds, sanitizeWorldMapForPackage } from './data/io/world-package';
import { importPlainText, readDocxPlainText, type TextImportKind } from './data/text-import';
import { auditEventPackage } from './data/event-package-audit';
import { createDefaultMap, CURRENT_SCHEMA_VERSION, DEFAULT_ACTION_COSTS, DEFAULT_ECONOMY_STATE, DEFAULT_SLOT_DEFS, DEFAULT_TERMINAL_STATE, SaveFileSchema, type AssetRef, type CollectionEntry, type EncounterDeparture, type GiftHistoryEntry, type SaveFile, type Topic, type TopicTree } from './data/schema/save';
import { testProviderConnection } from './providers/connection-test';
import { providerDb } from './providers/db';
import { listProviderModels } from './providers/models';
import { resolveProviderForCharacter, resolveProviderForTask, resolveProviderForTaskGroup, resolveTtsProviderForCharacter } from './providers/router';
import { streamChat, type StreamStatus } from './providers/stream';
import { generateImage } from './providers/image';
import { buildCharacterImagePrompt, buildChatCgPrompt } from './providers/image-prompt';
import { currentImageIdentity, faceReferenceAssetIdForGeneration, imageCharacterConfigId, imageReferenceAssetIds, imageUserConfigId } from './providers/image-identity';
import { createEmbeddings } from './providers/embedding';
import { queryVectorMemories, rebuildVectorMemoryRecords } from './providers/vector-memory';
import { createMockProviderConfig } from './providers/adapters/mock';
import { createProviderSettingsPackage, exportProviderSettingsPackage, importProviderSettingsPackage, mergeProviderSettingsPackage, type ProviderSettingsPackage, type ProviderSettingsSelection } from './providers/settings-package';
import { collectThemeBackup, collectTokimekiPreferences, exportGlobalBackup, importGlobalBackup, restoreTokimekiPreferences, themeBackupPreferences, type GlobalBackupRestoreSelection, type ImportedGlobalBackup } from './data/io/global-backup';
import { exportThemePackage, importThemePackage, listThemePackageConflicts, remapThemePackageAssetIds, themePackageAssetIds, type ImportedThemePackage } from './data/io/theme-package';
import { MOCK_FIXTURE_IDS, type MockFixtureId } from './providers/mock/fixtures';
import { createStage4EncounterScenario } from './dev/scenarios/stage4';
import { createCurrentSaveScenario, seedScenario } from './dev/scenarios/seeder';
import { simulateDays } from './dev/simulator';
import { simulateEncounterDistribution } from './dev/encounter-simulator';
import { simulateLeadDistribution } from './dev/lead-simulator';
import { simulateTopicDistribution } from './dev/topic-simulator';
import { CharacterProviderBindingSchema, EmbeddingConfigSchema, ImageConfigSchema, ImageUserVisualConfigSchema, ImageVisualConfigSchema, ProviderBindingSchema, ProviderConfigSchema, ProviderSettingSchema, TASK_IDS, TtsConfigSchema, type CharacterProviderBinding, type EmbeddingConfig, type ImageConfig, type ImageUserVisualConfig, type ImageVisualConfig, type ProviderBinding, type ProviderConfig, type TaskId, type TtsConfig } from './providers/types';
import { speechCacheFingerprint, synthesizeSpeech } from './providers/speech';
import { canGenerateReply, hasQueuedUserMessage, replyProgressIndicator } from './ui/chat-state';
import { createChatRequestId, markBackgroundRequestInterrupted, recoveryMessagesForRetry } from './ui/chat-recovery';
import { latestDialogueSpeakerId, splitDialogueMessage } from './ui/dialogue';
import { deleteChatMessage, isEditableChatMessage, updateChatMessage } from './ui/chat-history';
import { deleteRelationshipMemory, deriveRelationshipPromptState, removeRelationshipMemoriesFromMessage, retrieveRelationshipMemoriesHybrid, setRelationshipMemoryArchived, setRelationshipMemoryInject, updateRelationshipMemory } from './core/relationship';
import { buildMemoryConsolidationPrompt, parseMemoryConsolidationResponse, shouldConsolidateMemories, type MemoryConsolidationCandidate } from './core/relationship/consolidation';
import { markAppointmentOnEnter, markAppointmentOnTimeAdvance, settleAppointments } from './core/appointments';
import { mapPresenceVisual, type MapPresenceVisual } from './ui/map-presence';
import { readCallHistoryCollapsed, readContactGroupCollapsed, readContactGroupPreferences, writeCallHistoryCollapsed, writeContactGroupCollapsed, writeContactGroupPreferences, type ContactCustomGroup } from './ui/contact-groups';
import { buildNpcExpansionPrompt, buildPromoteNpcOp, characterCardFromPromotedCharacter, createNpcPromotionDraft, parseNpcExpansionResponse, summarizeNpcSchedule, type NpcPromotionDraft } from './ui/npc-promotion';
import { formatStorageBytes, readStorageEstimate, requestPersistentStorage, storageUsagePercent, type StorageEstimate } from './ui/storage';
import { notificationCapabilityLabel, readMobileCapabilities, serviceWorkerCapabilityLabel } from './ui/mobile-capabilities';
import { PROVIDER_PROXY_ASSESSMENT, providerProxyAssessmentLabel } from './ui/service-worker-assessment';
import { readLocalNotificationSettings, requestLocalNotificationPermission, showGenerationCompleteNotification, writeLocalNotificationSettings, type LocalNotificationSettings } from './ui/local-notifications';
import { PLAYER_ACCENT_COLOR, resolveCharacterAccentColors, resolveSpeakerAccentColor } from './ui/character-color';
import { Calendar, ChatCircle, DeviceMobile, GearSix, MapTrifold, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { StorySceneReader } from './ui/story-scene';
import { settlementFinancialSummary, settlementRelationNumbers } from './ui/settlement';
import { applyMorningNpcMoves, buildLocalMorningUpdate, buildMorningPrompt, hasMorningBrief, hasMorningUpdate, parseMorningUpdate, resolveMorningAdDestination } from './core/world/morning';
import { findMatchingHooks, syncLeadHooks, triggerHook } from './core/world/hooks';
import { createEconomyOpRegistry, formatCurrency, getHousingTier, getHousingUpgradeOffer, getJobQuote, getJobShiftStatus, getRentalQuote, getShopOffer, getShopStatus, injectEconomyMorningAds, registerEconomyHooks } from './features/economy';
import { getSoftGoals } from './features/life';
import { canAffordEnergy, energyCostForAction, getEnergyState, movementEnergyKind, registerEnergyOps } from './features/energy';
import { AlertTriangle, ArrowLeft, Backpack, BookOpen, Bot, BrainCircuit, Bug, CalendarDays, Camera, Check, ChevronDown, ChevronUp, ContactRound, Download, FileArchive, Gift, History, House, Image as ImageIcon, LogOut, MessageCircle, Milestone, Music2, NotebookPen, Palette, Phone, PhoneIncoming, PhoneOff, Plus, ReceiptText, RefreshCw, Reply, Route, RotateCcw, Send, ShieldCheck, SlidersHorizontal, Smile, Sparkles, Target, UserRound, UsersRound, BriefcaseBusiness, Wrench, X } from 'lucide-react';
import { DesktopLauncher, EmptyState, SubpageShell, type DesktopEntry } from './components/desktop-shell';
import { MusicApp } from './components/music-app';
import { PackageHelpButton } from './components/package-help-dialog';
import { useMusicPlayer, type MusicPlayerController } from './features/music/player';
import './ui/theme/app.css';
import { applyCustomCss, applyTheme, applyThemeAppearance, applyThemeTemplate, DEFAULT_THEME_APPEARANCE, parseDesktopIconOverrides, parseDesktopTitleOverrides, parseThemeAppearance, readCustomCss, readDesktopIconOverrides, readDesktopTitleOverrides, readThemeAppearance, readThemeMode, readThemeTemplate, resolveTheme, THEME_APPEARANCE_STORAGE_KEY, THEME_STORAGE_KEY, THEME_TEMPLATE_STORAGE_KEY, type DesktopIconOverrides, type DesktopTitleOverrides, type ThemeAppearanceConfig, type ThemeMode, type ThemeTemplate, validateCustomCss, writeCustomCss, writeDesktopIconOverrides, writeDesktopTitleOverrides, writeThemeAppearance } from './ui/theme/preferences';

type Tab = 'map' | 'day' | 'chat' | 'library' | 'settings';
export type SettingsPage = 'player' | 'provider' | 'vector-memory' | 'voice' | 'image' | 'routing' | 'migration' | 'display' | 'rules' | 'privacy' | 'debug' | 'dev-tools';
export const BOTTOM_NAV_ITEMS: readonly (readonly [Tab, string, PhosphorIcon])[] = [
  ['day', '日程', Calendar],
  ['chat', '聊天', ChatCircle],
  ['map', '地图', MapTrifold],
  ['library', '终端', DeviceMobile],
  ['settings', '设置', GearSix],
];
export type LibraryPage = 'messages' | 'contacts' | 'calls' | 'music' | 'memories' | 'collection' | 'inventory' | 'characters' | 'worldbook' | 'presets' | 'event-packages' | 'story' | 'save' | 'calendar' | 'goals' | 'housing' | 'career' | 'diary' | 'events' | 'progress' | 'snapshots';
export type DayPage = 'calendar' | 'goals' | 'housing' | 'career' | 'settlement' | 'diary' | 'events' | 'story' | 'snapshots';
export const DAY_PAGE_DEFINITIONS: readonly (DesktopEntry & { id: DayPage; pageTitle: string })[] = [
  { id: 'calendar', label: '日历', pageTitle: '日历', icon: CalendarDays, tone: 'gray' },
  { id: 'goals', label: '目标', pageTitle: '生活目标', icon: Target, tone: 'gray' },
  { id: 'housing', label: '住所', pageTitle: '住所', icon: House, tone: 'gray' },
  { id: 'career', label: '事业', pageTitle: '工作与事业', icon: BriefcaseBusiness, tone: 'gray' },
  { id: 'settlement', label: '结算', pageTitle: '最近结算', icon: ReceiptText, tone: 'gray' },
  { id: 'diary', label: '日记', pageTitle: '日记回顾', icon: NotebookPen, tone: 'gray' },
  { id: 'events', label: '事件', pageTitle: '事件回顾', icon: History, tone: 'gray' },
  { id: 'story', label: '进展', pageTitle: '剧情进展', icon: Milestone, tone: 'gray' },
  { id: 'snapshots', label: '快照', pageTitle: '本地快照', icon: Camera, tone: 'gray' },
];
const LibraryNavigationContext = createContext<{ activePage: LibraryPage | null; onOpenPage: (page: LibraryPage) => void; onBack: () => void }>({ activePage: null, onOpenPage: () => undefined, onBack: () => undefined });
export const LIBRARY_PAGE_DEFINITIONS: readonly (DesktopEntry & { id: LibraryPage; pageTitle: string })[] = [
  { id: 'messages', label: '消息', pageTitle: '消息', icon: MessageCircle, tone: 'gray' },
  { id: 'contacts', label: '联系人', pageTitle: '联系人', icon: ContactRound, tone: 'gray' },
  { id: 'calls', label: '通话', pageTitle: '通话', icon: Phone, tone: 'gray' },
  { id: 'music', label: '音乐', pageTitle: '音乐', icon: Music2, tone: 'gray' },
  { id: 'calendar', label: '日历', pageTitle: '日历', icon: CalendarDays, tone: 'gray' },
  { id: 'goals', label: '目标', pageTitle: '生活目标', icon: Target, tone: 'gray' },
  { id: 'housing', label: '住所', pageTitle: '住所', icon: House, tone: 'gray' },
  { id: 'career', label: '事业', pageTitle: '工作与事业', icon: BriefcaseBusiness, tone: 'gray' },
  { id: 'diary', label: '日记', pageTitle: '日记回顾', icon: NotebookPen, tone: 'gray' },
  { id: 'events', label: '事件', pageTitle: '事件回顾', icon: History, tone: 'gray' },
  { id: 'progress', label: '进展', pageTitle: '剧情进展', icon: Milestone, tone: 'gray' },
  { id: 'snapshots', label: '快照', pageTitle: '本地快照', icon: Camera, tone: 'gray' },
  { id: 'memories', label: '记忆', pageTitle: '记忆库', icon: BrainCircuit, tone: 'gray' },
  { id: 'collection', label: '收藏', pageTitle: '收藏', icon: BookOpen, tone: 'gray' },
  { id: 'inventory', label: '背包', pageTitle: '背包', icon: Backpack, tone: 'gray' },
  { id: 'characters', label: '角色', pageTitle: '角色卡', icon: UsersRound, tone: 'gray' },
  { id: 'worldbook', label: '世界书', pageTitle: '世界书', icon: BookOpen, tone: 'gray' },
  { id: 'presets', label: '预设', pageTitle: '预设包', icon: SlidersHorizontal, tone: 'gray' },
  { id: 'story', label: '多人剧情', pageTitle: '多人剧情', icon: UsersRound, tone: 'gray' },
  { id: 'save', label: '存档', pageTitle: '存档与导入导出', icon: FileArchive, tone: 'gray' },
];
export const SETTINGS_PAGE_DEFINITIONS: readonly (DesktopEntry & { id: SettingsPage; pageTitle: string })[] = [
  { id: 'player', label: '身份', pageTitle: '玩家身份', icon: UserRound, tone: 'gray' },
  { id: 'provider', label: '模型', pageTitle: '对话模型', icon: Bot, tone: 'gray' },
  { id: 'vector-memory', label: '向量', pageTitle: '向量记忆', icon: BrainCircuit, tone: 'gray' },
  { id: 'voice', label: '语音', pageTitle: '语音生成', icon: MessageCircle, tone: 'gray' },
  { id: 'image', label: '图像', pageTitle: '图像生成', icon: ImageIcon, tone: 'gray' },
  { id: 'routing', label: '路由', pageTitle: '任务路由', icon: Route, tone: 'gray' },
  { id: 'migration', label: '迁移', pageTitle: '设置迁移', icon: Download, tone: 'gray' },
  { id: 'display', label: '显示', pageTitle: '显示选项', icon: Palette, tone: 'gray' },
  { id: 'rules', label: '规则', pageTitle: '游戏规则', icon: SlidersHorizontal, tone: 'gray' },
  { id: 'privacy', label: '隐私', pageTitle: '数据与隐私', icon: ShieldCheck, tone: 'gray' },
  { id: 'debug', label: '调试', pageTitle: '高级调试', icon: Bug, tone: 'gray' },
  { id: 'dev-tools', label: '开发', pageTitle: '开发工具', icon: Wrench, tone: 'gray' },
];
const LIBRARY_DAY_PAGE_MAP: Partial<Record<LibraryPage, DayPage>> = {
  calendar: 'calendar',
  goals: 'goals',
  housing: 'housing',
  career: 'career',
  diary: 'diary',
  events: 'events',
  progress: 'story',
  snapshots: 'snapshots',
};
type ContentKind = 'character' | 'worldbook' | 'preset' | 'memory';
type RequestStatus = 'idle' | StreamStatus;
type Feedback = { tone: 'info' | 'success' | 'error'; text: string } | null;
type DebugState = { prompt: AssembledPrompt | null; raw: string; ops: string; state: string };
type PendingOpsRecovery = { raw: string; actorId?: string; messageIndex?: number; streamError?: string; requestId?: string };
type GiftGenerationContext = { giftId: string; itemId: string; itemName: string; charId: string; charName: string };
type CollectionGenerationContext = { entryId: string; itemId: string; title: string; description: string; tags: string[]; evidenceReaction?: { eventId: string; response: string } };
type TopicRetryContext = { charId: string; nodeId: string; participantIds: string[]; entryId?: string };
type ActiveEncounter = { entryId: string; nodeId: string; scope: 'formal' | 'peripheral'; candidates: EncounterCandidate[] };
type EncounterChatSession = { characterId: string; participantIds: string[]; nodeId: string; mode: 'topics' | 'manual' | 'ended'; entryId?: string; lastResponseSource?: 'topic' | 'manual' };
type PendingMemoryCandidate = MemoryConsolidationCandidate & { sourceMessageIndices: number[] };
type TerminalCallSession = { id: string; characterId: string; direction: 'outgoing' | 'incoming'; state: 'ringing' | 'active'; startedDay: number; startedSlotId: string };
type DevToolReport = { title: string; body: string } | null;
type ActiveChatPanel = 'gift' | 'collection' | 'regenerate' | 'recovery' | null;
const ENCOUNTER_CHAT_SESSION_KEY = 'tokimeki.encounter-chat-session';
const APP_NAME_STORAGE_KEY = 'tokimeki.appName';
const TERMINAL_SELECTED_CONTACT_KEY = 'tokimeki.terminal.selectedContact';
const TERMINAL_DRAFTS_KEY = 'tokimeki.terminal.drafts.v1';
const DEFAULT_APP_NAME = 'Tokimeki';

function readAppName(): string {
  if (typeof window === 'undefined') return DEFAULT_APP_NAME;
  try {
    const stored = window.localStorage.getItem(APP_NAME_STORAGE_KEY)?.trim();
    return stored ? stored.slice(0, 32) : DEFAULT_APP_NAME;
  } catch { return DEFAULT_APP_NAME; }
}

function readTerminalSelectedContact(): string {
  if (typeof window === 'undefined') return '';
  try { return window.localStorage.getItem(TERMINAL_SELECTED_CONTACT_KEY) ?? ''; }
  catch { return ''; }
}

function writeTerminalSelectedContact(characterId: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (characterId) window.localStorage.setItem(TERMINAL_SELECTED_CONTACT_KEY, characterId);
    else window.localStorage.removeItem(TERMINAL_SELECTED_CONTACT_KEY);
  } catch { /* Local UI preference may be unavailable. */ }
}

function readTerminalDraft(characterId: string): string {
  if (typeof window === 'undefined' || !characterId) return '';
  try {
    const drafts = JSON.parse(window.localStorage.getItem(TERMINAL_DRAFTS_KEY) ?? '{}') as Record<string, unknown>;
    return typeof drafts[characterId] === 'string' ? drafts[characterId] : '';
  } catch { return ''; }
}

function writeTerminalDraft(characterId: string, draft: string): void {
  if (typeof window === 'undefined' || !characterId) return;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(TERMINAL_DRAFTS_KEY) ?? '{}') as Record<string, unknown>;
    const drafts = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    if (draft) drafts[characterId] = draft;
    else delete drafts[characterId];
    window.localStorage.setItem(TERMINAL_DRAFTS_KEY, JSON.stringify(drafts));
  } catch { /* Local UI preference may be unavailable. */ }
}

function readEncounterChatSession(): EncounterChatSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(ENCOUNTER_CHAT_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EncounterChatSession>;
    if (typeof parsed.characterId !== 'string' || !Array.isArray(parsed.participantIds) || typeof parsed.nodeId !== 'string' || !['topics', 'manual', 'ended'].includes(parsed.mode ?? '')) return null;
    return { characterId: parsed.characterId, participantIds: parsed.participantIds.filter((id): id is string => typeof id === 'string'), nodeId: parsed.nodeId, mode: parsed.mode as EncounterChatSession['mode'], ...(typeof parsed.entryId === 'string' ? { entryId: parsed.entryId } : {}), ...(parsed.lastResponseSource === 'topic' || parsed.lastResponseSource === 'manual' ? { lastResponseSource: parsed.lastResponseSource } : {}) };
  } catch { return null; }
}

function writeEncounterChatSession(session: EncounterChatSession | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (session) window.sessionStorage.setItem(ENCOUNTER_CHAT_SESSION_KEY, JSON.stringify(session));
    else window.sessionStorage.removeItem(ENCOUNTER_CHAT_SESSION_KEY);
  } catch { /* Session storage may be unavailable in privacy-restricted browsers. */ }
}

const now = () => new Date().toISOString();
const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now()}`;
const newProvider = (): ProviderConfig => ({ id: `provider-${Date.now()}`, name: '新 Provider', kind: 'openai-compatible', endpoint: '', model: '', contextWindow: 8192, maxOutputTokens: 1024, temperature: 0.7 });
const newEmbeddingConfig = (): EmbeddingConfig => ({ id: 'embedding', enabled: false, endpoint: '', model: '', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: now() });
const newTtsConfig = (): TtsConfig => ({ id: `tts-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: '新语音配置', enabled: false, endpoint: '', model: '', voice: 'alloy', format: 'mp3', requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: now() });
const newImageConfig = (): ImageConfig => ({ id: 'image', size: '1024x1024', stylePrompt: '', responseFormat: 'b64_json', referenceMode: 'none', multiReferenceEnabled: false, requestCount: 0, failureCount: 0, lastStatus: 'idle', updatedAt: now() });
const newChatMessageId = (characterId: string) => `${characterId}-chat-${typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`}`;
const errorMessage = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;
function imageBase64ToBlob(base64: string, mimeType = 'image/png'): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}
async function generatedImageToBlob(result: { base64?: string; url?: string }): Promise<Blob> {
  if (result.base64) return imageBase64ToBlob(result.base64);
  if (!result.url) throw new Error('图像 Provider 返回中没有可保存的图片。');
  const response = await fetch(result.url);
  if (!response.ok) throw new Error(`生成图片下载失败（HTTP ${response.status}）`);
  return await response.blob();
}
async function measureAudioDurationMs(blob: Blob): Promise<number> {
  if (typeof Audio === 'undefined' || typeof URL === 'undefined') return 0;
  const source = URL.createObjectURL(blob);
  try {
    return await new Promise<number>((resolve) => {
      const audio = new Audio();
      const finish = () => { URL.revokeObjectURL(source); const duration = Number.isFinite(audio.duration) && audio.duration >= 0 ? audio.duration : 0; resolve(Math.round(duration * 1000)); };
      audio.preload = 'metadata';
      audio.onloadedmetadata = finish;
      audio.onerror = finish;
      audio.src = source;
      window.setTimeout(finish, 1500);
    });
  } catch { URL.revokeObjectURL(source); return 0; }
}
function storedAssetId(reference: AssetRef | undefined): string | undefined { return reference?.kind === 'stored' ? reference.assetId : undefined; }
function ImageUrlInput({ label = '保存外链', placeholder = 'https://…', onApply }: { label?: string; placeholder?: string; onApply: (url: string) => Promise<void> }) {
  const [value, setValue] = useState('');
  return <div className="button-row"><input aria-label={label} inputMode="url" placeholder={placeholder} value={value} onChange={(event) => setValue(event.target.value)} /><button type="button" className="secondary" disabled={!value.trim()} onClick={() => void onApply(value)}>{label}</button></div>;
}
function formatByteSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
const TASK_LABELS: Record<TaskId, string> = {
  narrate_main: '主线叙述', narrate_daily: '日常对话', topic_tree: '话题树', world_morning: '晨间世界更新',
  world_gen: '世界生成', map_gen: '地图生成', npc_batch: 'NPC 批处理', extract_ops: '状态变化整理', summarize_memory: '记忆整理',
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
  'gift-reaction': '送礼回应：正文 + resolve_gift，验证 pending 礼物由模型确认。',
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
  schemaVersion: CURRENT_SCHEMA_VERSION,
  meta: { id: 'local-save', title: '我的世界', createdAt: now(), updatedAt: now(), appVersion: '0.0.1' },
  config: { calendar: { slots: [...DEFAULT_SLOT_DEFS], daysPerWeek: 7, weekdayNames: ['一', '二', '三', '四', '五', '六', '日'], preset: 'standard', unlimitedSlots: false }, actionCosts: { ...DEFAULT_ACTION_COSTS }, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, morningStyle: 'newspaper', encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
  world: {
    clock: { day: 1, slotId: 'morning' },
    slotsUsedToday: 0,
    player: { name: '旅人', nodeId: 'start', stats: { 'custom-reputation': 0, money: 0, 'economy.rent.amount': 10, 'economy.rent.interval-days': 7, 'economy.job.wage': 18, 'economy.shop.days-open': 0, 'economy.housing.upgrade.basic-to-settled.cost': 30, energy: 6, 'economy.energy.max': 6, 'economy.energy.rest-restore': 2 }, flags: { 'economy.energy.enabled': true }, inventory: [] },
    stats: {}, flags: {},
    items: { 'white-flower': { id: 'white-flower', name: '白色小花', tags: ['flower'], description: '一朵可用于 Mock 验收的白色小花。', stackable: true, giftable: true } },
    relations: {}, characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [], topicTrees: {}, usedTopics: {}, appointments: [], eventDefs: {}, director: { scheduled: [], lastFiredDay: {}, tension: 0, tensionOffset: 0, tensionUpdatedDay: 1 }, eventHistory: [], chapters: [], milestones: [], storyScenes: [], collection: [], economy: structuredClone(DEFAULT_ECONOMY_STATE), terminal: structuredClone(DEFAULT_TERMINAL_STATE),
    map: createDefaultMap(),
    diary: [], settlements: [],
  },
});

export function App() {
  const musicPlayer = useMusicPlayer();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => typeof window === 'undefined' ? 'system' : readThemeMode(window.localStorage));
  const [customCss, setCustomCss] = useState(() => typeof window === 'undefined' ? '' : readCustomCss(window.localStorage));
  const [customCssDraft, setCustomCssDraft] = useState(customCss);
  const [themeTemplate, setThemeTemplate] = useState<ThemeTemplate>(() => typeof window === 'undefined' ? 'default' : readThemeTemplate(window.localStorage));
  const [themeAppearance, setThemeAppearance] = useState<ThemeAppearanceConfig>(() => typeof window === 'undefined' ? { ...DEFAULT_THEME_APPEARANCE } : readThemeAppearance(window.localStorage));
  const [desktopIcons, setDesktopIcons] = useState<DesktopIconOverrides>(() => typeof window === 'undefined' ? {} : readDesktopIconOverrides(window.localStorage));
  const [tab, setTab] = useState<Tab>('map');
  const [appName, setAppName] = useState(readAppName);
  const [appNameDraft, setAppNameDraft] = useState(appName);
  const [editingAppName, setEditingAppName] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage | null>(null);
  const [libraryPage, setLibraryPage] = useState<LibraryPage | null>(null);
  const [dayPage, setDayPage] = useState<DayPage | null>(null);
  const [characters, setCharacters] = useState<CharacterCard[]>([]);
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [worldbooks, setWorldbooks] = useState<WorldbookEntry[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [presetBundles, setPresetBundles] = useState<PresetBundle[]>([]);
  const [terminalStickers, setTerminalStickers] = useState<TerminalStickerRecord[]>([]);
  const [storyScenePresets, setStoryScenePresets] = useState<StoryScenePreset[]>(createBuiltinStoryScenePresets());
  const [selectedPresetBundleId, setSelectedPresetBundleId] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState('');
  const selectedCharacterIdRef = useRef('');
  const [chatParticipantIds, setChatParticipantIds] = useState<string[]>([]);
  const [visualCharacterId, setVisualCharacterId] = useState('');
  const [personaEditingId, setPersonaEditingId] = useState('');
  const [personaName, setPersonaName] = useState('');
  const [personaDisplayName, setPersonaDisplayName] = useState('');
  const [personaDescription, setPersonaDescription] = useState('');
  const [loadedChatCharacterId, setLoadedChatCharacterId] = useState('');
  const [name, setName] = useState('');
  const [draftText, setDraftText] = useState('');
  const [presetBundleName, setPresetBundleName] = useState('');
  const [editing, setEditing] = useState<{ kind: ContentKind; id: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [regenerateInput, setRegenerateInput] = useState('');
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [provider, setProvider] = useState<ProviderConfig>(newProvider);
  const [bindings, setBindings] = useState<ProviderBinding[]>([]);
  const [characterBindings, setCharacterBindings] = useState<CharacterProviderBinding[]>([]);
  const [defaultProviderId, setDefaultProviderId] = useState('');
  const [headersDraft, setHeadersDraft] = useState('{}');
  const [models, setModels] = useState<string[]>([]);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(newEmbeddingConfig);
  const embeddingConfigRef = useRef<EmbeddingConfig>(newEmbeddingConfig());
  const [embeddingHeadersDraft, setEmbeddingHeadersDraft] = useState('{}');
  const [embeddingBusy, setEmbeddingBusy] = useState(false);
  const [ttsConfigs, setTtsConfigs] = useState<TtsConfig[]>([]);
  const [defaultTtsConfigId, setDefaultTtsConfigId] = useState('');
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(newTtsConfig);
  const ttsConfigRef = useRef<TtsConfig>(newTtsConfig());
  const [ttsHeadersDraft, setTtsHeadersDraft] = useState('{}');
  const [ttsBusy, setTtsBusy] = useState(false);
  const ttsBusyRef = useRef(false);
  const [imageConfig, setImageConfig] = useState<ImageConfig>(newImageConfig);
  const imageConfigRef = useRef<ImageConfig>(newImageConfig());
  const [imageBusy, setImageBusy] = useState(false);
  const imageBusyRef = useRef(false);
  const [imageVisualConfigs, setImageVisualConfigs] = useState<ImageVisualConfig[]>([]);
  const [imageUserVisualConfigs, setImageUserVisualConfigs] = useState<ImageUserVisualConfig[]>([]);
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageTarget, setImageTarget] = useState<'avatar' | 'portrait'>('avatar');
  const [voiceCacheStats, setVoiceCacheStats] = useState<VoiceCacheStats>({ count: 0, totalBytes: 0, referenceCount: 0 });
  const [imageAssetStats, setImageAssetStats] = useState<ImageAssetStats>({ count: 0, totalBytes: 0, referenceCount: 0 });
  const [musicAssetStats, setMusicAssetStats] = useState<MusicAssetStats>({ count: 0, totalBytes: 0, referenceCount: 0, importedCount: 0, offlineCacheCount: 0, orphanedCount: 0 });
  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate>({});
  const [assetIntegrityReport, setAssetIntegrityReport] = useState<AssetIntegrityReport | null>(null);
  const [assetIntegrityBusy, setAssetIntegrityBusy] = useState(false);
  const [requestStatus, setRequestStatus] = useState<RequestStatus>('idle');
  const [busy, setBusy] = useState(false);
  const [terminalBusy, setTerminalBusy] = useState(false);
  const [terminalCall, setTerminalCall] = useState<TerminalCallSession | null>(null);
  const [replyInProgress, setReplyInProgress] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [globalBackupPreview, setGlobalBackupPreview] = useState<ImportedGlobalBackup | null>(null);
  const [themePackagePreview, setThemePackagePreview] = useState<ImportedThemePackage | null>(null);
  const [save, setSave] = useState<SaveFile>(defaultSave);
  const [snapshots, setSnapshots] = useState<SaveSnapshot[]>([]);
  const saveRef = useRef(save);
  const pendingDiaryDaysRef = useRef<number[]>([]);
  const pendingMemoryCandidatesRef = useRef<PendingMemoryCandidate[]>([]);
  const [pendingOps, setPendingOps] = useState<PendingOpsRecovery | null>(null);
  const [chatRecovery, setChatRecovery] = useState<ChatRecoveryRecord | null>(null);
  const chatRecoveryRef = useRef<ChatRecoveryRecord | null>(null);
  const appliedRequestIdsRef = useRef(new Set<string>());
  const [manualOps, setManualOps] = useState('[]');
  const [mockFixtureId, setMockFixtureId] = useState<MockFixtureId | ''>('');
  const [itemName, setItemName] = useState('');
  const [itemTags, setItemTags] = useState('');
  const [itemDescription, setItemDescription] = useState('');
  const [statKey, setStatKey] = useState('');
  const [statValue, setStatValue] = useState('0');
  const [includeChatsOnExport, setIncludeChatsOnExport] = useState(true);
  const [summarizingDay, setSummarizingDay] = useState<number | null>(null);
  const [mapGenerating, setMapGenerating] = useState(false);
  const [activeEncounter, setActiveEncounter] = useState<ActiveEncounter | null>(null);
  const [encounterParticipantIds, setEncounterParticipantIds] = useState<string[]>([]);
  const [chatParticipantsLocked, setChatParticipantsLocked] = useState(() => Boolean(readEncounterChatSession()));
  const [chatEncounterEntryId, setChatEncounterEntryId] = useState(() => readEncounterChatSession()?.entryId ?? '');
  const [topicTree, setTopicTree] = useState<TopicTree | null>(null);
  const [topicMode, setTopicMode] = useState<'topics' | 'manual' | 'ended'>('manual');
  const [topicLoading, setTopicLoading] = useState(false);
  const [topicRetryContext, setTopicRetryContext] = useState<TopicRetryContext | null>(null);
  const [lastResponseSource, setLastResponseSource] = useState<'topic' | 'manual' | null>(() => readEncounterChatSession()?.lastResponseSource ?? null);
  const [debugTab, setDebugTab] = useState<'Prompt' | 'Raw' | 'Ops' | 'State'>('Prompt');
  const [debug, setDebug] = useState<DebugState>({ prompt: null, raw: '', ops: '尚未解析状态变化。', state: JSON.stringify(defaultSave, null, 2) });
  const [devToolSeed, setDevToolSeed] = useState('42');
  const [devToolDays, setDevToolDays] = useState('30');
  const [devToolReport, setDevToolReport] = useState<DevToolReport>(null);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const update = () => { applyTheme(themeMode, media?.matches ?? false); };
    update();
    const onThemeChange = () => setThemeMode(readThemeMode(window.localStorage));
    window.addEventListener('tokimeki:theme-change', onThemeChange);
    media?.addEventListener?.('change', update);
    return () => { window.removeEventListener('tokimeki:theme-change', onThemeChange); media?.removeEventListener?.('change', update); };
  }, [themeMode]);

  useEffect(() => { if (typeof document !== 'undefined') applyCustomCss(customCss); }, [customCss]);
  useEffect(() => { applyThemeTemplate(themeTemplate); }, [themeTemplate]);
  useEffect(() => { applyThemeAppearance(themeAppearance); }, [themeAppearance]);

  function saveCustomCss(): string[] {
    const issues = validateCustomCss(customCssDraft);
    if (issues.length) return issues;
    const writeIssues = writeCustomCss(window.localStorage, customCssDraft);
    if (writeIssues.length) return writeIssues;
    setCustomCss(customCssDraft);
    return [];
  }

  function resetCustomCss(): void {
    setCustomCssDraft('');
    writeCustomCss(window.localStorage, '');
    setCustomCss('');
  }

  function updateThemeTemplate(template: ThemeTemplate): void {
    setThemeTemplate(template);
    try { window.localStorage.setItem(THEME_TEMPLATE_STORAGE_KEY, template); window.dispatchEvent(new CustomEvent('tokimeki:theme-change')); } catch { /* local preference unavailable */ }
  }

  function updateThemeAppearance(config: ThemeAppearanceConfig): void {
    const parsed = parseThemeAppearance(config);
    setThemeAppearance(parsed);
    writeThemeAppearance(window.localStorage, parsed);
  }

  async function setDesktopIcon(launcherId: string, entryId: string, value: AssetRef | undefined): Promise<void> {
    const previous = desktopIcons[launcherId]?.[entryId];
    const entries = { ...desktopIcons[launcherId] };
    if (value) entries[entryId] = value; else delete entries[entryId];
    const next = parseDesktopIconOverrides({ ...desktopIcons, [launcherId]: entries });
    setDesktopIcons(next); writeDesktopIconOverrides(window.localStorage, next); window.dispatchEvent(new CustomEvent('tokimeki:theme-change'));
    if (previous?.kind === 'stored' && previous.assetId.startsWith('desktop-icon-') && !Object.values(next).some((group) => Object.values(group).some((ref) => ref.kind === 'stored' && ref.assetId === previous.assetId))) await deleteAsset(previous.assetId);
  }
  async function importDesktopIcon(launcherId: string, entryId: string, file?: File): Promise<void> {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { setFeedback({ tone: 'error', text: '桌面图标仅支持 PNG、JPEG 或 WebP。' }); return; }
    const image = await downsampleImage(file, 256, 0.9); const assetId = `desktop-icon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, category: 'image', width: image.width, height: image.height, createdAt: now() }); await setDesktopIcon(launcherId, entryId, { kind: 'stored', assetId });
  }
  async function setDesktopIconUrl(launcherId: string, entryId: string, url: string): Promise<void> {
    const trimmed = url.trim(); if (!/^https?:\/\/\S+$/i.test(trimmed)) { setFeedback({ tone: 'error', text: '图标外链必须是有效的 http(s) 地址。' }); return; } await setDesktopIcon(launcherId, entryId, { kind: 'url', url: trimmed });
  }

  useEffect(() => {
    void listTerminalStickers().then(setTerminalStickers).catch(() => setTerminalStickers([]));
  }, []);

  function markResponseSource(source: 'topic' | 'manual' | null): void {
    setLastResponseSource(source);
    const session = readEncounterChatSession();
    if (session) writeEncounterChatSession({ ...session, ...(source ? { lastResponseSource: source } : { lastResponseSource: undefined }) });
  }

  useEffect(() => {
    void Promise.all([contentDb.characters.toArray(), contentDb.personas.toArray(), contentDb.worldbooks.toArray(), contentDb.presets.toArray(), contentDb.presetBundles.toArray(), contentDb.storyScenePresets.toArray(), providerDb.providers.toArray(), providerDb.bindings.toArray(), providerDb.characterBindings.toArray(), providerDb.settings.get('defaultProviderId'), providerDb.settings.get('defaultTtsProviderId'), providerDb.embeddingConfigs.get('embedding'), providerDb.ttsConfigs.toArray(), providerDb.imageConfigs.get('image'), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray(), loadCurrentSave(), listSnapshots()]).then(([c, masks, w, p, bundles, scenePresets, ps, bs, storedCharacterBindings, setting, ttsSetting, storedEmbedding, storedTtsConfigs, storedImageConfig, storedImageVisualConfigs, storedImageUserVisualConfigs, persistedSave, savedSnapshots]) => {
      if (persistedSave) {
        const parsedSave = SaveFileSchema.parse(persistedSave);
        saveRef.current = parsedSave;
        setSave(parsedSave);
        setDebug((current) => ({ ...current, state: JSON.stringify(parsedSave, null, 2) }));
        const session = readEncounterChatSession();
        if (session && session.nodeId === parsedSave.world.player.nodeId && session.participantIds.length) {
          setChatParticipantsLocked(true);
          setChatEncounterEntryId(session.entryId ?? '');
          setChatParticipantIds(session.participantIds);
          setSelectedCharacterId(session.characterId);
          setLastResponseSource(session.lastResponseSource ?? null);
          const restoredTopicTree = parsedSave.world.topicTrees[topicTreeKey(session.characterId, session.nodeId)] ?? null;
          const restoredMode = session.mode === 'topics' && !restoredTopicTree ? 'manual' : session.mode;
          setTopicMode(restoredMode);
          setTopicTree(restoredTopicTree);
          if (restoredMode !== session.mode) writeEncounterChatSession({ ...session, mode: restoredMode });
        } else if (session) writeEncounterChatSession(null);
      } else {
        void saveCurrentSave(defaultSave);
      }
      setSnapshots(savedSnapshots);
      const validPresets = p.flatMap((preset) => {
        const parsed = PresetSchema.safeParse(preset);
        return parsed.success ? [parsed.data] : [];
      });
      const validBundles = bundles.flatMap((bundle) => {
        const parsed = PresetBundleSchema.safeParse(bundle);
        return parsed.success ? [parsed.data] : [];
      });
      const legacyBundle = !validBundles.length && validPresets.length ? PresetBundleSchema.parse({ id: 'bundle-legacy', name: '默认预设包', entries: validPresets, updatedAt: now() }) : undefined;
      const storedBuiltin = validBundles.find((bundle) => bundle.id === BUILTIN_NARRATION_PRESET_BUNDLE_ID);
      const builtinBundle = mergeBuiltinNarrationPresetBundle(storedBuiltin);
      const userBundles = (validBundles.length ? validBundles : legacyBundle ? [legacyBundle] : []).filter((bundle) => bundle.id !== BUILTIN_NARRATION_PRESET_BUNDLE_ID);
      const resolvedBundles = [builtinBundle, ...userBundles];
      const bundledEntries = resolvedBundles.flatMap((bundle) => bundle.entries);
      const resolvedPresets = [...validPresets.filter((preset) => !bundledEntries.some((entry) => entry.id === preset.id)), ...bundledEntries];
      setCharacters(c); setPersonas(masks); setWorldbooks(w); setPresets(resolvedPresets); setPresetBundles(resolvedBundles); setSelectedPresetBundleId(resolvedBundles[0]?.id ?? ''); setProviders(ps);
      setStoryScenePresets([...createBuiltinStoryScenePresets(), ...scenePresets.filter((preset) => !preset.builtin)]);
      if (!storedBuiltin || storedBuiltin.entries.length !== builtinBundle.entries.length) void savePresetBundle(builtinBundle);
      if (legacyBundle) void savePresetBundle(legacyBundle);
      setBindings(bs);
      setCharacterBindings(storedCharacterBindings.flatMap((binding) => { const parsed = CharacterProviderBindingSchema.safeParse(binding); return parsed.success ? [parsed.data] : []; }));
      if (storedEmbedding) { embeddingConfigRef.current = storedEmbedding; setEmbeddingConfig(storedEmbedding); setEmbeddingHeadersDraft(JSON.stringify(storedEmbedding.headers ?? {}, null, 2)); }
      const restoredTtsConfigs = storedTtsConfigs.map((stored) => TtsConfigSchema.parse(stored.lastStatus === 'requesting' ? { ...stored, lastStatus: 'error', lastError: '上次语音请求已中止，请手动重试。', updatedAt: now() } : stored));
      const resolvedTtsId = restoredTtsConfigs.some((item) => item.id === ttsSetting?.value) ? ttsSetting?.value ?? '' : restoredTtsConfigs[0]?.id ?? '';
      const selectedTts = restoredTtsConfigs.find((item) => item.id === resolvedTtsId) ?? restoredTtsConfigs[0] ?? newTtsConfig();
      setTtsConfigs(restoredTtsConfigs); setDefaultTtsConfigId(resolvedTtsId); ttsConfigRef.current = selectedTts; setTtsConfig(selectedTts); setTtsHeadersDraft(JSON.stringify(selectedTts.headers ?? {}, null, 2));
      for (const stored of restoredTtsConfigs) if (storedTtsConfigs.find((item) => item.id === stored.id)?.lastStatus === 'requesting') void providerDb.ttsConfigs.put(stored);
      if (resolvedTtsId && ttsSetting?.value !== resolvedTtsId) void providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultTtsProviderId', value: resolvedTtsId }));
      if (c[0] && !readEncounterChatSession()) setSelectedCharacterId(c[0].id);
      if (ps[0]) setProvider(ps[0]);
      const resolvedDefaultProviderId = ps.some((item) => item.id === setting?.value) ? setting?.value ?? '' : ps[0]?.id ?? '';
      setDefaultProviderId(resolvedDefaultProviderId);
      if (resolvedDefaultProviderId && setting?.value !== resolvedDefaultProviderId) {
        void providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: resolvedDefaultProviderId }));
      }
      const parsedImage = storedImageConfig
        ? ImageConfigSchema.parse(storedImageConfig.lastStatus === 'requesting' ? { ...storedImageConfig, lastStatus: 'error', lastError: '上次图像请求已中止，请手动重试。', updatedAt: now() } : storedImageConfig)
        : ImageConfigSchema.parse({ ...newImageConfig(), providerId: bs.find((binding) => binding.taskId === 'image')?.providerId ?? (resolvedDefaultProviderId || undefined) });
      imageConfigRef.current = parsedImage; setImageConfig(parsedImage);
      if (!storedImageConfig || storedImageConfig.lastStatus === 'requesting') void providerDb.imageConfigs.put(parsedImage);
      setImageVisualConfigs(storedImageVisualConfigs.flatMap((item) => { const parsed = ImageVisualConfigSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }));
      setImageUserVisualConfigs(storedImageUserVisualConfigs.flatMap((item) => { const parsed = ImageUserVisualConfigSchema.safeParse(item); return parsed.success ? [parsed.data] : []; }));
      if (c[0] && !visualCharacterId) setVisualCharacterId(c[0].id);
    });
  }, []);

  useEffect(() => { setHeadersDraft(JSON.stringify(provider.headers ?? {}, null, 2)); }, [provider.id]);
  useEffect(() => { setTtsHeadersDraft(JSON.stringify(ttsConfig.headers ?? {}, null, 2)); }, [ttsConfig.id]);
  useEffect(() => { selectedCharacterIdRef.current = selectedCharacterId; }, [selectedCharacterId]);
  useEffect(() => {
    if (tab === 'settings' && settingsPage === 'privacy') { void refreshVoiceCacheStats(); void refreshImageAssetStats(); void refreshMusicAssetStats(); }
  }, [settingsPage, tab, musicPlayer.state.updatedAt]);
  useEffect(() => {
    if (tab !== 'settings' || settingsPage !== 'privacy') return;
    void readStorageEstimate().then(setStorageEstimate);
  }, [settingsPage, tab, voiceCacheStats, imageAssetStats, musicAssetStats]);

  useEffect(() => {
    let cancelled = false;
    pendingMemoryCandidatesRef.current = [];
    setLoadedChatCharacterId('');
    if (!selectedCharacterId) { setMessages([]); return () => { cancelled = true; }; }
    setMessages([]);
    void Promise.all([loadChat(selectedCharacterId), loadChatRecovery(selectedCharacterId)]).then(([record, recovery]) => {
      if (cancelled) return;
      setMessages(record?.messages ?? []);
      const restored = markBackgroundRequestInterrupted(recovery);
      if (restored) {
        const normalizedMessages = normalizeChatMessages(selectedCharacterId, restored.messages).messages;
        const normalizedBaseMessages = normalizeChatMessages(selectedCharacterId, restored.baseMessages).messages;
        const normalizedRecovery = { ...restored, messages: normalizedMessages, baseMessages: normalizedBaseMessages };
        updateChatRecovery(normalizedRecovery);
        setInput(restored.input);
        if (restored.status === 'interrupted' || restored.status === 'error') {
          setRequestStatus('error');
          if (restored.raw && !restored.opsApplied) setPendingOps({ raw: restored.raw, actorId: restored.actorId, messageIndex: restored.messageIndex, streamError: restored.error, requestId: restored.requestId });
          setFeedback({ tone: 'info', text: restored.status === 'interrupted' ? '上次回复在页面进入后台时中断，正文已保留；请手动重试。' : '上次回复未完成，正文已保留；请手动重试。' });
        }
        if (normalizedMessages.length) setMessages(normalizedMessages);
      } else updateChatRecovery(recovery ?? null);
      setLoadedChatCharacterId(selectedCharacterId);
    });
    return () => { cancelled = true; };
  }, [selectedCharacterId]);

  useEffect(() => {
    const persist = () => {
      if (!selectedCharacterId) return;
      const current = chatRecoveryRef.current;
      if (current && (current.status === 'requesting' || current.status === 'generating')) {
        const interrupted = markBackgroundRequestInterrupted(current);
        if (interrupted) updateChatRecovery({ ...interrupted, input, messages, assistantText: messages.at(-1)?.role === 'assistant' ? messages.at(-1)?.content ?? '' : interrupted.assistantText });
      } else if (input.trim()) updateChatRecovery(draftRecoveryRecord(selectedCharacterId, input, messages));
      void saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') persist(); };
    const onPageHide = () => persist();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => { document.removeEventListener('visibilitychange', onVisibility); window.removeEventListener('pagehide', onPageHide); };
  }, [input, messages, selectedCharacterId]);

  useEffect(() => {
    if (!selectedCharacterId || loadedChatCharacterId !== selectedCharacterId) return;
    const timeout = window.setTimeout(() => { void saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() }); }, 150);
    return () => window.clearTimeout(timeout);
  }, [loadedChatCharacterId, messages, selectedCharacterId]);

  const activeCharacter = characters.find((item) => item.id === selectedCharacterId);
  const chatDeparture = useMemo<EncounterDeparture | undefined>(() => {
    if (!chatEncounterEntryId) return undefined;
    return save.world.encounterLog.find((entry) => entry.id === chatEncounterEntryId)?.departure;
  }, [chatEncounterEntryId, save.world.encounterLog]);
  const presentChatCharacters = useMemo(() => {
    const presentIds = new Set(whoIsHere(save.world, save.world.player.nodeId, save.world.clock.day, save.world.clock.slotId, save.config.calendar.daysPerWeek).filter((person) => person.tier === 'formal').map((person) => person.id));
    return characters.filter((character) => presentIds.has(character.id));
  }, [characters, save.world, save.config.calendar.daysPerWeek]);
  const activePersona = personas.find((persona) => persona.id === save.world.player.personaId);
  useEffect(() => {
    if (selectedCharacterId && !presentChatCharacters.some((character) => character.id === selectedCharacterId)) setSelectedCharacterId(presentChatCharacters[0]?.id ?? '');
  }, [presentChatCharacters, selectedCharacterId]);
  const promptEvents = useMemo(() => new EventBus(), []);
  const opRegistry = useMemo(() => createDefaultOpRegistry(), []);
  const terminalOpRegistry = useMemo(() => createTerminalOpRegistry(), []);
  const lifeOpRegistry = useMemo(() => {
    const registry = createEconomyOpRegistry();
    registerEnergyOps(registry);
    return registry;
  }, []);
  const assembler = useMemo(() => {
    const instance = new PromptAssembler();
    for (const block of createDefaultPromptBlocks(opRegistry.promptDocs())) instance.register(block);
    for (const block of TOPIC_TREE_PROMPT_BLOCKS) instance.register(block);
    return instance;
  }, [opRegistry]);

  useEffect(() => promptEvents.subscribe('onDaySettle', ({ day }) => {
    if (!pendingDiaryDaysRef.current.includes(day)) pendingDiaryDaysRef.current.push(day);
  }), [promptEvents]);

  useEffect(() => {
    const unsubscribeEnter = promptEvents.subscribe('onEnterNode', ({ toNodeId, world }) => {
      const currentWorld = world ?? saveRef.current.world;
      markAppointmentOnEnter(currentWorld, saveRef.current.config.calendar, toNodeId);
    });
    const unsubscribeTime = promptEvents.subscribe('onTimeAdvance', ({ day, toSlotId, world }) => {
      const currentWorld = world ?? saveRef.current.world;
      markAppointmentOnTimeAdvance(currentWorld, saveRef.current.config.calendar, day, toSlotId);
      deliverNightlyTerminalMessage(currentWorld, day, toSlotId);
    });
    const unsubscribeSettle = promptEvents.subscribe('onDaySettle', ({ day, settlement, world }) => {
      settleAppointments(world ?? saveRef.current.world, day, settlement);
    });
    const unsubscribeEconomy = registerEconomyHooks(promptEvents, lifeOpRegistry);
    return () => { unsubscribeEnter(); unsubscribeTime(); unsubscribeSettle(); unsubscribeEconomy(); };
  }, [lifeOpRegistry, promptEvents]);

  function commitSave(next: SaveFile): void {
    const parsed = SaveFileSchema.parse({ ...next, meta: { ...next.meta, updatedAt: now() } });
    saveRef.current = parsed;
    setSave(parsed);
    setDebug((current) => ({ ...current, state: JSON.stringify(parsed, null, 2) }));
    void saveCurrentSave(parsed).catch((error) => setFeedback({ tone: 'error', text: `本地存档保存失败：${errorMessage(error, '未知错误')}` }));
    const settledDays = pendingDiaryDaysRef.current.splice(0);
    if (settledDays.length) {
      void (async () => {
        for (const day of settledDays) await saveDailySnapshot(parsed, day, parsed.meta.updatedAt);
        setSnapshots(await listSnapshots());
      })().catch((error) => setFeedback({ tone: 'error', text: `自动快照保存失败：${errorMessage(error, '未知错误')}` }));
      queueMicrotask(() => settledDays.forEach((day) => { void generateDayDiary(day); }));
    }
  }

  function requestTerminalFriend(characterId: string, direction: ContactDirection): void {
    const next = structuredClone(saveRef.current);
    const result = createFriendRequest(next.world, characterId, direction);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '好友申请失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? '好友申请已通过。' : '好友关系已经通过。' });
  }

  function resolveTerminalFriend(requestId: string, action: 'accept' | 'reject' | 'revoke'): void {
    const next = structuredClone(saveRef.current);
    const result = resolveFriendRequest(next.world, requestId, action);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '好友申请处理失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? '好友申请状态已更新。' : '该好友申请已经处理过。' });
  }

  function sendTerminalText(characterId: string, text: string, quoteMessageId?: string): void {
    const next = structuredClone(saveRef.current);
    const result = sendTerminalTextMessage(next.world, characterId, text, undefined, undefined, quoteMessageId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '终端消息发送失败。' }); return; }
    commitSave(next);
  }

  async function editTerminalText(characterId: string, messageId: string, text: string): Promise<void> {
    const previousAssetId = storedAssetId(listTerminalMessages(saveRef.current.world, characterId).find((message) => message.id === messageId)?.asset);
    const next = structuredClone(saveRef.current);
    const result = editTerminalMessage(next.world, characterId, messageId, text);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '消息编辑失败。' }); return; }
    if (result.changed) commitSave(next);
    if (result.changed && previousAssetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
  }

  async function deleteTerminalText(characterId: string, messageId: string): Promise<void> {
    const previousAssetId = storedAssetId(listTerminalMessages(saveRef.current.world, characterId).find((message) => message.id === messageId)?.asset);
    const next = structuredClone(saveRef.current);
    const result = deleteTerminalMessage(next.world, characterId, messageId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '消息删除失败。' }); return; }
    if (result.changed) commitSave(next);
    if (result.changed && previousAssetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
  }

  function sendTerminalStickerUrl(characterId: string, url: string, quoteMessageId?: string): void {
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) { setFeedback({ tone: 'error', text: '贴图外链必须是有效的 http(s) 地址。' }); return; }
    const next = structuredClone(saveRef.current);
    const result = sendTerminalStickerMessage(next.world, characterId, { kind: 'url', url: trimmed }, undefined, undefined, quoteMessageId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '贴图发送失败。' }); return; }
    commitSave(next);
  }

  async function sendTerminalStickerFile(characterId: string, file?: File, quoteMessageId?: string): Promise<void> {
    if (!file) return;
    try {
      const image = await downsampleImage(file, 900, 0.82);
      const assetId = `terminal-sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const next = structuredClone(saveRef.current);
      const result = sendTerminalStickerMessage(next.world, characterId, { kind: 'stored', assetId }, undefined, undefined, quoteMessageId);
      if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '贴图发送失败。' }); return; }
      commitSave(next);
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '贴图导入失败') }); }
  }

  function sendTerminalStickerAsset(characterId: string, asset: AssetRef, quoteMessageId?: string): void {
    const next = structuredClone(saveRef.current);
    const result = sendTerminalStickerMessage(next.world, characterId, asset, undefined, undefined, quoteMessageId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '贴图发送失败。' }); return; }
    commitSave(next);
  }

  function sendPlayerTerminalTransfer(characterId: string, currencyId: string, amount: number): void {
    const next = structuredClone(saveRef.current);
    const result = sendPlayerTransfer(next.world, characterId, currencyId, amount);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '转账失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '转账已发送，余额已扣除。' });
  }

  function resolveIncomingTransfer(requestId: string, action: TransferAction): void {
    const next = structuredClone(saveRef.current);
    const result = resolveIncomingTransferOp(next.world, requestId, action);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '转账提议处理失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? action === 'accept' ? '转账已收款，余额已增加。' : '已拒绝转账提议。' : '该转账提议已经处理过。' });
  }

  function createTerminalAppointment(characterId: string, input: TerminalAppointmentInput, direction: 'outgoing' | 'incoming' = 'outgoing'): void {
    const next = structuredClone(saveRef.current);
    const result = createTerminalAppointmentRequest(next.world, next.config.calendar, characterId, input, direction);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '远程约定创建失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? direction === 'outgoing' ? '约定提议已发出，等待对方确认。' : '已模拟对方发来约定提议。' : '已有相同的约定提议。' });
  }

  function simulateTerminalAppointmentAcceptanceForUi(requestId: string): void {
    const next = structuredClone(saveRef.current);
    const result = simulateTerminalAppointmentAcceptance(next.world, requestId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '模拟约定确认失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? '已模拟对方接受约定。现在可以确认加入日历。' : '该约定已经被接受。' });
  }

  function resolveTerminalAppointment(requestId: string, action: TerminalAppointmentAction): void {
    const next = structuredClone(saveRef.current);
    const result = resolveTerminalAppointmentRequest(next.world, requestId, action);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '远程约定处理失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? action === 'accept' ? '已接受约定提议。现在可以确认加入日历。' : action === 'reject' ? '已拒绝约定提议。' : '已撤回约定提议。' : '该约定提议已经处理过。' });
  }

  function confirmTerminalAppointmentForUi(requestId: string): void {
    const next = structuredClone(saveRef.current);
    const result = confirmTerminalAppointment(next.world, next.config.calendar, requestId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '加入日历失败。' }); return; }
    if (result.changed) commitSave(next);
    setFeedback({ tone: 'success', text: result.changed ? '约定已写入日历。' : '这项约定已经在日历中。' });
  }

  async function deleteVoiceAssetIfUnreferenced(assetId: string): Promise<void> {
    const [chats, savedSnapshots, stickers] = await Promise.all([contentDb.chats.toArray(), listSnapshots(), listTerminalStickers()]);
    const referenced = collectStoredAssetIds([saveRef.current, chats, savedSnapshots.map((snapshot) => snapshot.save), stickers]);
    if (!referenced.has(assetId)) await deleteAsset(assetId);
  }

  async function deleteImageAssetIfUnreferenced(assetId: string): Promise<void> {
    const [chats, savedSnapshots, stickers, characterImageConfigs, userImageConfigs, imageConfigs] = await Promise.all([contentDb.chats.toArray(), listSnapshots(), listTerminalStickers(), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray(), providerDb.imageConfigs.toArray()]);
    const referenced = collectStoredAssetIds([saveRef.current, ...savedSnapshots.map((snapshot) => snapshot.save), chats, stickers]);
    for (const id of imageReferenceAssetIds(characterImageConfigs, userImageConfigs)) referenced.add(id);
    for (const config of imageConfigs) if (config.lastGenerated?.asset.assetId) referenced.add(config.lastGenerated.asset.assetId);
    for (const group of Object.values(readDesktopIconOverrides(window.localStorage))) for (const ref of Object.values(group)) if (ref.kind === 'stored') referenced.add(ref.assetId);
    if (!referenced.has(assetId)) await deleteAsset(assetId);
  }

  async function refreshVoiceCacheStats(): Promise<void> {
    const [assets, chats, savedSnapshots] = await Promise.all([listVoiceAssets(), contentDb.chats.toArray(), listSnapshots()]);
    const references = countVoiceAssetReferences(chats, [saveRef.current, ...savedSnapshots.map((snapshot) => snapshot.save)]);
    setVoiceCacheStats(summarizeVoiceCache(assets, references));
  }

  async function refreshMusicAssetStats(): Promise<void> {
    const assets = await listMusicAssets();
    setMusicAssetStats(summarizeMusicAssets(assets, musicPlayer.state.tracks));
  }

  async function loadImageAssetReferenceRoots() {
    const [characterCards, chats, savedSnapshots, stickers, musicStates, characterImageConfigs, userImageConfigs, imageConfigs] = await Promise.all([contentDb.characters.toArray(), contentDb.chats.toArray(), listSnapshots(), listTerminalStickers(), contentDb.musicStates.toArray(), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray(), providerDb.imageConfigs.toArray()]);
    return [
      { label: '当前世界', value: saveRef.current },
      ...characterCards.map((card) => ({ label: `角色库/${card.id}`, value: card })),
      ...savedSnapshots.map((snapshot) => ({ label: `快照/${snapshot.id}`, value: snapshot.save })),
      ...chats.map((record) => ({ label: `聊天/${record.characterId}`, value: record })),
      ...stickers.map((sticker) => ({ label: `贴图库/${sticker.id}`, value: sticker })),
      ...musicStates.map((musicState) => ({ label: `音乐/${musicState.id}`, value: musicState })),
      ...characterImageConfigs.map((config) => ({ label: `角色锁脸/${config.id}`, value: config })),
      ...userImageConfigs.map((config) => ({ label: `用户锁脸/${config.id}`, value: config })),
      ...imageConfigs.map((config) => ({ label: `独立生成/${config.id}`, value: config.lastGenerated })),
      { label: '桌面图标', value: readDesktopIconOverrides(window.localStorage) },
    ];
  }

  async function refreshImageAssetStats(): Promise<void> {
    const [assets, characterCards, chats, savedSnapshots, characterImageConfigs, userImageConfigs, imageConfigs] = await Promise.all([listAssets(), contentDb.characters.toArray(), contentDb.chats.toArray(), listSnapshots(), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray(), providerDb.imageConfigs.toArray()]);
    const roots = [
      ...Object.values(saveRef.current.world.characters).map((character) => ({ label: `当前角色/${character.id}`, value: character.visuals })),
      ...characterCards.map((card) => ({ label: `角色库/${card.id}`, value: card.packageProfile?.visuals })),
      ...savedSnapshots.flatMap((snapshot) => Object.values(snapshot.save.world.characters).map((character) => ({ label: `快照/${snapshot.id}/角色/${character.id}`, value: character.visuals }))),
      ...characterImageConfigs.map((config) => ({ label: `角色锁脸/${config.id}`, value: config.referenceImage })),
      ...userImageConfigs.map((config) => ({ label: `用户锁脸/${config.id}`, value: config.referenceImage })),
      ...chats.map((record) => ({ label: `聊天 CG/${record.characterId}`, value: record.messages.map((message) => message.cg) })),
      ...imageConfigs.map((config) => ({ label: `独立生成/${config.id}`, value: config.lastGenerated })),
      { label: '桌面图标', value: readDesktopIconOverrides(window.localStorage) },
    ];
    setImageAssetStats(summarizeImageAssets(assets.map((asset) => ({ id: asset.id, size: asset.blob.size, mimeType: asset.mimeType, category: asset.category })), roots));
  }

  async function downloadVoiceAsset(reference: AssetRef | undefined, name: string): Promise<void> {
    const assetId = storedAssetId(reference);
    if (!assetId) { setFeedback({ tone: 'error', text: '语音资产不可用。' }); return; }
    const asset = await loadAsset(assetId);
    if (!asset) { setFeedback({ tone: 'error', text: '语音资产已不存在，只保留了文字消息。' }); return; }
    const extension = asset.audioFormat || asset.mimeType.split('/')[1]?.replace('mpeg', 'mp3') || 'audio';
    const url = URL.createObjectURL(asset.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(name)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: '语音已下载；此操作未调用 API。' });
  }

  async function downloadImageAsset(reference: AssetRef | undefined, name: string): Promise<void> {
    const assetId = storedAssetId(reference);
    if (!assetId) { setFeedback({ tone: 'error', text: '图片资产不可用。' }); return; }
    const asset = await loadAsset(assetId);
    if (!asset) { setFeedback({ tone: 'error', text: '图片资产已不存在。' }); return; }
    const extension = asset.mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
    const url = URL.createObjectURL(asset.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${slug(name)}.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: '图片已下载；此操作未调用 API。' });
  }

  async function sendTerminalVoice(characterId: string, messageId: string, retryRequestId?: string): Promise<void> {
    if (ttsBusyRef.current) return;
    const target = listTerminalMessages(saveRef.current.world, characterId).find((message) => message.id === messageId);
    const trimmed = target?.text?.trim() ?? '';
    if (!trimmed) { setFeedback({ tone: 'error', text: '语音文本不能为空。' }); return; }
    const config = resolveTtsProviderForCharacter(ttsConfigs, characterBindings, saveRef.current.meta.id, characterId, defaultTtsConfigId);
    if (!config || !config.enabled) { setFeedback({ tone: 'error', text: '请先在设置的“语音”中启用并保存语音 API，或为当前角色绑定可用配置。' }); return; }
    if (!target || target.senderId !== characterId || target.type !== 'text' || target.text !== trimmed) { setFeedback({ tone: 'error', text: '只能为角色发送的文字消息生成语音。' }); return; }
    const requestId = retryRequestId ?? `tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingRequest = { requestId, characterId, text: trimmed };
    const cacheFingerprint = speechCacheFingerprint(config, trimmed);
    const forceRegenerate = Boolean(storedAssetId(target.asset));
    ttsBusyRef.current = true; setTtsBusy(true); setFeedback(null);
    let generatedAssetId: string | undefined;
    let requestAttempted = false;
    try {
      if (!forceRegenerate) {
        const cached = await findVoiceAssetByFingerprint(cacheFingerprint);
        if (cached) {
          const next = structuredClone(saveRef.current);
          const latestTarget = listTerminalMessages(next.world, characterId).find((message) => message.id === messageId);
          if (!latestTarget || latestTarget.text?.trim() !== trimmed) throw new Error('消息已变化，语音未附加。');
          const message = attachTerminalVoiceToMessage(next.world, characterId, messageId, { kind: 'stored', assetId: cached.id }, cached.audioFormat ?? config.format, cached.durationMs ?? 0, cached.voiceRequestId ?? requestId);
          if (!message.ok) throw new Error(message.warning ?? '语音缓存附加失败。');
          commitSave(next);
          await refreshVoiceCacheStats();
          setFeedback({ tone: 'success', text: '已复用本地语音缓存，未调用 API。' });
          return;
        }
      }
      await persistTtsResult(config, 'requesting', undefined, pendingRequest);
      requestAttempted = true;
      const result = await synthesizeSpeech(config, trimmed);
      const durationMs = await measureAudioDurationMs(result.blob);
      const assetId = `terminal-voice-${requestId}`;
      await saveVoiceAsset({ id: assetId, blob: result.blob, mimeType: result.mimeType, category: 'voice', cacheFingerprint, audioFormat: result.format, durationMs, voiceRequestId: requestId, createdAt: now() });
      generatedAssetId = assetId;
      const next = structuredClone(saveRef.current);
      const latestTarget = listTerminalMessages(next.world, characterId).find((message) => message.id === messageId);
      if (!latestTarget || latestTarget.text?.trim() !== trimmed) throw new Error('消息已变化，语音未附加。');
      const previousAssetId = storedAssetId(latestTarget.asset);
      const message = attachTerminalVoiceToMessage(next.world, characterId, messageId, { kind: 'stored', assetId }, result.format, durationMs, requestId);
      if (!message.ok) throw new Error(message.warning ?? '语音消息保存失败。');
      commitSave(next);
      if (previousAssetId && previousAssetId !== assetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
      await persistTtsResult(config, 'success', undefined, null);
      await refreshVoiceCacheStats();
      setFeedback({ tone: 'success', text: message.changed ? '语音已附加到这条消息。' : '这条消息的语音没有变化。' });
    } catch (error) {
      const message = errorMessage(error, '语音生成失败，可手动重试。');
      if (generatedAssetId) await deleteVoiceAssetIfUnreferenced(generatedAssetId).catch(() => undefined);
      if (requestAttempted) await persistTtsResult(config, 'error', message, pendingRequest).catch(() => undefined);
      setFeedback({ tone: 'error', text: `${message} 可手动重试，重试不会重复插入已保存的语音。` });
    } finally { ttsBusyRef.current = false; setTtsBusy(false); }
  }

  function startTerminalCall(characterId: string): void {
    if (terminalCall) { setFeedback({ tone: 'info', text: '当前已有通话，请先结束。' }); return; }
    if (!isAcceptedFriend(saveRef.current.world, characterId)) { setFeedback({ tone: 'error', text: '只有已接受的好友可以通话。' }); return; }
    setTerminalCall({ id: `call-${characterId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, characterId, direction: 'outgoing', state: 'ringing', startedDay: saveRef.current.world.clock.day, startedSlotId: saveRef.current.world.clock.slotId });
  }

  function simulateIncomingTerminalCall(characterId: string): void {
    if (terminalCall) { setFeedback({ tone: 'info', text: '当前已有通话，请先结束。' }); return; }
    if (!isAcceptedFriend(saveRef.current.world, characterId)) { setFeedback({ tone: 'error', text: '只有已接受的好友可以来电。' }); return; }
    setTerminalCall({ id: `call-${characterId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, characterId, direction: 'incoming', state: 'ringing', startedDay: saveRef.current.world.clock.day, startedSlotId: saveRef.current.world.clock.slotId });
  }

  function answerTerminalCall(): void {
    if (!terminalCall || terminalCall.state !== 'ringing') return;
    setTerminalCall({ ...terminalCall, state: 'active' });
  }

  function simulateTerminalCallAnswer(): void {
    if (!terminalCall || terminalCall.direction !== 'outgoing' || terminalCall.state !== 'ringing') return;
    setTerminalCall({ ...terminalCall, state: 'active' });
  }

  function endTerminalCall(): void {
    const current = terminalCall;
    if (!current) return;
    const status: TerminalCallStatus = current.state === 'active' ? 'completed' : current.direction === 'incoming' ? 'missed' : 'cancelled';
    const next = structuredClone(saveRef.current);
    const result = recordTerminalCall(next.world, current.characterId, status, current.startedDay, current.startedSlotId, undefined, undefined, current.id);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '通话记录保存失败。' }); return; }
    if (result.changed) commitSave(next);
    setTerminalCall(null);
    setFeedback({ tone: 'success', text: status === 'completed' ? '通话已结束，记录已保存。' : status === 'missed' ? '已记录未接来电。' : '通话已取消。' });
  }

  async function importTerminalStickerFile(file?: File): Promise<void> {
    if (!file) return;
    try {
      const image = await downsampleImage(file, 900, 0.82);
      const assetId = `terminal-sticker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const record = await saveTerminalSticker({ id: assetId, asset: { kind: 'stored', assetId }, createdAt: now() });
      setTerminalStickers((items) => [...items.filter((item) => item.id !== record.id), record]);
      setFeedback({ tone: 'success', text: '贴图已加入图库。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '贴图导入失败') }); }
  }

  async function importTerminalStickerUrl(url: string): Promise<void> {
    const trimmed = url.trim();
    if (!/^https?:\/\/\S+$/i.test(trimmed)) { setFeedback({ tone: 'error', text: '贴图外链必须是有效的 http(s) 地址。' }); return; }
    try {
      const record = await saveTerminalSticker({ id: `terminal-sticker-url-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, asset: { kind: 'url', url: trimmed }, createdAt: now() });
      setTerminalStickers((items) => [...items, record]);
      setFeedback({ tone: 'success', text: '贴图外链已加入图库。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '贴图外链导入失败') }); }
  }

  async function removeTerminalSticker(record: TerminalStickerRecord): Promise<void> {
    await deleteTerminalSticker(record.id);
    setTerminalStickers((items) => items.filter((item) => item.id !== record.id));
    if (record.asset.kind !== 'stored') return;
    const assetId = record.asset.assetId;
    const stillInLibrary = (await listTerminalStickers()).some((item) => item.asset.kind === 'stored' && item.asset.assetId === assetId);
    const stillInMessages = Object.values(saveRef.current.world.terminal.messageThreads).some((thread) => thread.some((message) => message.asset?.kind === 'stored' && message.asset.assetId === assetId));
    if (!stillInLibrary && !stillInMessages) await deleteAsset(assetId);
  }

  function requestTerminalRejoin(characterId: string, requirement: string): void {
    const next = structuredClone(saveRef.current);
    const result = sendTerminalRejoinRequest(next.world, characterId, requirement);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '重回请求失败。' }); return; }
    commitSave(next);
  }

  async function generateTerminalReply(characterId: string): Promise<void> {
    if (terminalBusy) return;
    const current = saveRef.current;
    const character = current.world.characters[characterId] ?? current.world.npcs[characterId];
    if (!isAcceptedFriend(current.world, characterId) || !character) { setFeedback({ tone: 'error', text: '只有已接受的好友可以生成终端回复。' }); return; }
    const routedProvider = mockFixtureId ? createMockProviderConfig(mockFixtureId) : resolveProviderForCharacter(providers, bindings, characterBindings, current.meta.id, characterId, 'narrate_main', defaultProviderId);
    let parsed: ProviderConfig;
    try {
      if (!routedProvider) throw new Error('请先保存并设置默认 Provider，或在高级调试中启用 Mock fixture。');
      parsed = ProviderConfigSchema.parse(routedProvider);
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效。') }); return; }
    const prompt = buildTerminalReplyPrompt(current.world, characterId);
    setTerminalBusy(true); setFeedback(null);
    let raw = '';
    try {
      await streamChat(parsed, prompt, (delta) => { raw += delta; }, { taskId: 'narrate_main' });
      const reply = raw.includes('<ops>')
        ? await parseReply(raw)
        : { text: raw, ops: [], opsFailed: false, stage: 'strict' as const, warnings: [], raw };
      const next = structuredClone(saveRef.current);
      const result = sendTerminalReplyMessage(next.world, characterId, reply.text);
      if (!result.ok) throw new Error(result.warning ?? '终端回复保存失败。');
      const applied = reply.opsFailed ? undefined : terminalOpRegistry.applyAll(reply.ops, {
        world: next.world,
        actorId: characterId,
        day: next.world.clock.day,
        slotId: next.world.clock.slotId,
        nodeId: next.world.player.nodeId,
        log: () => undefined,
      }, 1);
      commitSave(next);
      void showGenerationCompleteNotification();
      if (reply.opsFailed) setFeedback({ tone: 'info', text: '回复已保存，但附带的转账提议格式无效，未创建待收款。' });
      else if (applied && (applied.rejected.length || applied.warnings.length || applied.truncated)) setFeedback({ tone: 'info', text: '回复已保存，但不符合白名单的终端操作已被拒绝。' });
      else if (applied?.applied) setFeedback({ tone: 'success', text: '回复已保存，并收到一项待确认转账。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '终端回复生成失败，可手动重试。') }); }
    finally { setTerminalBusy(false); }
  }

  function updateChatRecovery(record: ChatRecoveryRecord | null): void {
    chatRecoveryRef.current = record;
    setChatRecovery(record);
    if (record) void saveChatRecovery(record);
    else if (selectedCharacterId) void clearChatRecovery(selectedCharacterId);
  }

  function draftRecoveryRecord(characterId: string, draft: string, currentMessages: ChatMessage[]): ChatRecoveryRecord {
    return { characterId, requestId: `draft-${characterId}`, status: 'draft', input: draft, messages: currentMessages, baseMessages: currentMessages, assistantText: '', raw: '', opsApplied: false, updatedAt: now() };
  }

  function updateStorySceneReading(sceneId: string, stageId: string, mode: 'read' | 'select'): void {
    const next = structuredClone(saveRef.current);
    const result = mode === 'read'
      ? readStorySceneStage(next.world, sceneId, stageId)
      : selectStorySceneReadingStage(next.world, sceneId, stageId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '剧情阅读操作失败。' }); return; }
    commitSave(next);
  }

  function advanceStoryScene(sceneId: string): void {
    const next = structuredClone(saveRef.current);
    const result = advanceStorySceneStage(next.world, sceneId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 阶段推进失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `StoryScene 已推进到“${result.stage?.title ?? '下一阶段'}”。` });
  }

  function setStorySceneStatus(sceneId: string, status: 'completed' | 'cancelled'): void {
    const next = structuredClone(saveRef.current);
    const result = updateStorySceneStatus(next.world, sceneId, status);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 状态更新失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: status === 'completed' ? 'StoryScene 已标记为完成。' : 'StoryScene 已取消。' });
  }

  function createStorySceneDraftFromInput(input: StorySceneDraftInput): void {
    const next = structuredClone(saveRef.current);
    const result = createStorySceneDraft(next.world, next.config.calendar, input);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 草案创建失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `已保存 StoryScene 草案“${result.scene?.title ?? input.title}”，确认后才会启动。` });
  }

  async function saveStoryScenePresetCopy(source: StoryScenePreset, name: string): Promise<void> {
    const id = slug(name);
    if (!id || storyScenePresets.some((preset) => preset.id === id)) { setFeedback({ tone: 'error', text: '预设名称为空或 ID 已存在。' }); return; }
    const copy = copyStoryScenePreset(source, id, name);
    await saveStoryScenePreset(copy);
    setStoryScenePresets((items) => [...items.filter((preset) => preset.id !== copy.id), copy]);
    setFeedback({ tone: 'success', text: `已保存 StoryScene 预设“${copy.name}”。` });
  }

  async function updateStoryScenePreset(preset: StoryScenePreset): Promise<void> {
    if (preset.builtin) { setFeedback({ tone: 'error', text: '请先复制内置预设再编辑。' }); return; }
    const saved = await saveStoryScenePreset(preset);
    setStoryScenePresets((items) => items.map((item) => item.id === saved.id ? saved : item));
    setFeedback({ tone: 'success', text: `StoryScene 预设“${saved.name}”已更新。` });
  }

  async function removeStoryScenePreset(id: string): Promise<void> {
    const preset = storyScenePresets.find((item) => item.id === id);
    if (!preset || preset.builtin) { setFeedback({ tone: 'error', text: '内置预设不能删除。' }); return; }
    await deleteStoryScenePreset(id);
    setStoryScenePresets((items) => items.filter((item) => item.id !== id));
    setFeedback({ tone: 'success', text: 'StoryScene 预设已删除。' });
  }

  function confirmStorySceneDraft(sceneId: string): void {
    const next = structuredClone(saveRef.current);
    const result = confirmStoryScene(next.world, next.config.calendar, sceneId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 确认失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `StoryScene“${result.scene?.title ?? sceneId}”已确认启动。` });
  }

  function editStorySceneDraft(sceneId: string, input: StorySceneDraftInput): void {
    const next = structuredClone(saveRef.current);
    const result = updateStorySceneDraft(next.world, next.config.calendar, sceneId, input);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 草案编辑失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `StoryScene 草案“${result.scene?.title ?? sceneId}”已更新。` });
  }

  function removeStorySceneDraft(sceneId: string): void {
    const next = structuredClone(saveRef.current);
    const result = deleteStorySceneDraft(next.world, sceneId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? 'StoryScene 草案删除失败。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: 'StoryScene 草案已删除。' });
  }

  async function savePersonaDraft(): Promise<void> {
    const nameValue = personaName.trim();
    const displayValue = personaDisplayName.trim();
    if (!nameValue || !displayValue) { setFeedback({ tone: 'error', text: '面具名称和对话框称呼不能为空。' }); return; }
    const id = personaEditingId || slug(nameValue);
    const saved = await savePersona({ id, name: nameValue, displayName: displayValue, description: personaDescription.trim(), updatedAt: now() });
    setPersonas((items) => [...items.filter((item) => item.id !== id), saved]);
    setPersonaEditingId(''); setPersonaName(''); setPersonaDisplayName(''); setPersonaDescription('');
    setFeedback({ tone: 'success', text: '面具身份已保存。' });
  }

  function bindPersona(personaId: string): void {
    if (!personas.some((persona) => persona.id === personaId)) return;
    const next = structuredClone(saveRef.current);
    next.world.player.personaId = personaId;
    commitSave(next);
    setFeedback({ tone: 'success', text: '当前世界已绑定这个面具身份。' });
  }

  async function removePersona(personaId: string): Promise<void> {
    await deletePersona(personaId);
    setPersonas((items) => items.filter((item) => item.id !== personaId));
    if (saveRef.current.world.player.personaId === personaId) {
      const next = structuredClone(saveRef.current); delete next.world.player.personaId; commitSave(next);
    }
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

  async function ensureMorningBrief(day: number): Promise<void> {
    const current = saveRef.current;
    if (hasMorningBrief(current.world, day)) {
      const repaired = structuredClone(current);
      let changed = syncLeadHooks(repaired.world, repaired.world.morningBriefs.filter((entry) => entry.day === day)) > 0;
      const currentEntries = repaired.world.morningBriefs.filter((entry) => entry.day === day);
      const enrichedEntries = injectEconomyMorningAds(currentEntries, repaired.world, day);
      if (enrichedEntries.some((entry) => !currentEntries.some((existing) => existing.id === entry.id))) {
        repaired.world.morningBriefs = [...repaired.world.morningBriefs.filter((entry) => entry.day !== day), ...enrichedEntries].slice(-200);
        changed = true;
      }
      if (!hasMorningUpdate(repaired.world, day)) {
        const local = buildLocalMorningUpdate(repaired.world, day);
        repaired.world.morningUpdates.push({ day, weather: local.weather, npcMoves: local.npcMoves, ...(local.worldNote ? { worldNote: local.worldNote } : {}) });
        changed = true;
      }
      if (changed) commitSave(repaired);
      return;
    }
    let update = buildLocalMorningUpdate(current.world, day);
    const explicitRoute = bindings.some((binding) => binding.taskId === 'world_morning' || binding.taskId === 'npc_batch') || Boolean(mockFixtureId);
    if (explicitRoute) {
      const routed = mockFixtureId ? createMockProviderConfig(mockFixtureId) : resolveProviderForTaskGroup(providers, bindings, ['world_morning', 'npc_batch'], defaultProviderId);
      if (routed) {
        try {
          const parsed = ProviderConfigSchema.parse(routed);
          let raw = '';
          const previousDiary = current.world.diary.filter((entry) => entry.day < day).at(-1)?.text;
          await streamChat(parsed, buildMorningPrompt(current.world, day, previousDiary), (delta) => { raw += delta; }, { taskId: 'world_morning' });
          const generated = parseMorningUpdate(raw, day, current.world, current.config.calendar.slots.map((slot) => slot.id));
          if (generated) update = generated;
        } catch (error) { setFeedback({ tone: 'info', text: `晨报生成失败，已使用本地事实版：${errorMessage(error, '生成失败')}` }); }
      }
    }
    const next = structuredClone(saveRef.current);
    if (hasMorningBrief(next.world, day)) return;
    update = { ...update, entries: injectEconomyMorningAds(update.entries, next.world, day) };
    next.world.morningBriefs = [...next.world.morningBriefs.filter((entry) => entry.day !== day), ...update.entries].slice(-200);
    next.world.morningUpdates = [...next.world.morningUpdates.filter((entry) => entry.day !== day), { day, weather: update.weather, npcMoves: update.npcMoves, ...(update.worldNote ? { worldNote: update.worldNote } : {}) }].slice(-200);
    applyMorningNpcMoves(next.world, day, update.npcMoves);
    syncLeadHooks(next.world, update.entries);
    commitSave(next);
  }

  function runDayAction(kind: string): void {
    const next = structuredClone(saveRef.current);
    const energyOp = kind === 'rest' ? { op: 'restore_energy' } : { op: 'spend_energy', kind };
    const energyApplied = lifeOpRegistry.applyAll([energyOp], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      actionCosts: next.config.actionCosts,
      log: () => undefined,
    }, 1);
    if (energyApplied.applied !== 1) {
      setFeedback({ tone: 'error', text: energyApplied.rejected[0]?.reason ?? energyApplied.warnings[0] ?? '无法结算本次行动的体力。' });
      return;
    }
    const result = advanceAction(next.world, next.config.calendar, next.config.actionCosts, kind, promptEvents);
    commitSave(next);
    if (result.settledDays.length) void ensureMorningBrief(next.world.clock.day);
    if (result.settledDays.length) {
      setTab('day');
      setFeedback({ tone: 'success', text: `第 ${result.settledDays.at(-1)} 天已结算，已进入下一天。` });
      return;
    }
    setFeedback({ tone: 'info', text: result.advanced ? `行动完成，消耗 ${result.advanced} 个时段。` : '当前模式不消耗时段。' });
  }

  function acceptRental(nodeId: string, rentRuleId = 'standard'): void {
    const next = structuredClone(saveRef.current);
    const logs: string[] = [];
    const applied = lifeOpRegistry.applyAll([{ op: 'accept_rental', nodeId, rentRuleId }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      log: (message) => logs.push(message),
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? logs[0] ?? '无法签订租约。' });
      return;
    }
    commitSave(next);
    setFeedback({ tone: 'success', text: `已入住${next.world.map.nodes[nodeId]?.name ?? nodeId}；租金将在到期日由本地结算规则处理。` });
  }

  function requestHousingUpgrade(upgradeRuleId: string): void {
    const next = structuredClone(saveRef.current);
    const applied = lifeOpRegistry.applyAll([{ op: 'request_housing_upgrade', upgradeRuleId }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      log: () => undefined,
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '当前无法安排住所升级。' });
      return;
    }
    commitSave(next);
    const offer = getHousingUpgradeOffer(next.world, upgradeRuleId);
    setFeedback({ tone: 'success', text: `已安排${offer?.rule.name ?? '住所升级'}；费用与等级变化会在今天结算时由本地规则确认。` });
  }

  function acceptJob(nodeId: string, jobRuleId = 'standard'): void {
    const next = structuredClone(saveRef.current);
    const applied = lifeOpRegistry.applyAll([{ op: 'accept_job', nodeId, jobRuleId }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      calendar: next.config.calendar,
      actionCosts: next.config.actionCosts,
      log: () => undefined,
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '无法接受这份工作。' });
      return;
    }
    commitSave(next);
    const job = next.world.player.job;
    const rule = job ? next.world.economy.jobRules[job.jobRuleId] : undefined;
    setFeedback({ tone: 'success', text: `已接受${rule?.name ?? '这份工作'}；请在班次开始时到达工作地点。` });
  }

  function workJob(): void {
    const next = structuredClone(saveRef.current);
    const applied = lifeOpRegistry.applyAll([{ op: 'spend_energy', kind: 'work' }, { op: 'work_job' }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      calendar: next.config.calendar,
      actionCosts: next.config.actionCosts,
      events: promptEvents,
      log: () => undefined,
    }, 2);
    if (applied.applied !== 2) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '当前无法开始班次。' });
      return;
    }
    const result = advanceAction(next.world, next.config.calendar, next.config.actionCosts, 'work', promptEvents);
    commitSave(next);
    if (result.settledDays.length) void ensureMorningBrief(next.world.clock.day);
    if (result.settledDays.length) {
      setTab('day');
      setFeedback({ tone: 'success', text: `班次完成，第 ${result.settledDays.at(-1)} 天已结算，工资已按本地规则入账。` });
      return;
    }
    setFeedback({ tone: 'success', text: next.config.calendar.unlimitedSlots ? '班次已完成；当前沙盒模式不消耗时段，工资会在今天结算时入账。' : `班次已完成，消耗 ${result.advanced} 个时段；工资会在今天结算时入账。` });
  }

  function acceptShop(nodeId: string, shopRuleId = 'standard'): void {
    const next = structuredClone(saveRef.current);
    const applied = lifeOpRegistry.applyAll([{ op: 'accept_shop', nodeId, shopRuleId }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      calendar: next.config.calendar,
      actionCosts: next.config.actionCosts,
      log: () => undefined,
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '无法接手这间店铺。' });
      return;
    }
    commitSave(next);
    const shop = next.world.player.shop;
    const rule = shop ? next.world.economy.shopRules[shop.shopRuleId] : undefined;
    setFeedback({ tone: 'success', text: `已接手${rule?.name ?? '这间店铺'}；请在营业时段到达店铺开始营业。` });
  }

  function operateShop(): void {
    const next = structuredClone(saveRef.current);
    const encounterCountBefore = next.world.encounterLog.length;
    const applied = lifeOpRegistry.applyAll([{ op: 'spend_energy', kind: 'operate_shop' }, { op: 'operate_shop' }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      calendar: next.config.calendar,
      actionCosts: next.config.actionCosts,
      encounterConfig: next.config.encounter,
      events: promptEvents,
      log: () => undefined,
    }, 2);
    if (applied.applied !== 2) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '当前无法开始营业。' });
      return;
    }
    const visitEntry = next.world.encounterLog.slice(encounterCountBefore).find((entry) => entry.trigger === 'shop_visit');
    const visitCandidates: EncounterCandidate[] = visitEntry
      ? visitEntry.characterIds.flatMap((characterId) => {
        const person = whoIsHere(next.world, visitEntry.nodeId, visitEntry.day, visitEntry.slotId, next.config.calendar.daysPerWeek).find((candidate) => candidate.id === characterId);
        return person ? [{ ...person, weight: 1, daysSinceLastEncounter: 0, homeDistance: null }] : [];
      })
      : [];
    const result = advanceAction(next.world, next.config.calendar, next.config.actionCosts, 'operate_shop', promptEvents);
    commitSave(next);
    if (result.settledDays.length) void ensureMorningBrief(next.world.clock.day);
    if (visitEntry && visitCandidates.length) {
      setActiveEncounter({ entryId: visitEntry.id, nodeId: visitEntry.nodeId, scope: visitEntry.scope, candidates: visitCandidates });
      setEncounterParticipantIds(visitCandidates.filter((candidate) => candidate.tier === 'formal' && characters.some((character) => character.id === candidate.id)).map((candidate) => candidate.id));
      setTab('map');
    }
    const visitorNames = visitCandidates.map((candidate) => candidate.name).join('、');
    const timeText = next.config.calendar.unlimitedSlots ? '当前沙盒模式不消耗时段' : `消耗 ${result.advanced} 个时段`;
    const settlementText = result.settledDays.length ? `，第 ${result.settledDays.at(-1)} 天已结算` : '';
    setFeedback({ tone: 'success', text: `营业完成，${timeText}${settlementText}${visitorNames ? `；${visitorNames}在营业期间来到了店里。` : '；本次营业没有已排程的访客。'}` });
  }

  function sleepEarly(): void {
    const next = structuredClone(saveRef.current);
    const settlement = endDay(next.world, next.config.calendar, promptEvents);
    commitSave(next);
    void ensureMorningBrief(next.world.clock.day);
    setTab('day');
      setFeedback({ tone: 'success', text: `第 ${settlement.day} 天已结算，世界已推进到下一天。` });
  }

  function revealEvent(scheduledId: string): void {
    const next = structuredClone(saveRef.current);
    const result = setScheduledEventRevealed(next.world, scheduledId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法公开这个事件。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '事件线索已加入日历。' });
  }

  function exportEventHistory(): void {
    const history = saveRef.current.world.eventHistory ?? [];
    if (history.length === 0) { setFeedback({ tone: 'info', text: '当前没有可导出的事件回顾。' }); return; }
    const blob = new Blob([formatEventHistoryArchive(saveRef.current)], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tokimeki-event-archive.md'; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: `已导出 ${history.length} 条可阅读事件档案。` });
  }

  async function exportChatArchive(): Promise<void> {
    if (!selectedCharacterId || messages.length === 0) { setFeedback({ tone: 'info', text: '当前没有可导出的聊天记录。' }); return; }
    await saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
    const characterName = saveRef.current.world.characters[selectedCharacterId]?.name ?? characters.find((item) => item.id === selectedCharacterId)?.name ?? selectedCharacterId;
    const archive = formatChatArchive({ title: `${characterName}的对话`, playerLabel: activePersona?.displayName ?? saveRef.current.world.player.name, characterName, messages });
    const blob = new Blob([archive], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `tokimeki-chat-${slug(characterName)}.md`; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: `已导出 ${messages.length} 条原始聊天记录。` });
  }

  function deleteEventHistory(id?: string): void {
    const history = saveRef.current.world.eventHistory ?? [];
    if (history.length === 0) return;
    const target = id ? history.find((entry) => entry.id === id) : undefined;
    const prompt = target ? `确定删除“${target.title}”的事件回顾吗？世界事实不会回滚。` : '确定删除全部事件回顾吗？世界事实不会回滚。';
    if (!window.confirm(prompt)) return;
    const next = structuredClone(saveRef.current);
    next.world.eventHistory = id ? history.filter((entry) => entry.id !== id) : [];
    commitSave(next);
    setFeedback({ tone: 'success', text: id ? '事件回顾已删除；世界事实未回滚。' : '全部事件回顾已删除；世界事实未回滚。' });
  }

  function resolveChoice(historyId: string, choiceId: string): void {
    const next = structuredClone(saveRef.current);
    const result = resolveEventChoice(next.world, historyId, choiceId);
    if (!result.ok || !result.history) { setFeedback({ tone: 'error', text: result.warning ?? '无法记录事件选择。' }); return; }
    const applied = opRegistry.applyAll(result.ops, {
      world: next.world, day: result.history.day, slotId: result.history.slotId, nodeId: result.history.nodeId,
      calendar: next.config.calendar, actionCosts: next.config.actionCosts, encounterConfig: next.config.encounter, events: promptEvents, log: () => {},
    }, next.config.opsLimitPerTurn);
    commitSave(next);
    if (applied.changes.length) promptEvents.emit('onOpsApply', { changes: applied.changes });
    setFeedback({ tone: applied.rejected.length ? 'info' : 'success', text: applied.rejected.length ? `已记录选择，但有 ${applied.rejected.length} 个结果操作被拒绝。` : '事件选择已记录，结果已写入世界。' });
  }

  function moveToNode(nodeId: string): boolean {
    const next = structuredClone(saveRef.current);
    const energyKind = movementEnergyKind(next.world, nodeId);
    if (energyKind) {
      const energyApplied = lifeOpRegistry.applyAll([{ op: 'spend_energy', kind: energyKind }], {
        world: next.world,
        day: next.world.clock.day,
        slotId: next.world.clock.slotId,
        nodeId: next.world.player.nodeId,
        actionCosts: next.config.actionCosts,
        log: () => undefined,
      }, 1);
      if (energyApplied.applied !== 1) {
        setFeedback({ tone: 'error', text: energyApplied.rejected[0]?.reason ?? energyApplied.warnings[0] ?? '体力不足，无法移动。' });
        return false;
      }
    }
    const result = movePlayer(next.world, next.config.calendar, nodeId, promptEvents);
    if (!result.ok) {
      setFeedback({ tone: 'error', text: result.warning ?? '无法前往该地点。' });
      return false;
    }
    const destination = next.world.map.nodes[nodeId];
    const matchedHooks = findMatchingHooks(next.world, nodeId, next.world.clock.slotId);
    matchedHooks.forEach(({ hook }) => { triggerHook(next.world, hook.id); });
    scheduleDirectorEvent(next.world, { nodeId, day: next.world.clock.day, slotId: next.world.clock.slotId, stageRules: next.config.stageRules });
    const localEvents = (next.world.director?.scheduled ?? [])
      .filter((scheduled) => scheduled.nodeId === nodeId && scheduled.day === next.world.clock.day && scheduled.slotId === next.world.clock.slotId)
      .map((scheduled) => triggerScheduledEvent(next.world, scheduled.id, { stageRules: next.config.stageRules }))
      .filter((result) => result.ok && result.event);
    const encounter = triggerEncounter(next.world, next.config.encounter, { nodeId, trigger: 'enter', daysPerWeek: next.config.calendar.daysPerWeek, events: promptEvents });
    commitSave(next);
    setActiveEncounter(encounter.triggered && encounter.entry ? { entryId: encounter.entry.id, nodeId, scope: encounter.entry.scope, candidates: encounter.candidates } : null);
    setEncounterParticipantIds(encounter.triggered ? encounter.candidates.filter((candidate) => candidate.tier === 'formal' && characters.some((character) => character.id === candidate.id)).map((candidate) => candidate.id) : []);
    const moveEnergyCost = energyKind ? energyCostForAction(saveRef.current.world, saveRef.current.config.actionCosts, energyKind) : 0;
    const arrival = result.cost > 0 ? `已抵达${destination?.name ?? nodeId}，消耗 ${result.cost} 个时段${moveEnergyCost ? `、${moveEnergyCost} 点体力` : ''}。` : `已抵达${destination?.name ?? nodeId}${moveEnergyCost ? `，消耗 ${moveEnergyCost} 点体力` : ''}。`;
    const names = encounter.candidates.map((candidate) => candidate.name).join('、');
    const hookText = matchedHooks.length ? ` 晨报线索「${matchedHooks.map(({ hook }) => hook.title).join('、')}」在这里触发了。` : '';
    const eventText = localEvents.length ? ` 事件「${localEvents.map((result) => result.event?.title).join('、')}」已触发${localEvents.some((result) => result.content) ? `：${localEvents.map((result) => result.content).filter(Boolean).join(' ')}` : '。'}` : '';
    setFeedback({ tone: 'success', text: `${encounter.triggered ? `${arrival} 遇见了${names}。` : arrival}${hookText}${eventText}` });
    return true;
  }

  function chooseEncounterOutcome(outcome: 'continued' | 'urgent_leave'): void {
    if (!activeEncounter) return;
    const next = structuredClone(saveRef.current);
    const result = updateEncounterOutcome(next.world, activeEncounter.entryId, outcome);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法记录相遇结果。' }); return; }
    commitSave(next);
    setActiveEncounter(null);
    setEncounterParticipantIds([]);
    writeEncounterChatSession(null);
    setChatEncounterEntryId('');
    setFeedback({ tone: 'info', text: outcome === 'continued' ? '你决定留下继续这次相遇。' : '你选择离开了。' });
  }

  async function importMapBackground(file?: File): Promise<void> {
    if (!file) return;
    try {
      const image = await downsampleImage(file);
      const assetId = `map-background-${Date.now()}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const previousAssetId = storedAssetId(saveRef.current.world.map.view.background);
      const next = structuredClone(saveRef.current);
      next.world.map.view = { mode: 'hotspot', background: { kind: 'stored', assetId }, size: { w: image.width, h: image.height } };
      commitSave(next);
      if (previousAssetId && previousAssetId !== assetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: `底图已保存（${image.width}×${image.height}，WebP）。` });
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '底图导入失败。') });
    }
  }

  async function setMapBackgroundUrl(input: string): Promise<void> {
    try {
      const background = externalImageAssetRef(input);
      const previousAssetId = storedAssetId(saveRef.current.world.map.view.background);
      const next = structuredClone(saveRef.current);
      next.world.map.view = { ...next.world.map.view, mode: 'hotspot', background };
      commitSave(next);
      if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: '地图底图外链已保存；显示时由浏览器直接加载，未下载到本地。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '地图底图外链无效。') }); }
  }

  async function importSceneBackground(nodeId: string, file?: File): Promise<void> {
    if (!file) return;
    try {
      const node = saveRef.current.world.map.nodes[nodeId];
      if (!node) throw new Error('地点不存在。');
      const image = await downsampleImage(file);
      const assetId = `scene-background-${nodeId}-${Date.now()}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const previousAssetId = storedAssetId(node.sceneBackground);
      const next = structuredClone(saveRef.current);
      next.world.map.nodes[nodeId].sceneBackground = { kind: 'stored', assetId };
      commitSave(next);
      if (previousAssetId && previousAssetId !== assetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: `“${node.name}”的场景背景已保存（${image.width}×${image.height}，WebP）。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '场景背景导入失败。') }); }
  }

  async function setSceneBackgroundUrl(nodeId: string, input: string): Promise<void> {
    try {
      const node = saveRef.current.world.map.nodes[nodeId];
      if (!node) throw new Error('地点不存在。');
      const sceneBackground = externalImageAssetRef(input);
      const previousAssetId = storedAssetId(node.sceneBackground);
      const next = structuredClone(saveRef.current);
      next.world.map.nodes[nodeId].sceneBackground = sceneBackground;
      commitSave(next);
      if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: `“${node.name}”的场景背景外链已保存；未下载到本地。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '场景背景外链无效。') }); }
  }

  async function importCharacterVisual(characterId: string, kind: 'avatar' | 'portrait', file?: File | string): Promise<void> {
    if (typeof file === 'string') return setCharacterVisualUrl(characterId, kind, file);
    if (!file) return;
    try {
      const character = saveRef.current.world.characters[characterId];
      if (!character) throw new Error('当前世界中没有这个角色。');
      const image = await downsampleImage(file);
      const assetId = `character-${kind}-${characterId}-${Date.now()}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const next = structuredClone(saveRef.current);
      const visuals = next.world.characters[characterId].visuals;
      const previousRefs = kind === 'avatar' ? (visuals.avatar ? [visuals.avatar] : []) : visuals.portraits.map((portrait) => portrait.image);
      if (kind === 'avatar') visuals.avatar = { kind: 'stored', assetId };
      else {
        const portraitId = visuals.portraits[0]?.id ?? `portrait-${characterId}`;
        const transform = visuals.portraits[0]?.transform;
        visuals.portraits = [{ id: portraitId, name: '立绘', image: { kind: 'stored', assetId }, ...(transform ? { transform } : {}) }];
        visuals.activePortraitId = portraitId;
      }
      commitSave(next);
      const retainedAssetIds = new Set([visuals.avatar, ...visuals.portraits.map((portrait) => portrait.image)].filter((reference): reference is Extract<AssetRef, { kind: 'stored' }> => reference?.kind === 'stored').map((reference) => reference.assetId));
      for (const reference of previousRefs) if (reference.kind === 'stored' && reference.assetId !== assetId && !retainedAssetIds.has(reference.assetId)) await deleteImageAssetIfUnreferenced(reference.assetId);
      setFeedback({ tone: 'success', text: `${character.name}的${kind === 'avatar' ? '头像' : '立绘'}已保存（${image.width}×${image.height}，WebP）。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '角色视觉资产导入失败。') }); }
  }

  async function setCharacterVisualUrl(characterId: string, kind: 'avatar' | 'portrait', input: string): Promise<void> {
    try {
      const character = saveRef.current.world.characters[characterId];
      if (!character) throw new Error('当前世界中没有这个角色。');
      const reference = externalImageAssetRef(input);
      const next = structuredClone(saveRef.current);
      const visuals = next.world.characters[characterId].visuals;
      const previousRefs = kind === 'avatar' ? (visuals.avatar ? [visuals.avatar] : []) : visuals.portraits.map((portrait) => portrait.image);
      if (kind === 'avatar') visuals.avatar = reference;
      else {
        const portraitId = visuals.portraits[0]?.id ?? `portrait-${characterId}`;
        const transform = visuals.portraits[0]?.transform;
        visuals.portraits = [{ id: portraitId, name: '立绘', image: reference, ...(transform ? { transform } : {}) }];
        visuals.activePortraitId = portraitId;
      }
      commitSave(next);
      const retainedAssetIds = new Set([visuals.avatar, ...visuals.portraits.map((portrait) => portrait.image)].filter((item): item is Extract<AssetRef, { kind: 'stored' }> => item?.kind === 'stored').map((item) => item.assetId));
      for (const previous of previousRefs) if (previous.kind === 'stored' && !retainedAssetIds.has(previous.assetId)) await deleteImageAssetIfUnreferenced(previous.assetId);
      setFeedback({ tone: 'success', text: `${character.name}的${kind === 'avatar' ? '头像' : '立绘'}外链已保存；未下载到本地。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '角色视觉外链无效。') }); }
  }

  async function removeCharacterVisual(characterId: string, kind: 'avatar' | 'portrait'): Promise<void> {
    const character = saveRef.current.world.characters[characterId];
    if (!character) return;
    const next = structuredClone(saveRef.current);
    const visuals = next.world.characters[characterId].visuals;
    const references = kind === 'avatar' ? (visuals.avatar ? [visuals.avatar] : []) : visuals.portraits.map((portrait) => portrait.image);
    if (kind === 'avatar') delete visuals.avatar;
    else {
      visuals.portraits = [];
      delete visuals.activePortraitId;
    }
    commitSave(next);
    const retainedAssetIds = new Set([visuals.avatar, ...visuals.portraits.map((portrait) => portrait.image)].filter((reference): reference is Extract<AssetRef, { kind: 'stored' }> => reference?.kind === 'stored').map((reference) => reference.assetId));
    for (const reference of references) if (reference.kind === 'stored' && !retainedAssetIds.has(reference.assetId)) await deleteImageAssetIfUnreferenced(reference.assetId);
    setFeedback({ tone: 'success', text: `已移除${character.name}的${kind === 'avatar' ? '头像' : '立绘'}。` });
  }

  function updateCharacterAccentColor(characterId: string, color?: string): void {
    const character = saveRef.current.world.characters[characterId];
    if (!character) return;
    const next = structuredClone(saveRef.current);
    if (color) next.world.characters[characterId].visuals.accentColor = color;
    else delete next.world.characters[characterId].visuals.accentColor;
    commitSave(next);
    setFeedback({ tone: 'success', text: color ? `${character.name}的角色颜色已更新。` : `${character.name}已恢复默认角色颜色。` });
  }

  async function removeSceneBackground(nodeId: string): Promise<void> {
    const node = saveRef.current.world.map.nodes[nodeId];
    const reference = node?.sceneBackground;
    if (!node || !reference) return;
    const next = structuredClone(saveRef.current);
    delete next.world.map.nodes[nodeId].sceneBackground;
    commitSave(next);
    if (reference.kind === 'stored') await deleteImageAssetIfUnreferenced(reference.assetId);
    setFeedback({ tone: 'success', text: `已移除“${node.name}”的场景背景。` });
  }

  function toggleMapMode(): void {
    const next = structuredClone(saveRef.current);
    next.world.map.view.mode = next.world.map.view.mode === 'graph' ? 'hotspot' : 'graph';
    commitSave(next);
  }

  function addMapNode(input: CreateMapNodeInput): boolean {
    const next = structuredClone(saveRef.current);
    const result = createMapNode(next.world.map, input);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法创建地点。' }); return false; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `已创建地点：${next.world.map.nodes[result.nodeId!]?.name ?? result.nodeId}。` });
    return true;
  }

  function editMapNode(nodeId: string, input: UpdateMapNodeInput): boolean {
    const next = structuredClone(saveRef.current);
    const result = updateMapNode(next.world.map, nodeId, input);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法更新地点。' }); return false; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `地点已更新：${next.world.map.nodes[nodeId]?.name ?? nodeId}。` });
    return true;
  }

  function removeMapNode(nodeId: string): boolean {
    const node = saveRef.current.world.map.nodes[nodeId];
    if (!node) return false;
    if (saveRef.current.world.player.homeNodeId === nodeId || saveRef.current.world.player.housing?.nodeId === nodeId) {
      setFeedback({ tone: 'error', text: '当前住所不能删除；退租或迁居流程将在后续住所切片提供。' });
      return false;
    }
    if (saveRef.current.world.player.job?.nodeId === nodeId) {
      setFeedback({ tone: 'error', text: '当前工作地点不能删除；离职或转岗流程不在本切片中。' });
      return false;
    }
    if (!window.confirm(`确定删除地点“${node.name}”及其相关路线吗？`)) return false;
    const next = structuredClone(saveRef.current);
    const result = deleteMapNode(next.world.map, nodeId, next.world.player.nodeId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法删除地点。' }); return false; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `已删除地点：${node.name}。` });
    return true;
  }

  async function generateMap(requirements = ''): Promise<void> {
    const existingNodeCount = Object.keys(saveRef.current.world.map.nodes).length;
    if (existingNodeCount > 1 && !window.confirm(`当前地图已有 ${existingNodeCount} 个地点。AI 生成会完整替换当前地图，建议先导出存档。确定继续吗？`)) return;
    const mapProvider = resolveProviderForTask(providers, bindings, 'map_gen', defaultProviderId);
    if (!mapProvider) { setFeedback({ tone: 'error', text: '请先在设置中配置 map_gen Provider。' }); return; }
    setMapGenerating(true);
    let generated = '';
    try {
      const parsedProvider = ProviderConfigSchema.parse(mapProvider);
      await streamChat(parsedProvider, [
        { role: 'system', content: '生成一张开放世界图结构地图。只返回 JSON，不要 Markdown。必须包含 8–15 个 nodes、至少一条连通路径的 edges；每个 node 需要 id、name、regionId、kind、pos，edges 需要 from、to、travelSlots。' },
        { role: 'user', content: JSON.stringify({ mode: 'replace', requirements: requirements.trim(), currentNodeId: saveRef.current.world.player.nodeId, slots: saveRef.current.config.calendar.slots.map((slot) => slot.id), currentMap: saveRef.current.world.map }) },
      ], (delta) => { generated += delta; }, { taskId: 'map_gen' });
      const map = parseGeneratedMap(generated, saveRef.current.world.player.nodeId);
      const housingNodeId = saveRef.current.world.player.housing?.nodeId;
      if (housingNodeId && !map.nodes[housingNodeId]) throw new Error('新地图没有保留当前住所，已拒绝覆盖。');
      const jobNodeId = saveRef.current.world.player.job?.nodeId;
      if (jobNodeId && !map.nodes[jobNodeId]) throw new Error('新地图没有保留当前工作地点，已拒绝覆盖。');
      const next = structuredClone(saveRef.current); next.world.map = map; commitSave(next);
      setFeedback({ tone: 'success', text: `地图生成成功：${Object.keys(map.nodes).length} 个地点。` });
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '地图生成失败。') });
    } finally { setMapGenerating(false); }
  }

  async function expandMap(anchorNodeId: string, count: number, requirements = ''): Promise<void> {
    const mapProvider = resolveProviderForTask(providers, bindings, 'map_gen', defaultProviderId);
    if (!mapProvider) { setFeedback({ tone: 'error', text: '请先在设置中配置 map_gen Provider。' }); return; }
    setMapGenerating(true);
    let generated = '';
    try {
      const parsedProvider = ProviderConfigSchema.parse(mapProvider);
      await streamChat(parsedProvider, [
        { role: 'system', content: '扩展现有开放世界地图。只返回 JSON，不要 Markdown。生成指定数量的新 nodes，并用 edges 将每个新地点连接到指定锚点或已生成的新地点；不要修改已有地点。' },
        { role: 'user', content: JSON.stringify({ mode: 'expand', anchorNodeId, count, requirements: requirements.trim(), currentMap: saveRef.current.world.map }) },
      ], (delta) => { generated += delta; }, { taskId: 'map_gen' });
      const map = parseGeneratedMapExpansion(generated, saveRef.current.world.map, anchorNodeId, count);
      const next = structuredClone(saveRef.current); next.world.map = map; commitSave(next);
      setFeedback({ tone: 'success', text: `地图扩展成功：新增 ${count} 个地点。` });
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '地图扩展失败。') });
    } finally { setMapGenerating(false); }
  }

  async function suggestMapNode(input: { requirements: string; regionName: string; anchorName: string }): Promise<{ name: string; description: string } | null> {
    const mapProvider = resolveProviderForTask(providers, bindings, 'map_gen', defaultProviderId);
    if (!mapProvider) { setFeedback({ tone: 'error', text: '请先在设置中配置 map_gen Provider。' }); return null; }
    setMapGenerating(true);
    let generated = '';
    try {
      const parsedProvider = ProviderConfigSchema.parse(mapProvider);
      await streamChat(parsedProvider, [
        { role: 'system', content: '为开放世界地图中的一个新地点创作名称和简短描述。只返回 JSON：{"name":"地点名","description":"描述"}。不要输出坐标、状态或其他字段。' },
        { role: 'user', content: JSON.stringify(input) },
      ], (delta) => { generated += delta; }, { taskId: 'map_gen' });
      const suggestion = parseGeneratedNodeSuggestion(generated);
      setFeedback({ tone: 'success', text: 'AI 已填写地点名称与描述，请确认后再保存。' });
      return suggestion;
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '地点名称与描述生成失败。') });
      return null;
    } finally { setMapGenerating(false); }
  }

  async function restoreSnapshot(id: string): Promise<void> {
    const snapshot = await loadSnapshot(id);
    if (!snapshot) { setFeedback({ tone: 'error', text: '找不到这个本地快照。' }); return; }
    if (!window.confirm(`确定回到第 ${snapshot.day} 天的快照吗？当前世界进度将被替换。`)) return;
    pendingDiaryDaysRef.current = [];
    commitSave(snapshot.save);
    setFeedback({ tone: 'success', text: `已回到第 ${snapshot.day} 天的本地快照。` });
  }

  function saveDiaryEdit(day: number, text: string): void {
    if (!text.trim()) { setFeedback({ tone: 'error', text: '日记内容不能为空。' }); return; }
    const next = structuredClone(saveRef.current);
    if (!updateDiaryEntry(next.world, day, text.trim(), now())) return;
    commitSave(next);
    setFeedback({ tone: 'success', text: `第 ${day} 天日记已保存。` });
  }

  function deleteMemory(charId: string, memoryId: string): void {
    const next = structuredClone(saveRef.current);
    const result = setRelationshipMemoryArchived(next.world, charId, memoryId, true);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法删除记忆。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '这条记忆已归档，之后不会再注入角色上下文。' });
  }

  function editMemory(charId: string, memoryId: string, patch: { text?: string; type?: string; importance?: string }): void {
    const next = structuredClone(saveRef.current);
    const result = updateRelationshipMemory(next.world, charId, memoryId, patch);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法编辑记忆。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '记忆已保存。' });
  }

  function restoreMemory(charId: string, memoryId: string): void {
    const next = structuredClone(saveRef.current);
    const result = setRelationshipMemoryArchived(next.world, charId, memoryId, false);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法恢复记忆。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '记忆已恢复。' });
  }

  function toggleMemoryInjection(charId: string, memoryId: string, inject: boolean): void {
    const next = structuredClone(saveRef.current);
    const result = setRelationshipMemoryInject(next.world, charId, memoryId, inject);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法更新记忆注入开关。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: inject ? '这条记忆会继续注入角色上下文。' : '这条记忆已停止注入角色上下文。' });
  }

  function permanentlyDeleteMemory(charId: string, memoryId: string): void {
    if (!window.confirm('永久删除这条记忆？该操作不会回滚关系、物品、事件或聊天事实。')) return;
    const next = structuredClone(saveRef.current);
    const result = deleteRelationshipMemory(next.world, charId, memoryId);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法删除记忆。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: '这条记忆已永久删除。' });
  }

  function updateCollectionEntry(id: string, title: string, description: string): void {
    const next = structuredClone(saveRef.current);
    const entry = next.world.collection.find((item) => item.id === id);
    if (!entry) { setFeedback({ tone: 'error', text: '找不到这条收藏条目。' }); return; }
    const nextTitle = title.trim();
    if (!nextTitle) { setFeedback({ tone: 'error', text: '收藏标题不能为空。' }); return; }
    entry.title = nextTitle;
    entry.description = description.trim();
    commitSave(next);
    setFeedback({ tone: 'success', text: '收藏条目已保存。' });
  }

  function deleteCollectionEntry(id: string): void {
    const next = structuredClone(saveRef.current);
    const index = next.world.collection.findIndex((item) => item.id === id);
    if (index < 0) { setFeedback({ tone: 'error', text: '找不到这条收藏条目。' }); return; }
    next.world.collection.splice(index, 1);
    commitSave(next);
    setFeedback({ tone: 'success', text: '收藏条目已删除。' });
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

  function setShowNumbers(showNumbers: boolean): void {
    const next = structuredClone(saveRef.current);
    next.config.showNumbers = showNumbers;
    commitSave(next);
    setFeedback({ tone: 'success', text: showNumbers ? '结算页将显示关系数值明细。' : '结算页将只显示关系变化散文。' });
  }

  function setEnergyEnabled(enabled: boolean): void {
    const next = structuredClone(saveRef.current);
    const applied = lifeOpRegistry.applyAll([{ op: 'set_energy_enabled', enabled }], {
      world: next.world,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      log: () => undefined,
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? '无法更新体力设置。' });
      return;
    }
    commitSave(next);
    setFeedback({ tone: 'success', text: enabled ? '体力限制已开启；行动会按成本表扣除体力。' : '体力限制已关闭；当前体力数值会保留。' });
  }

  function setMorningStyle(morningStyle: SaveFile['config']['morningStyle']): void {
    const next = structuredClone(saveRef.current);
    next.config.morningStyle = morningStyle;
    commitSave(next);
    setFeedback({ tone: 'success', text: '晨报换皮已更新。' });
  }

  function runDevTool(kind: 'seed' | 'days' | 'lead' | 'topic' | 'encounter'): void {
    const seed = Number.isFinite(Number(devToolSeed)) ? Math.floor(Number(devToolSeed)) : 42;
    const days = Math.max(1, Number.isFinite(Number(devToolDays)) ? Math.floor(Number(devToolDays)) : 30);
    const current = saveRef.current;
    if (kind === 'seed') {
      const seeded = seedScenario(createCurrentSaveScenario({ id: `dev-seed-${seed}`, title: '无头调参台测试场景', day: current.world.clock.day, slotId: current.world.clock.slotId, timestamp: '2000-01-01T00:00:00.000Z' }));
      setDevToolReport({ title: '播种器结果', body: JSON.stringify({ schemaVersion: seeded.schemaVersion, day: seeded.world.clock.day, slotId: seeded.world.clock.slotId, nodeCount: Object.keys(seeded.world.map.nodes).length, characterCount: Object.keys(seeded.world.characters).length, npcCount: Object.keys(seeded.world.npcs).length, seed }, null, 2) });
      return;
    }
    if (kind === 'days') {
      setDevToolReport({ title: '多日无头推进结果', body: JSON.stringify(simulateDays(current.world, current.config.calendar, days, seed), null, 2) });
      return;
    }
    if (kind === 'lead') {
      setDevToolReport({ title: 'Lead 忽略率结果', body: JSON.stringify(simulateLeadDistribution(current.world, current.config.calendar, { seeds: [seed], days }), null, 2) });
      return;
    }
    if (kind === 'topic') {
      setDevToolReport({ title: '话题消耗结果', body: JSON.stringify(simulateTopicDistribution(current.world, { seeds: [seed], days }), null, 2) });
      return;
    }
    setDevToolReport({ title: '相遇分布结果', body: JSON.stringify(simulateEncounterDistribution(current.world, current.config.calendar, current.config.encounter, { seeds: [seed], days }), null, 2) });
  }

  async function loadStage4EncounterFixture(): Promise<void> {
    if (!window.confirm('载入阶段 4 相遇测试存档？当前世界进度将被替换。建议先导出正式存档。')) return;
    const fixture = seedScenario(createStage4EncounterScenario());
    const fixtureCards = Object.values(fixture.world.characters).map((character) => ({ id: character.id, name: character.name, description: character.card.description, personality: character.card.personality, scenario: character.card.scenario, firstMes: character.card.firstMes, exampleDialogue: character.card.exampleDialogue, updatedAt: now() }));
    const savedFixtureCards = await Promise.all(fixtureCards.map(saveCharacter));
    setCharacters((items) => [...items.filter((item) => !savedFixtureCards.some((fixtureCard) => fixtureCard.id === item.id)), ...savedFixtureCards]);
    pendingDiaryDaysRef.current = [];
    setActiveEncounter(null);
    commitSave(fixture);
    setTab('map');
    setFeedback({ tone: 'success', text: '阶段 4 相遇测试存档已载入：第 3 天中午前往西码头即可测试相遇与送礼；库存含三种测试礼物。' });
  }

  function addCharacterToCurrentWorld(characterId: string): void {
    const card = characters.find((item) => item.id === characterId);
    if (!card) return;
    const next = structuredClone(saveRef.current);
    const result = addCharacterToWorld(next.world, card);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法加入世界。' }); return; }
    commitSave(next);
    setFeedback({ tone: 'success', text: `${card.name} 已加入世界，当前地点会作为默认住所。` });
  }

  async function promoteNpcFromContacts(characterId: string, draft: NpcPromotionDraft): Promise<boolean> {
    if (characters.some((card) => card.id === characterId)) {
      setFeedback({ tone: 'error', text: '角色库中已有相同 ID 的角色卡。请先处理该角色卡，再执行转正。' });
      return false;
    }
    const next = structuredClone(saveRef.current);
    const applied = opRegistry.applyAll([buildPromoteNpcOp(characterId, draft)], {
      world: next.world,
      actorId: characterId,
      day: next.world.clock.day,
      slotId: next.world.clock.slotId,
      nodeId: next.world.player.nodeId,
      calendar: next.config.calendar,
      actionCosts: next.config.actionCosts,
      axisDefs: next.config.axisDefs,
      stageRules: next.config.stageRules,
      log: () => undefined,
    }, 1);
    if (applied.applied !== 1) {
      setFeedback({ tone: 'error', text: applied.rejected[0]?.reason ?? applied.warnings[0] ?? 'NPC 转正失败。' });
      return false;
    }
    const promoted = next.world.characters[characterId];
    if (!promoted) {
      setFeedback({ tone: 'error', text: 'NPC 转正后未生成正式角色卡。' });
      return false;
    }
    try {
      const card = await saveCharacter(characterCardFromPromotedCharacter(promoted, now()));
      setCharacters((items) => [...items.filter((item) => item.id !== card.id), card]);
      commitSave(next);
      setFeedback({ tone: 'success', text: `${promoted.name} 已转为正式角色，原有日程与记忆已保留。` });
      return true;
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '正式角色卡保存失败，未执行转正。') });
      return false;
    }
  }

  async function expandNpcPromotionDraft(characterId: string, draft: NpcPromotionDraft): Promise<NpcPromotionDraft | undefined> {
    const current = saveRef.current;
    const npc = current.world.npcs[characterId];
    if (!npc) { setFeedback({ tone: 'error', text: '该 NPC 已不在当前世界中，无法扩写。' }); return undefined; }
    const routedProvider = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForCharacter(providers, bindings, characterBindings, current.meta.id, characterId, 'narrate_main', defaultProviderId);
    let parsed: ProviderConfig;
    try {
      if (!routedProvider) throw new Error('请先保存并设置默认 Provider，或为该角色绑定普通 Provider。');
      parsed = ProviderConfigSchema.parse(routedProvider);
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效。') }); return undefined; }
    let raw = '';
    try {
      await streamChat(parsed, buildNpcExpansionPrompt(npc, draft), (delta) => { raw += delta; }, { taskId: 'narrate_main' });
      const expanded = parseNpcExpansionResponse(raw, draft);
      if (!expanded) throw new Error('Provider 返回的草稿不是有效角色卡 JSON。');
      setFeedback({ tone: 'success', text: 'AI 草稿建议已生成，请检查并手动修改后再确认转正。' });
      return expanded;
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, 'AI 草稿扩写失败，原草稿保持不变。') });
      return undefined;
    }
  }

  async function generateTopicTree(charId: string, nodeId: string, participantIds: string[], encounterEntryId = chatEncounterEntryId): Promise<void> {
    markResponseSource(null);
    const key = topicTreeKey(charId, nodeId);
    const existing = saveRef.current.world.topicTrees[key];
    if (existing && isTopicTreeFresh(existing, saveRef.current.world.clock.day)) {
      setTopicTree(existing);
      setTopicMode('topics');
      return;
    }
    const routedProvider = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForTask(providers, bindings, 'topic_tree', defaultProviderId);
    if (!routedProvider) {
      setTopicTree(null); setTopicMode('manual');
      setFeedback({ tone: 'info', text: '未配置话题树 Provider，已直接解锁手动对话。' });
      return;
    }
    let parsed: ProviderConfig;
    try { parsed = ProviderConfigSchema.parse(routedProvider); }
    catch (error) { setTopicTree(null); setTopicMode('manual'); setFeedback({ tone: 'error', text: errorMessage(error, '话题树 Provider 配置无效。') }); return; }
    setTopicLoading(true); setTopicMode('topics'); setTopicRetryContext(null); setFeedback({ tone: 'info', text: '正在生成本次相遇的话题树…' });
    try {
      const mainCharacter = characters.find((item) => item.id === charId);
      const scene = saveRef.current.world.map.nodes[nodeId];
      const participants = participantIds.map((id) => characters.find((item) => item.id === id)).filter((item): item is CharacterCard => Boolean(item));
      const activePresetBundle = presetBundles.find((item) => item.id === selectedPresetBundleId);
      const relationshipState = mainCharacter ? deriveRelationshipPromptState(saveRef.current.world, mainCharacter.id, saveRef.current.config.stageRules, saveRef.current.config.showNumbers) : undefined;
      const promptFacts = {
        input: '',
        character: mainCharacter,
        participants,
        presetBundle: activePresetBundle,
        playerPersona: activePersona,
        relationshipState,
        worldbooks,
        history: [],
        world: saveRef.current.world,
        topicTreeRequest: {
          day: saveRef.current.world.clock.day,
          slotId: saveRef.current.world.clock.slotId,
          character: { id: mainCharacter?.id ?? charId, name: mainCharacter?.name ?? charId },
          node: scene ? { id: scene.id, name: scene.name, description: scene.description } : { id: nodeId },
          usedTopics: saveRef.current.world.usedTopics,
        },
      };
      promptEvents.emit('beforePromptAssemble', { facts: promptFacts, task: 'topic_tree' });
      const assembled = assembler.assemble(promptFacts, { budget: Math.max(1, parsed.contextWindow - parsed.maxOutputTokens), task: 'topic_tree' });
      setDebug((current) => ({ ...current, prompt: assembled }));
      let generated = '';
      await streamChat(parsed, assembled.messages, (delta) => { generated += delta; }, { taskId: 'topic_tree', outputMode: parsed.outputMode, onStatus: (status) => setRequestStatus(status) });
      const tree = mergeDailyTopicTree(existing, parseGeneratedTopicTree(generated, charId, nodeId, saveRef.current.world.clock.day));
      const next = structuredClone(saveRef.current);
      next.world.topicTrees[key] = tree;
      commitSave(next);
      setTopicTree(tree); setTopicMode('topics'); writeEncounterChatSession({ characterId: charId, participantIds, nodeId, mode: 'topics', ...(encounterEntryId ? { entryId: encounterEntryId } : {}) }); setFeedback({ tone: 'success', text: `已生成 ${tree.topics.length} 个话题，点击话题不会再次调用 API。` });
    } catch (error) {
      setTopicTree(null); setTopicMode('manual'); setTopicRetryContext({ charId, nodeId, participantIds, ...(encounterEntryId ? { entryId: encounterEntryId } : {}) }); writeEncounterChatSession({ characterId: charId, participantIds, nodeId, mode: 'manual', ...(encounterEntryId ? { entryId: encounterEntryId } : {}) }); setFeedback({ tone: 'info', text: `话题树生成失败，已解锁手动对话：${errorMessage(error, '生成失败')}。你可以稍后重试。` });
    } finally { setTopicLoading(false); }
  }

  function retryTopicTree(): void {
    if (!topicRetryContext || topicLoading || busy) return;
    const retry = topicRetryContext;
    void generateTopicTree(retry.charId, retry.nodeId, retry.participantIds, retry.entryId);
  }

  function selectTopic(topic: Topic): void {
    if (!selectedCharacterId || topicLoading || topicMode !== 'topics') return;
    const world = saveRef.current.world;
    const visibility = topicVisibility(topic, world, saveRef.current.config.hiddenTopicStyle);
    if (visibility === 'locked' || visibility === 'hidden') return;
    const repeated = world.usedTopics[topic.id] !== undefined;
    const response = topicResponse(topic, world);
    const next = structuredClone(saveRef.current);
    const ops = repeated ? [] : [ ...(topic.ops ?? []), { op: 'mark_topic_used', id: topic.id }, ...(topic.unlocks ?? []).map((id) => ({ op: 'unlock_topic', id })) ];
    const applied = opRegistry.applyAll(ops, {
      world: next.world, actorId: selectedCharacterId, day: next.world.clock.day, slotId: next.world.clock.slotId, nodeId: next.world.player.nodeId,
      calendar: next.config.calendar, actionCosts: next.config.actionCosts, encounterConfig: next.config.encounter, events: promptEvents,
      memorySource: { chatCharacterId: selectedCharacterId, messageIndex: messages.length }, log: () => {},
    }, next.config.opsLimitPerTurn);
    commitSave(next);
    if (applied.changes.length) promptEvents.emit('onOpsApply', { changes: applied.changes });
    const nextMessages = [
      ...messages,
      { id: newChatMessageId(selectedCharacterId), role: 'user' as const, content: topic.label, kind: 'dialogue' as const, speakerId: 'player' },
      { id: newChatMessageId(selectedCharacterId), role: 'assistant' as const, content: response, kind: 'dialogue' as const, speakerId: selectedCharacterId },
    ];
    setMessages(nextMessages);
    markResponseSource('topic');
    void saveChat({ characterId: selectedCharacterId, messages: nextMessages, updatedAt: now() });
    if (topic.terminal) { setTopicMode('ended'); writeEncounterChatSession({ characterId: selectedCharacterId, participantIds: chatParticipantIds, nodeId: next.world.player.nodeId, mode: 'ended', entryId: chatEncounterEntryId || undefined, lastResponseSource: 'topic' }); setFeedback({ tone: 'info', text: '这次话题推进结束了场景。' }); return; }
    const refreshed = next.world.topicTrees[topicTreeKey(selectedCharacterId, next.world.player.nodeId)];
    const remaining = refreshed?.topics.some((item) => topicVisibility(item, next.world, next.config.hiddenTopicStyle) === 'available');
    if (!remaining) { setTopicMode('manual'); writeEncounterChatSession({ characterId: selectedCharacterId, participantIds: chatParticipantIds, nodeId: next.world.player.nodeId, mode: 'manual', entryId: chatEncounterEntryId || undefined, lastResponseSource: 'topic' }); setFeedback({ tone: 'info', text: '话题树已结束，现在可以自由输入。' }); }
  }

  function continueEncounter(): void {
    if (!activeEncounter) return;
    const next = structuredClone(saveRef.current);
    const result = updateEncounterOutcome(next.world, activeEncounter.entryId, 'continued');
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '无法记录相遇结果。' }); return; }
    const availableIds = new Set(activeEncounter.candidates.filter((candidate) => candidate.tier === 'formal' && characters.some((item) => item.id === candidate.id)).map((candidate) => candidate.id));
    if (!availableIds.size) {
      commitSave(next);
      setActiveEncounter(null);
      setEncounterParticipantIds([]);
      writeEncounterChatSession(null);
      setFeedback({ tone: 'info', text: '你决定留下继续，但当前没有可用的正式角色聊天卡。' });
      return;
    }
    const participantIds = encounterParticipantIds.filter((id) => availableIds.has(id));
    if (!participantIds.length) { setFeedback({ tone: 'error', text: '请至少选择一位正式角色进入对话。' }); return; }
    const formal = characters.find((item) => item.id === participantIds[0]);
    commitSave(next);
    setActiveEncounter(null);
    setEncounterParticipantIds([]);
    if (!formal) { setFeedback({ tone: 'info', text: '你决定留下继续，但当前没有可用的正式角色聊天卡。' }); return; }
    setChatParticipantIds(participantIds);
    setChatEncounterEntryId(activeEncounter.entryId);
    setChatParticipantsLocked(true);
    markResponseSource(null);
    setSelectedCharacterId(formal.id);
    setTopicTree(null);
    setTopicMode('topics');
    writeEncounterChatSession({ characterId: formal.id, participantIds, nodeId: next.world.player.nodeId, mode: 'topics', entryId: activeEncounter.entryId });
    setTab('chat');
    void generateTopicTree(formal.id, next.world.player.nodeId, participantIds, activeEncounter.entryId);
    setFeedback({ tone: 'info', text: `你留下来和${formal.name}继续聊聊。` });
  }

  function resolveChatDeparture(outcome: 'stayed' | 'left'): void {
    if (!chatEncounterEntryId) return;
    const next = structuredClone(saveRef.current);
    const result = resolveDeparture(next.world, chatEncounterEntryId, outcome);
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '当前没有待处理的告别。' }); return; }
    commitSave(next);
    if (outcome === 'left') {
      setTopicMode('ended');
      writeEncounterChatSession({ characterId: selectedCharacterId, participantIds: chatParticipantIds, nodeId: next.world.player.nodeId, mode: 'ended', entryId: chatEncounterEntryId });
      setFeedback({ tone: 'info', text: '你们在这里告别了。' });
    } else setFeedback({ tone: 'info', text: '你决定再陪对方聊一会儿。' });
  }

  async function consolidateEncounterMemories(baseSave: SaveFile, charId: string, transcript: ChatMessage[]): Promise<number> {
    const pending = pendingMemoryCandidatesRef.current.filter((candidate) => candidate.target === charId);
    const candidates: PendingMemoryCandidate[] = [...pending];
    let usedApi = false;
    const hasExplicitRoute = bindings.some((binding) => binding.taskId === 'summarize_memory') || Boolean(mockFixtureId);
    if (hasExplicitRoute && shouldConsolidateMemories(transcript)) {
      const routed = mockFixtureId ? createMockProviderConfig(mockFixtureId) : resolveProviderForTask(providers, bindings, 'summarize_memory', defaultProviderId);
      if (routed) {
        try {
          const parsed = ProviderConfigSchema.parse(routed);
          const character = characters.find((item) => item.id === charId);
          let raw = '';
          await streamChat(parsed, buildMemoryConsolidationPrompt(transcript, charId, character?.name ?? charId), (delta) => { raw += delta; }, { taskId: 'summarize_memory' });
          const sourceMessageIndices = transcript.map((_message, index) => index);
          for (const candidate of parseMemoryConsolidationResponse(raw)) candidates.push({ ...candidate, sourceMessageIndices });
          usedApi = true;
        } catch (error) {
          setFeedback({ tone: 'info', text: `记忆整理调用失败，已保留本地候选：${errorMessage(error, '整理失败')}` });
        }
      }
    }
    const unique = [...new Map(candidates.map((candidate) => [`${candidate.target}:${candidate.text.trim()}`, candidate])).values()];
    if (!unique.length) { pendingMemoryCandidatesRef.current = []; return 0; }
    const next = structuredClone(baseSave);
    const allSourceIndices = [...new Set(unique.flatMap((candidate) => candidate.sourceMessageIndices))].sort((a, b) => a - b);
    const applied = opRegistry.applyAll(unique.map((candidate) => ({ op: 'add_memory', target: candidate.target, text: candidate.text.trim(), type: candidate.type, importance: candidate.importance })), {
      world: next.world, actorId: charId, day: next.world.clock.day, slotId: next.world.clock.slotId, nodeId: next.world.player.nodeId,
      calendar: next.config.calendar, actionCosts: next.config.actionCosts, encounterConfig: next.config.encounter, axisDefs: next.config.axisDefs, stageRules: next.config.stageRules, events: promptEvents,
      memorySource: { chatCharacterId: charId, messageIndex: allSourceIndices[0] ?? 0, messageIndices: allSourceIndices }, log: () => {},
    }, next.config.opsLimitPerTurn);
    if (applied.changes.length) commitSave(next);
    pendingMemoryCandidatesRef.current = [];
    if (applied.applied && usedApi) setFeedback({ tone: 'success', text: `本次相遇已整理并保存 ${applied.applied} 条记忆。` });
    return applied.applied;
  }

  async function sayGoodbye(): Promise<void> {
    if (!chatEncounterEntryId || busy) return;
    const next = structuredClone(saveRef.current);
    const proposed = proposeDeparture(next.world, chatEncounterEntryId, 'player_farewell');
    if (!proposed.ok) { setFeedback({ tone: 'error', text: proposed.warning ?? '现在无法告别。' }); return; }
    const resolved = resolveDeparture(next.world, chatEncounterEntryId, 'left');
    if (!resolved.ok) { setFeedback({ tone: 'error', text: resolved.warning ?? '现在无法结束相遇。' }); return; }
    commitSave(next);
    setTopicMode('ended');
    writeEncounterChatSession({ characterId: selectedCharacterId, participantIds: chatParticipantIds, nodeId: next.world.player.nodeId, mode: 'ended', entryId: chatEncounterEntryId });
    setBusy(true);
    setFeedback({ tone: 'info', text: '你主动结束了这次相遇，正在整理本次对话…' });
    try { await consolidateEncounterMemories(next, selectedCharacterId, messages); }
    finally { setBusy(false); }
  }

  function offerGiftToCurrent(itemId: string, targetId = selectedCharacterId): void {
    if (!selectedCharacterId || !targetId || !chatEncounterEntryId || busy) return;
    const next = structuredClone(saveRef.current);
    const applied = opRegistry.applyAll([{ op: 'offer_gift', target: targetId, itemId }], {
      world: next.world, actorId: targetId, day: next.world.clock.day, slotId: next.world.clock.slotId, nodeId: next.world.player.nodeId,
      calendar: next.config.calendar, actionCosts: next.config.actionCosts, encounterConfig: next.config.encounter, axisDefs: next.config.axisDefs, stageRules: next.config.stageRules, events: promptEvents, log: () => {},
    }, next.config.opsLimitPerTurn);
    if (!applied.applied) { setFeedback({ tone: 'error', text: applied.warnings[0] ?? applied.rejected[0]?.reason ?? '无法送出这件礼物。' }); return; }
    commitSave(next);
    promptEvents.emit('onOpsApply', { changes: applied.changes });
    const gift = next.world.giftHistory.at(-1);
    if (!gift) return;
    const item = next.world.items[itemId];
    const character = next.world.characters[targetId];
    const giftContext: GiftGenerationContext = { giftId: gift.id, itemId, itemName: item?.name ?? itemId, charId: targetId, charName: character?.name ?? targetId };
    const giftMessage: ChatMessage = { id: newChatMessageId(selectedCharacterId), role: 'user', content: `（你送出了${item?.name ?? itemId}。）`, kind: 'dialogue', speakerId: 'player' };
    const nextMessages = [...messages, giftMessage];
    setMessages(nextMessages);
    void saveChat({ characterId: selectedCharacterId, messages: nextMessages, updatedAt: now() });
    setFeedback({ tone: 'info', text: `你送出了${item?.name ?? itemId}，正在等待${character?.name ?? targetId}的回应。` });
    void generateReply(giftContext, nextMessages);
  }

  function retryPendingGift(giftId: string): void {
    if (busy || !selectedCharacterId) return;
    const gift = saveRef.current.world.giftHistory.find((entry) => entry.id === giftId && entry.status === 'pending' && chatParticipantIds.includes(entry.charId));
    if (!gift) { setFeedback({ tone: 'error', text: '这件礼物已经完成回应，或不再属于当前角色。' }); return; }
    const item = saveRef.current.world.items[gift.itemId];
    const character = saveRef.current.world.characters[gift.charId];
    void generateReply({ giftId, itemId: gift.itemId, itemName: item?.name ?? gift.itemId, charId: gift.charId, charName: character?.name ?? gift.charId }, messages);
  }

  function showCollectionToCurrent(entryId: string): void {
    if (!selectedCharacterId || !chatEncounterEntryId || topicMode !== 'manual' || busy) return;
    const currentSave = saveRef.current;
    const entry = currentSave.world.collection.find((item) => item.id === entryId);
    if (!entry) { setFeedback({ tone: 'error', text: '找不到这条收藏条目。' }); return; }
    const recentEvent = [...(currentSave.world.eventHistory ?? [])].reverse().find((history) => history.day === currentSave.world.clock.day && history.nodeId === currentSave.world.player.nodeId && history.charIds.includes(selectedCharacterId));
    const evidence = recentEvent ? evaluateEvidenceReaction(currentSave.world, recentEvent.id, entry.id) : undefined;
    if (evidence && !evidence.ok) { setFeedback({ tone: 'error', text: evidence.warning ?? '这条收藏目前无法出示。' }); return; }
    const next = structuredClone(currentSave);
    if (evidence?.matched && evidence.ops.length) {
      const applied = opRegistry.applyAll(evidence.ops, {
        world: next.world, actorId: selectedCharacterId, day: next.world.clock.day, slotId: next.world.clock.slotId, nodeId: next.world.player.nodeId,
        calendar: next.config.calendar, actionCosts: next.config.actionCosts, encounterConfig: next.config.encounter, events: promptEvents, log: () => {},
      }, next.config.opsLimitPerTurn);
      if (applied.changes.length) promptEvents.emit('onOpsApply', { changes: applied.changes });
    }
    if (evidence?.matched) commitSave(next);
    const message: ChatMessage = { id: newChatMessageId(selectedCharacterId), role: 'user', content: `（你向对方出示了收藏《${entry.title}》${entry.description ? `：${entry.description}` : ''}。）`, kind: 'dialogue', speakerId: 'player' };
    const nextMessages = [...messages, message];
    setMessages(nextMessages);
    void saveChat({ characterId: selectedCharacterId, messages: nextMessages, updatedAt: now() });
    setFeedback({ tone: 'info', text: evidence?.matched ? `你出示了收藏《${entry.title}》，内核已确认对应事件反应，正在等待角色回应。` : `你出示了收藏《${entry.title}》，正在等待角色回应。` });
    void generateReply(undefined, nextMessages, true, { entryId: entry.id, itemId: entry.itemId, title: entry.title, description: entry.description, tags: entry.tags, ...(evidence?.matched && evidence.response && recentEvent ? { evidenceReaction: { eventId: recentEvent.eventId, response: evidence.response } } : {}) });
  }

  function updateChatParticipants(ids: string[]): void {
    const available = [...new Set(ids)].filter((id) => presentChatCharacters.some((character) => character.id === id));
    if (!available.length) return;
    setChatParticipantIds(available);
    if (!available.includes(selectedCharacterId)) setSelectedCharacterId(available[0]);
  }

  async function appendMessage() {
    const text = input.trim();
    if (!text || busy) return;
    if (!selectedCharacterId) { setFeedback({ tone: 'error', text: '请先选择聊天角色。' }); return; }
    const next = [...messages, { id: newChatMessageId(selectedCharacterId), role: 'user' as const, content: text, kind: 'dialogue' as const, speakerId: 'player' }];
    setMessages(next); setInput(''); setRequestStatus('idle');
    markResponseSource(null);
    setFeedback({ tone: 'info', text: '消息已发送，点击“生成回复”后才会请求 API。' });
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
  }

  async function editChatHistoryMessage(index: number, content: string): Promise<void> {
    if (!selectedCharacterId || !messages[index] || !isEditableChatMessage(messages[index])) return;
    const previousAssetId = storedAssetId(messages[index].voice?.asset);
    const previousCgAssetId = storedAssetId(messages[index].cg?.asset);
    const next = updateChatMessage(messages, index, content);
    if (next === messages) return;
    const nextSave = structuredClone(saveRef.current);
    const removedMemories = removeRelationshipMemoriesFromMessage(nextSave.world, selectedCharacterId, index);
    pendingMemoryCandidatesRef.current = pendingMemoryCandidatesRef.current.filter((candidate) => !candidate.sourceMessageIndices.includes(index));
    if (removedMemories) commitSave(nextSave);
    if (pendingOps?.messageIndex !== undefined && index <= pendingOps.messageIndex) { setPendingOps(null); setManualOps('[]'); }
    setMessages(next);
    setFeedback({ tone: 'success', text: `台词已修改。${removedMemories ? `已移除 ${removedMemories} 条由原聊天产生的旧记忆；` : ''}下一次生成会使用编辑后的上下文，不会回滚其他状态变化。` });
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
    if (previousAssetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
    if (previousCgAssetId) await deleteImageAssetIfUnreferenced(previousCgAssetId);
  }

  async function deleteChatHistoryMessage(index: number): Promise<void> {
    if (!selectedCharacterId || !messages[index] || !isEditableChatMessage(messages[index])) return;
    const previousAssetId = storedAssetId(messages[index].voice?.asset);
    const previousCgAssetId = storedAssetId(messages[index].cg?.asset);
    const next = deleteChatMessage(messages, index);
    if (next === messages) return;
    const nextSave = structuredClone(saveRef.current);
    const removedMemories = removeRelationshipMemoriesFromMessage(nextSave.world, selectedCharacterId, index);
    pendingMemoryCandidatesRef.current = pendingMemoryCandidatesRef.current.filter((candidate) => !candidate.sourceMessageIndices.includes(index)).map((candidate) => ({ ...candidate, sourceMessageIndices: candidate.sourceMessageIndices.map((sourceIndex) => sourceIndex > index ? sourceIndex - 1 : sourceIndex) }));
    if (removedMemories) commitSave(nextSave);
    if (pendingOps?.messageIndex !== undefined && index <= pendingOps.messageIndex) { setPendingOps(null); setManualOps('[]'); }
    setMessages(next);
    setFeedback({ tone: 'success', text: `台词已从聊天记录中删除。${removedMemories ? `已移除 ${removedMemories} 条受影响的旧记忆；` : ''}不会回滚其他状态变化。` });
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
    if (previousAssetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
    if (previousCgAssetId) await deleteImageAssetIfUnreferenced(previousCgAssetId);
  }

  async function generateChatVoice(index: number, retryRequestId?: string): Promise<void> {
    if (ttsBusyRef.current) return;
    const message = messages[index];
    if (!message || message.role !== 'assistant' || !message.content.trim()) { setFeedback({ tone: 'error', text: '只能为角色回复生成语音。' }); return; }
    const chatCharacterId = selectedCharacterId;
    const speakerId = message.speakerId && message.speakerId !== 'player' ? message.speakerId : selectedCharacterId;
    const config = resolveTtsProviderForCharacter(ttsConfigs, characterBindings, saveRef.current.meta.id, speakerId, defaultTtsConfigId);
    if (!config || !config.enabled) { setFeedback({ tone: 'error', text: '请先在设置的“语音”中启用并保存语音 API，或为当前角色绑定可用配置。' }); return; }
    const requestId = retryRequestId ?? `chat-tts-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previousAssetId = storedAssetId(message.voice?.asset);
    const cacheFingerprint = speechCacheFingerprint(config, message.content);
    const forceRegenerate = Boolean(previousAssetId);
    ttsBusyRef.current = true; setTtsBusy(true); setFeedback(null);
    let generatedAssetId: string | undefined;
    let requestAttempted = false;
    try {
      const attachToLatest = async (attachment: VoiceAttachment): Promise<void> => {
        const latestRecord = await loadChat(chatCharacterId);
        const latestMessages = latestRecord?.messages ?? messages;
        const targetIndex = message.id ? latestMessages.findIndex((item) => item.id === message.id) : index;
        const latestTarget = latestMessages[targetIndex];
        if (!latestTarget || latestTarget.role !== 'assistant' || latestTarget.content !== message.content) throw new Error('消息已变化，语音未附加。');
        const next = latestMessages.map((item, messageIndex) => messageIndex === targetIndex ? { ...item, voice: attachment } : item);
        if (selectedCharacterIdRef.current === chatCharacterId) setMessages(next);
        await saveChat({ characterId: chatCharacterId, messages: next, updatedAt: now() });
      };
      if (!forceRegenerate) {
        const cached = await findVoiceAssetByFingerprint(cacheFingerprint);
        if (cached) {
          await attachToLatest({ asset: { kind: 'stored', assetId: cached.id }, audioFormat: cached.audioFormat ?? config.format, durationMs: cached.durationMs ?? 0, requestId: cached.voiceRequestId ?? requestId, cacheFingerprint });
          await refreshVoiceCacheStats();
          setFeedback({ tone: 'success', text: '已复用本地语音缓存，未调用 API。' });
          return;
        }
      }
      await persistTtsResult(config, 'requesting', undefined, { requestId, characterId: speakerId, text: message.content.trim() });
      requestAttempted = true;
      const result = await synthesizeSpeech(config, message.content.trim());
      const durationMs = await measureAudioDurationMs(result.blob);
      const assetId = `chat-voice-${requestId}`;
      await saveVoiceAsset({ id: assetId, blob: result.blob, mimeType: result.mimeType, category: 'voice', cacheFingerprint, audioFormat: result.format, durationMs, voiceRequestId: requestId, createdAt: now() });
      generatedAssetId = assetId;
      await attachToLatest({ asset: { kind: 'stored', assetId }, audioFormat: result.format, durationMs, requestId, cacheFingerprint });
      if (previousAssetId && previousAssetId !== assetId) await deleteVoiceAssetIfUnreferenced(previousAssetId);
      await persistTtsResult(config, 'success', undefined, null);
      await refreshVoiceCacheStats();
      setFeedback({ tone: 'success', text: '语音已附加到这条角色消息。' });
    } catch (error) {
      const messageText = errorMessage(error, '语音生成失败，可手动重试。');
      if (generatedAssetId) await deleteVoiceAssetIfUnreferenced(generatedAssetId).catch(() => undefined);
      if (requestAttempted) await persistTtsResult(config, 'error', messageText, { requestId, characterId: speakerId, text: message.content.trim() }).catch(() => undefined);
      setFeedback({ tone: 'error', text: `${messageText} 原有语音保持不变。` });
    } finally { ttsBusyRef.current = false; setTtsBusy(false); }
  }

  async function generateChatCg(index: number, scenePrompt: string, characterIds: string[], includesPlayer: boolean): Promise<void> {
    if (imageBusyRef.current) return;
    const message = messages[index];
    if (!selectedCharacterId || !message || message.role !== 'assistant' || !message.id) { setFeedback({ tone: 'error', text: '只能为已保存的角色回复生成 CG。' }); return; }
    const selectedIds = [...new Set(characterIds)].filter((id) => Boolean(saveRef.current.world.characters[id])).slice(0, 3);
    if (!selectedIds.length) { setFeedback({ tone: 'error', text: '请至少选择一位入镜角色。' }); return; }
    let config: ImageConfig;
    try { config = ImageConfigSchema.parse(imageConfigRef.current); }
    catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '图像设置无效。') }); return; }
    const provider = providers.find((item) => item.id === config.providerId && item.kind === 'openai-compatible');
    if (!provider) { setFeedback({ tone: 'error', text: '请先在设置的“图像”中选择 OpenAI-compatible Provider。' }); return; }
    const characterVisuals = selectedIds.map((characterId) => ({
      character: saveRef.current.world.characters[characterId],
      config: imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId),
    }));
    const identity = currentImageIdentity(saveRef.current.world.player.personaId);
    const userVisual = imageUserVisualConfigs.find((item) => item.id === imageUserConfigId(saveRef.current.meta.id, identity));
    const playerName = activePersona?.displayName ?? saveRef.current.world.player.name;
    let prompt: string;
    try {
      prompt = buildChatCgPrompt({
        scenePrompt,
        locationName: saveRef.current.world.map.nodes[saveRef.current.world.player.nodeId]?.name,
        stylePrompt: config.stylePrompt,
        characters: characterVisuals.map((entry) => ({ name: entry.character.name, appearancePrompt: entry.config?.appearancePrompt })),
        ...(includesPlayer ? { player: { name: playerName, appearancePrompt: userVisual?.appearancePrompt } } : {}),
      });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, 'CG 画面描述无效。') }); return; }

    if (includesPlayer) {
      const missingCharacter = characterVisuals.find((entry) => !entry.config?.lockFaceEnabled || !entry.config.referenceImage);
      if (missingCharacter) { setFeedback({ tone: 'error', text: `互动 CG 需要同时锁脸：请先为${missingCharacter.character.name}上传并启用角色参考图。` }); return; }
      if (!userVisual?.lockFaceEnabled || !userVisual.referenceImage) { setFeedback({ tone: 'error', text: '互动 CG 需要同时锁脸：请先为当前玩家或面具身份上传并启用用户参考图。' }); return; }
      const externalCharacter = characterVisuals.find((entry) => entry.config?.referenceImage?.kind === 'url');
      if (externalCharacter) { setFeedback({ tone: 'error', text: `互动 CG 不能把外链图片作为 edits 参考图。请为${externalCharacter.character.name}上传本地锁脸图。` }); return; }
      if (userVisual.referenceImage.kind === 'url') { setFeedback({ tone: 'error', text: '互动 CG 不能把外链图片作为 edits 参考图。请为当前玩家或面具身份上传本地锁脸图。' }); return; }
      if (config.referenceMode !== 'openai-edits') { setFeedback({ tone: 'error', text: '互动 CG 不能降级为纯提示词。请先在图像设置中启用 images/edits。' }); return; }
      if (!config.multiReferenceEnabled) { setFeedback({ tone: 'error', text: '当前图像配置未声明支持多参考图，无法同时锁定用户与角色。请在图像设置中确认 Provider 能力后启用。' }); return; }
    }

    const hasExternalReference = characterVisuals.some((entry) => entry.config?.lockFaceEnabled && entry.config.referenceImage?.kind === 'url') || Boolean(includesPlayer && userVisual?.lockFaceEnabled && userVisual.referenceImage?.kind === 'url');
    const referenceAssetIds = characterVisuals.flatMap((entry) => entry.config?.lockFaceEnabled && entry.config.referenceImage?.kind === 'stored' ? [entry.config.referenceImage.assetId] : []);
    if (includesPlayer && userVisual?.referenceImage?.kind === 'stored') referenceAssetIds.push(userVisual.referenceImage.assetId);
    if (referenceAssetIds.length > 1 && !config.multiReferenceEnabled) { setFeedback({ tone: 'error', text: '本次 CG 需要多张锁脸参考图，但当前图像配置只允许单参考图。' }); return; }
    const referenceImages: Blob[] = [];
    if (config.referenceMode === 'openai-edits') {
      try {
        for (const assetId of referenceAssetIds) {
          const stored = await loadAsset(assetId);
          if (!stored?.blob.size) throw new Error(`锁脸参考图 ${assetId} 不存在，请重新上传。`);
          referenceImages.push(stored.blob);
        }
      } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '锁脸参考图读取失败。') }); return; }
    }

    const chatCharacterId = selectedCharacterId;
    const requestId = `chat-cg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const previousAssetId = storedAssetId(message.cg?.asset);
    imageBusyRef.current = true; setImageBusy(true); setFeedback(null);
    const requesting = ImageConfigSchema.parse({ ...config, lastStatus: 'requesting', lastCalledAt: now(), updatedAt: now() });
    imageConfigRef.current = requesting; setImageConfig(requesting); await providerDb.imageConfigs.put(requesting);
    let generatedAssetId: string | undefined;
    try {
      const result = await generateImage(provider, prompt, { size: config.size, quality: config.quality, style: config.style, responseFormat: config.responseFormat, referenceMode: config.referenceMode, editEndpoint: config.editEndpoint, referenceImages });
      const blob = await generatedImageToBlob(result);
      generatedAssetId = requestId;
      await saveAsset({ id: generatedAssetId, blob, mimeType: blob.type || 'image/png', category: 'image', createdAt: now() });
      const attachment: ChatCgAttachment = { asset: { kind: 'stored', assetId: generatedAssetId }, prompt, requestId, characterIds: selectedIds, includesPlayer, generatedAt: now(), ...(result.revisedPrompt ? { revisedPrompt: result.revisedPrompt } : {}) };
      const latestRecord = await loadChat(chatCharacterId);
      const latestMessages = latestRecord?.messages ?? messages;
      const targetIndex = latestMessages.findIndex((item) => item.id === message.id);
      const latestTarget = latestMessages[targetIndex];
      if (!latestTarget || latestTarget.content !== message.content) throw new Error('消息已变化，CG 未附加。');
      const next = latestMessages.map((item, messageIndex) => messageIndex === targetIndex ? { ...item, cg: attachment } : item);
      await saveChat({ characterId: chatCharacterId, messages: next, updatedAt: now() });
      if (selectedCharacterIdRef.current === chatCharacterId) setMessages(next);
      const success = ImageConfigSchema.parse({ ...requesting, lastStatus: 'success', requestCount: requesting.requestCount + 1, updatedAt: now() });
      imageConfigRef.current = success; setImageConfig(success); await providerDb.imageConfigs.put(success);
      if (previousAssetId && previousAssetId !== generatedAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      await refreshImageAssetStats();
      const promptOnly = hasExternalReference || (referenceAssetIds.length > 0 && config.referenceMode !== 'openai-edits');
      setFeedback({ tone: promptOnly ? 'info' : 'success', text: promptOnly ? 'CG 已生成并附加；锁脸参考图未发送，本次只使用固定外貌提示词。' : 'CG 已生成并附加到原角色回复，没有替换头像或立绘。' });
    } catch (error) {
      if (generatedAssetId) await deleteImageAssetIfUnreferenced(generatedAssetId).catch(() => undefined);
      const messageText = errorMessage(error, 'CG 生成失败。');
      const failed = ImageConfigSchema.parse({ ...requesting, lastStatus: 'error', requestCount: requesting.requestCount + 1, failureCount: requesting.failureCount + 1, lastError: messageText, updatedAt: now() });
      imageConfigRef.current = failed; setImageConfig(failed); await providerDb.imageConfigs.put(failed);
      setFeedback({ tone: 'error', text: `${messageText} 原有 CG 保持不变。` });
    } finally { imageBusyRef.current = false; setImageBusy(false); }
  }

  async function deleteChatCg(index: number): Promise<void> {
    const message = messages[index];
    const assetId = storedAssetId(message?.cg?.asset);
    if (!selectedCharacterId || !message?.cg || !assetId) return;
    const next = messages.map((item, messageIndex) => {
      if (messageIndex !== index) return item;
      const { cg: _cg, ...withoutCg } = item;
      return withoutCg;
    });
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
    setMessages(next);
    await deleteImageAssetIfUnreferenced(assetId);
    await refreshImageAssetStats();
    setFeedback({ tone: 'success', text: 'CG 图片已删除，原有台词和旁白已保留。' });
  }

  async function generateReply(giftContext?: GiftGenerationContext, providedMessages?: ChatMessage[], suppressItemGains = false, collectionContext?: CollectionGenerationContext) {
    if (busy) return;
    if (!selectedCharacterId) { setFeedback({ tone: 'error', text: '请先选择聊天角色。' }); return; }
    const text = input.trim();
    const next = providedMessages ?? (text ? [...messages, { id: newChatMessageId(selectedCharacterId), role: 'user' as const, content: text, kind: 'dialogue' as const, speakerId: 'player' }] : messages);
    if (!hasQueuedUserMessage(next) && next.length === 0) { setFeedback({ tone: 'error', text: '请先发送第一条消息。' }); return; }
    const generationCharacterId = giftContext?.charId ?? selectedCharacterId;
    const routedProvider = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForCharacter(providers, bindings, characterBindings, saveRef.current.meta.id, generationCharacterId, 'narrate_main', defaultProviderId);
    let parsed: ProviderConfig;
    try {
      if (!routedProvider) throw new Error('请先保存并设置默认 Provider，或在高级调试中启用 Mock fixture。');
      parsed = ProviderConfigSchema.parse(routedProvider);
    } catch (error) { setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效，请在设置中检查基础 URL、模型与渠道。') }); return; }

    setMessages(next); setInput(''); setBusy(true); setReplyInProgress(true); setRequestStatus('requesting'); setFeedback(null); setPendingOps(null);
    await saveChat({ characterId: selectedCharacterId, messages: next, updatedAt: now() });
    const requestId = createChatRequestId();
    const assistantMessageId = newChatMessageId(selectedCharacterId);
    updateChatRecovery({ characterId: selectedCharacterId, requestId, status: 'requesting', input: text, messages: next, baseMessages: next, assistantText: '', raw: '', actorId: generationCharacterId, messageIndex: next.length, opsApplied: false, updatedAt: now() });
    let narrative = '';
    const splitter = new OpsStreamSplitter();
    const latestInput = [...next].reverse().find((message) => message.role === 'user')?.content ?? '';
    const activePresetBundle = presetBundles.find((item) => item.id === selectedPresetBundleId);
    const participantIds = chatParticipantIds.length ? chatParticipantIds : [selectedCharacterId];
    const participants = participantIds.map((id) => characters.find((item) => item.id === id)).filter((character): character is CharacterCard => Boolean(character));
    const generationCharacter = characters.find((item) => item.id === generationCharacterId);
    const relationshipState = generationCharacter ? deriveRelationshipPromptState(saveRef.current.world, generationCharacter.id, saveRef.current.config.stageRules, saveRef.current.config.showNumbers) : undefined;
    const relationshipMemories = await relationshipMemoryOverride(latestInput, generationCharacterId);
    const promptFacts = { input: latestInput, character: generationCharacter, participants, presetBundle: activePresetBundle, playerPersona: activePersona, relationshipState, relationshipMemories, giftContext: giftContext ? { ...giftContext, description: saveRef.current.world.items[giftContext.itemId]?.description, tags: saveRef.current.world.items[giftContext.itemId]?.tags ?? [] } : undefined, collectionContext, worldbooks, history: next, world: saveRef.current.world };
    promptEvents.emit('beforePromptAssemble', { facts: promptFacts, task: 'narrate_main' });
    const assembled = assembler.assemble(promptFacts, { budget: Math.max(1, parsed.contextWindow - parsed.maxOutputTokens), task: 'narrate_main' });
    setDebug((current) => ({ ...current, prompt: assembled }));
    try {
      await streamChat(parsed, assembled.messages, (delta) => {
        narrative += splitter.push(delta);
        setMessages([...next, { id: assistantMessageId, role: 'assistant', content: narrative, kind: 'dialogue', speakerId: generationCharacterId }]);
        updateChatRecovery({ characterId: selectedCharacterId, requestId, status: 'generating', input: text, messages: [...next, { id: assistantMessageId, role: 'assistant', content: narrative, kind: 'dialogue', speakerId: generationCharacterId }], baseMessages: next, assistantText: narrative, raw: '', actorId: generationCharacterId, messageIndex: next.length, opsApplied: false, updatedAt: now() });
      }, { taskId: 'narrate_main', onStatus: (status) => setRequestStatus(status) });
      const finished = splitter.finish();
      narrative += finished.text;
      const completed = [...next, { id: assistantMessageId, role: 'assistant' as const, content: narrative, kind: 'dialogue' as const, speakerId: generationCharacterId }];
      setMessages(completed);
      markResponseSource('manual');
      await saveChat({ characterId: selectedCharacterId, messages: completed, updatedAt: now() });
      const reply = await parseReply(finished.raw, extractOps);
      const itemGainOps = reply.ops.filter((op) => Boolean(op && typeof op === 'object' && (op as { op?: unknown }).op === 'give_item'));
      const safeReply = suppressItemGains
        ? { ...reply, ops: reply.ops.filter((op) => !itemGainOps.includes(op)), warnings: [...reply.warnings, ...(itemGainOps.length ? ['出示收藏的回应中检测到 give_item，已忽略以避免把出示误记为再次获得物品。'] : [])] }
        : reply;
      if (applyReplyOps(safeReply, generationCharacterId, giftContext?.giftId, completed.length - 1, requestId)) updateChatRecovery(null);
      void showGenerationCompleteNotification();
    } catch (error) {
      const message = errorMessage(error, '请求失败');
      const finished = splitter.finish();
      narrative += finished.text;
      if (narrative) {
        const completed = [...next, { id: assistantMessageId, role: 'assistant' as const, content: narrative, kind: 'dialogue' as const, speakerId: generationCharacterId }];
        setMessages(completed);
        await saveChat({ characterId: selectedCharacterId, messages: completed, updatedAt: now() });
      } else {
        setMessages(next);
      }
      setRequestStatus('error'); setFeedback({ tone: 'error', text: message });
      updateChatRecovery({ characterId: selectedCharacterId, requestId, status: 'error', input: text, messages: narrative ? [...next, { id: assistantMessageId, role: 'assistant', content: narrative, kind: 'dialogue', speakerId: generationCharacterId }] : next, baseMessages: next, assistantText: narrative, raw: finished.raw, actorId: generationCharacterId, messageIndex: narrative ? next.length : undefined, opsApplied: false, error: message, updatedAt: now() });
      if (finished.raw) setPendingOps({ raw: finished.raw, actorId: generationCharacterId, messageIndex: narrative ? next.length : undefined, streamError: message, requestId });
      setDebug((current) => ({
        ...current,
        raw: finished.raw || message,
        ops: JSON.stringify({ stage: 'stream-error', applied: 0, warnings: [message], message: '本回合未产生状态变更。' }, null, 2),
      }));
    } finally { setBusy(false); setReplyInProgress(false); }
  }

  async function regenerateReply(): Promise<void> {
    const requirement = regenerateInput.trim();
    if (busy || topicMode !== 'manual' || lastResponseSource === 'topic' || !selectedCharacterId) return;
    const latestAssistantIndex = [...messages].map((message, index) => message.role === 'assistant' ? index : -1).filter((index) => index >= 0).at(-1) ?? -1;
    if (latestAssistantIndex < 0) return;
    const originalMessages = messages;
    const baseMessages = messages.slice(0, latestAssistantIndex);
    const routedProvider = mockFixtureId
      ? createMockProviderConfig(mockFixtureId)
      : resolveProviderForCharacter(providers, bindings, characterBindings, saveRef.current.meta.id, selectedCharacterId, 'narrate_main', defaultProviderId);
    let parsed: ProviderConfig;
    try {
      if (!routedProvider) throw new Error('请先保存并设置默认 Provider，或在高级调试中启用 Mock fixture。');
      parsed = ProviderConfigSchema.parse(routedProvider);
    } catch (error) { setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, 'Provider 配置无效，请在设置中检查基础 URL、模型与渠道。') }); return; }
    const activePresetBundle = presetBundles.find((item) => item.id === selectedPresetBundleId);
    const participantIds = chatParticipantIds.length ? chatParticipantIds : [selectedCharacterId];
    const participants = participantIds.map((id) => characters.find((item) => item.id === id)).filter((character): character is CharacterCard => Boolean(character));
    const latestInput = [...baseMessages].reverse().find((message) => message.role === 'user')?.content ?? '';
    const relationshipState = activeCharacter ? deriveRelationshipPromptState(saveRef.current.world, activeCharacter.id, saveRef.current.config.stageRules, saveRef.current.config.showNumbers) : undefined;
    const relationshipMemories = await relationshipMemoryOverride(latestInput, selectedCharacterId);
    const promptFacts = { input: latestInput, regenerationRequest: requirement, character: activeCharacter, participants, presetBundle: activePresetBundle, playerPersona: activePersona, relationshipState, relationshipMemories, worldbooks, history: originalMessages, world: saveRef.current.world };
    promptEvents.emit('beforePromptAssemble', { facts: promptFacts, task: 'narrate_main' });
    const assembled = assembler.assemble(promptFacts, { budget: Math.max(1, parsed.contextWindow - parsed.maxOutputTokens), task: 'narrate_main' });
    setDebug((current) => ({ ...current, prompt: assembled }));
    setBusy(true); setReplyInProgress(true); setRequestStatus('requesting'); setFeedback(null); setPendingOps(null);
    let narrative = '';
    const assistantMessageId = newChatMessageId(selectedCharacterId);
    const splitter = new OpsStreamSplitter();
    try {
      await streamChat(parsed, assembled.messages, (delta) => {
        narrative += splitter.push(delta);
        setMessages(narrative ? [...baseMessages, { id: assistantMessageId, role: 'assistant', content: narrative, kind: 'dialogue', speakerId: selectedCharacterId }] : baseMessages);
      }, { taskId: 'narrate_main', onStatus: (status) => setRequestStatus(status) });
      const finished = splitter.finish();
      narrative += finished.text;
      if (!narrative.trim()) throw new Error('Provider 未返回可读正文。');
      const completed = [...baseMessages, { id: assistantMessageId, role: 'assistant' as const, content: narrative, kind: 'dialogue' as const, speakerId: selectedCharacterId }];
      setMessages(completed);
      const nextSave = structuredClone(saveRef.current);
      const removedMemories = removeRelationshipMemoriesFromMessage(nextSave.world, selectedCharacterId, latestAssistantIndex);
      if (removedMemories) commitSave(nextSave);
      await saveChat({ characterId: selectedCharacterId, messages: completed, updatedAt: now() });
      const parsedReply = await parseReply(finished.raw);
      const discardedOps = parsedReply.ops.length;
      const hadOpsBlock = finished.foundOps || finished.raw.includes('<ops>');
      markResponseSource('manual');
      setRegenerateInput('');
      setDebug((current) => ({ ...current, raw: finished.raw, ops: JSON.stringify({ stage: parsedReply.stage, parsedOps: discardedOps ? parsedReply.ops : [], discardedOps, warnings: [...parsedReply.warnings, ...(hadOpsBlock ? ['重生成响应中的 ops 已丢弃，未应用任何状态变化。'] : [])], message: '重生成只替换叙述正文。' }, null, 2) }));
      setFeedback({ tone: 'success', text: `${hadOpsBlock ? '已重新生成正文，响应中的状态操作已丢弃。' : '已重新生成正文。'}${removedMemories ? ` 已移除 ${removedMemories} 条旧记忆，后续生成将基于新文本。` : ''}` });
    } catch (error) {
      splitter.finish();
      setMessages(originalMessages);
      setRequestStatus('error'); setFeedback({ tone: 'error', text: errorMessage(error, '重新生成失败，原回复已保留。') });
    } finally { setBusy(false); setReplyInProgress(false); }
  }

  async function retryInterruptedReply(): Promise<void> {
    const recovery = chatRecoveryRef.current;
    if (!recovery || (recovery.status !== 'interrupted' && recovery.status !== 'error') || busy) return;
    const baseMessages = recoveryMessagesForRetry(recovery);
    updateChatRecovery(null);
    setMessages(baseMessages);
    setInput(recovery.input);
    setRequestStatus('idle');
    await generateReply(undefined, baseMessages);
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

  function applyReplyOps(reply: ParsedReply, actorId?: string, giftId?: string, messageIndex?: number, requestId?: string): boolean {
    if (requestId && (appliedRequestIdsRef.current.has(requestId) || (chatRecoveryRef.current?.requestId === requestId && chatRecoveryRef.current.opsApplied))) return true;
    if (reply.opsFailed) {
      setPendingOps({ raw: reply.raw, actorId, ...(messageIndex === undefined ? {} : { messageIndex }) });
      setManualOps('[]');
      setDebug((current) => ({ ...current, raw: reply.raw, ops: JSON.stringify({ stage: reply.stage, opsFailed: true, warnings: reply.warnings, message: '本回合未产生状态变更。' }, null, 2) }));
      setFeedback({ tone: 'info', text: '回复正文已保留，但状态变化解析失败；本回合未产生状态变更。' });
      return false;
    }

    const memoryOps = reply.ops.filter((op) => Boolean(op && typeof op === 'object' && (op as { op?: unknown }).op === 'add_memory'));
    const stagedMemoryOps: unknown[] = [];
    if (actorId && messageIndex !== undefined && chatEncounterEntryId) {
      for (const op of memoryOps) {
        const candidate = op as Partial<MemoryConsolidationCandidate> & { op?: unknown };
        if (candidate.target !== actorId || typeof candidate.text !== 'string') continue;
        const parsedCandidate = parseMemoryConsolidationResponse(JSON.stringify([{ target: candidate.target, text: candidate.text, type: candidate.type, importance: candidate.importance }]));
        if (parsedCandidate[0]) { pendingMemoryCandidatesRef.current.push({ ...parsedCandidate[0], sourceMessageIndices: [messageIndex] }); stagedMemoryOps.push(op); }
      }
    }
    const nextSave = structuredClone(saveRef.current);
    const logs: string[] = [];
    const world = nextSave.world;
    const applied = opRegistry.applyAll(reply.ops.filter((op) => !stagedMemoryOps.includes(op)), {
      world,
      actorId,
      day: world.clock.day,
      slotId: world.clock.slotId,
      nodeId: world.player.nodeId,
      calendar: nextSave.config.calendar,
      actionCosts: nextSave.config.actionCosts,
      encounterConfig: nextSave.config.encounter,
      axisDefs: nextSave.config.axisDefs,
      stageRules: nextSave.config.stageRules,
      events: promptEvents,
      ...(actorId && messageIndex !== undefined ? { memorySource: { chatCharacterId: actorId, messageIndex } } : {}),
      log: (message) => logs.push(message),
    }, nextSave.config.opsLimitPerTurn);
    if (applied.changes.length) commitSave(nextSave);
    if (requestId) appliedRequestIdsRef.current.add(requestId);
    if (requestId && chatRecoveryRef.current?.requestId === requestId) {
      updateChatRecovery({ ...chatRecoveryRef.current, opsApplied: true, status: 'error', updatedAt: now() });
    }
    promptEvents.emit('onOpsApply', { changes: applied.changes });
    setPendingOps(null);
    setManualOps('[]');
    setDebug((current) => ({ ...current, raw: reply.raw, ops: formatOpsDebug(reply, applied, logs) }));
    const issues = reply.warnings.length + applied.warnings.length + applied.rejected.length + applied.truncated;
    const resolvedGift = giftId ? nextSave.world.giftHistory.find((entry) => entry.id === giftId) : undefined;
    if (giftId && resolvedGift?.status === 'resolved') {
      setFeedback({ tone: resolvedGift.accepted ? 'success' : 'info', text: `${nextSave.world.characters[resolvedGift.charId]?.name ?? resolvedGift.charId} 对${nextSave.world.items[resolvedGift.itemId]?.name ?? resolvedGift.itemId}的反应：${giftReactionLabel(resolvedGift.reaction)}${resolvedGift.accepted ? '' : '（对方没有接受这份心意）'}。` });
    } else if (giftId) {
      setFeedback({ tone: 'info', text: '角色回复已保留，但本回合没有确认这件礼物的反应；可稍后重试。' });
    } else {
      setFeedback({ tone: issues ? 'info' : 'success', text: applied.changes.length ? `回复已生成并应用 ${applied.applied} 个状态操作。${memoryOps.length ? `另有 ${memoryOps.length} 条记忆候选将在告别时整理。` : ''}` : memoryOps.length ? `回复已生成；${memoryOps.length} 条记忆候选将在告别时整理。` : '回复已生成，本回合没有状态变化。' });
    }
    return true;
  }

  async function retryOpsExtraction(): Promise<void> {
    if (!pendingOps || busy) return;
    setBusy(true); setRequestStatus('requesting'); setFeedback({ tone: 'info', text: '正在重新提取状态变化…' });
    try {
      const reply = await parseReply(pendingOps.raw, extractOps);
      if (applyReplyOps(reply, pendingOps.actorId, undefined, pendingOps.messageIndex, pendingOps.requestId)) updateChatRecovery(null);
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
    if (applyReplyOps({ ...reply, raw: pendingOps.raw }, pendingOps.actorId, undefined, pendingOps.messageIndex, pendingOps.requestId)) updateChatRecovery(null);
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

  function parseEditedEmbeddingConfig(): EmbeddingConfig {
    return EmbeddingConfigSchema.parse({ ...embeddingConfig, headers: parseHeadersDraft(embeddingHeadersDraft), updatedAt: now() });
  }

  function parseEditedTtsConfig(): TtsConfig {
    return TtsConfigSchema.parse({ ...ttsConfig, headers: parseHeadersDraft(ttsHeadersDraft), updatedAt: now() });
  }

  async function persistEmbeddingResult(config: EmbeddingConfig, ok: boolean, message?: string): Promise<EmbeddingConfig> {
    const updated = EmbeddingConfigSchema.parse({ ...config, requestCount: config.requestCount + 1, failureCount: config.failureCount + (ok ? 0 : 1), lastStatus: ok ? 'success' : 'error', lastError: ok ? undefined : message, lastCalledAt: now(), updatedAt: now() });
    await providerDb.embeddingConfigs.put(updated);
    embeddingConfigRef.current = updated;
    setEmbeddingConfig(updated);
    return updated;
  }

  async function relationshipMemoryOverride(query: string, characterId: string): Promise<Record<string, SaveFile['world']['relations'][string]['memories']> | undefined> {
    const config = embeddingConfigRef.current;
    if (!config.enabled || !query.trim()) return undefined;
    const memories = saveRef.current.world.relations[characterId]?.memories ?? [];
    if (!memories.some((memory) => memory.archived !== true && memory.inject !== false)) return undefined;
    let requestAttempted = false;
    try {
      const existingRecords = await loadMemoryVectors(saveRef.current.meta.id, characterId);
      requestAttempted = true;
      const result = await queryVectorMemories({ config, saveId: saveRef.current.meta.id, characterId, query, memories, existingRecords });
      if (result.records.length) await saveMemoryVectors(result.records);
      await persistEmbeddingResult(config, true).catch(() => undefined);
      return { [characterId]: retrieveRelationshipMemoriesHybrid(saveRef.current.world, characterId, { query, nodeId: saveRef.current.world.player.nodeId, vectorScores: result.scores, requireKeywordMatch: false, limit: 5 }).map(({ memory }) => memory) };
    } catch (error) {
      const message = errorMessage(error, '向量记忆请求失败。');
      if (requestAttempted) await persistEmbeddingResult(config, false, message).catch(() => undefined);
      return undefined;
    }
  }

  async function saveEmbeddingSettings(): Promise<void> {
    try {
      const parsed = parseEditedEmbeddingConfig();
      await providerDb.embeddingConfigs.put(parsed);
      embeddingConfigRef.current = parsed;
      setEmbeddingConfig(parsed);
      setFeedback({ tone: 'success', text: parsed.enabled ? '向量记忆 API 已启用并保存。' : '向量记忆设置已保存；当前保持关闭。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '向量记忆配置无效。') }); }
  }

  async function testEmbeddingConnection(): Promise<void> {
    setEmbeddingBusy(true);
    let config: EmbeddingConfig | undefined;
    try {
      config = parseEditedEmbeddingConfig();
      if (!config.endpoint.trim() || !config.model.trim()) throw new Error('请填写 embedding 请求端点和模型。');
      const vectors = await createEmbeddings({ endpoint: config.endpoint, model: config.model, apiKey: config.apiKey, headers: config.headers, texts: ['Tokimeki 向量记忆连接测试'] });
      await persistEmbeddingResult(config, true);
      setFeedback({ tone: 'success', text: `Embedding 连接成功，返回 ${vectors[0]?.length ?? 0} 维向量。` });
    } catch (error) {
      const message = errorMessage(error, 'Embedding 连接失败。');
      if (config) await persistEmbeddingResult(config, false, message);
      setFeedback({ tone: 'error', text: message });
    } finally { setEmbeddingBusy(false); }
  }

  async function rebuildEmbeddingIndex(): Promise<void> {
    setEmbeddingBusy(true);
    const config = embeddingConfigRef.current;
    let requestAttempted = false;
    try {
      if (!config.enabled) throw new Error('请先启用并保存向量记忆 API。');
      const entries = Object.entries(saveRef.current.world.relations).flatMap(([characterId, relation]) => (relation.memories ?? []).map((memory) => ({ characterId, memory })));
      const eligibleCount = entries.filter(({ memory }) => memory.archived !== true && memory.inject !== false).length;
      if (!eligibleCount) { setFeedback({ tone: 'info', text: '当前世界没有可注入的关系记忆，无需重建索引。' }); return; }
      requestAttempted = true;
      const records = await rebuildVectorMemoryRecords({ config, saveId: saveRef.current.meta.id, entries });
      await clearMemoryVectors(saveRef.current.meta.id);
      if (records.length) await saveMemoryVectors(records);
      await persistEmbeddingResult(config, true);
      setFeedback({ tone: 'success', text: `向量索引已重建，共 ${records.length} 条可注入记忆。` });
    } catch (error) {
      const message = errorMessage(error, '向量索引重建失败。');
      if (requestAttempted) await persistEmbeddingResult(config, false, message).catch(() => undefined);
      setFeedback({ tone: 'error', text: message });
    } finally { setEmbeddingBusy(false); }
  }

  async function persistTtsResult(config: TtsConfig, status: TtsConfig['lastStatus'], message?: string, pendingRequest: TtsConfig['pendingRequest'] | null = config.pendingRequest): Promise<TtsConfig> {
    const updated = TtsConfigSchema.parse({ ...config, requestCount: status === 'requesting' ? config.requestCount : config.requestCount + 1, failureCount: status === 'error' ? config.failureCount + 1 : config.failureCount, lastStatus: status, lastError: status === 'error' ? message : undefined, lastCalledAt: status === 'requesting' ? config.lastCalledAt : now(), pendingRequest: pendingRequest === null ? undefined : pendingRequest, updatedAt: now() });
    await providerDb.ttsConfigs.put(updated);
    ttsConfigRef.current = updated;
    setTtsConfig(updated); setTtsConfigs((items) => items.some((item) => item.id === updated.id) ? items.map((item) => item.id === updated.id ? updated : item) : [...items, updated]);
    return updated;
  }

  async function saveTtsSettings(): Promise<void> {
    try {
      const parsed = parseEditedTtsConfig();
      const nextDefault = defaultTtsConfigId || parsed.id;
      await providerDb.transaction('rw', providerDb.ttsConfigs, providerDb.settings, async () => {
        await providerDb.ttsConfigs.put(parsed);
        if (!defaultTtsConfigId) await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultTtsProviderId', value: parsed.id }));
      });
      ttsConfigRef.current = parsed;
      setTtsConfig(parsed); setTtsConfigs((items) => [...items.filter((item) => item.id !== parsed.id), parsed]);
      if (!defaultTtsConfigId) setDefaultTtsConfigId(nextDefault);
      setFeedback({ tone: 'success', text: parsed.enabled ? '语音 API 已启用并保存。' : '语音设置已保存；当前保持关闭。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '语音配置无效。') }); }
  }

  function selectTtsConfig(id: string): void {
    const selected = ttsConfigs.find((item) => item.id === id);
    if (!selected) return;
    ttsConfigRef.current = selected;
    setTtsConfig(selected);
  }

  function createTtsConfigDraft(): void {
    const draft = newTtsConfig();
    ttsConfigRef.current = draft;
    setTtsConfig(draft);
  }

  async function deleteTtsConfig(): Promise<void> {
    if (!ttsConfigs.some((item) => item.id === ttsConfig.id)) return;
    if (ttsConfig.id === defaultTtsConfigId) { setFeedback({ tone: 'error', text: '默认语音配置正在使用，请先切换默认配置后再删除。' }); return; }
    const references = characterBindings.filter((binding) => binding.ttsProviderId === ttsConfig.id);
    if (references.length) {
      const sourceList = references.slice(0, 3).map((binding) => `${binding.saveId}/${binding.characterId}`).join('、');
      const suffix = references.length > 3 ? '等' : '';
      setFeedback({ tone: 'error', text: `该语音配置仍被 ${references.length} 个角色绑定（${sourceList}${suffix}），请先解除角色绑定后再删除。` });
      return;
    }
    await providerDb.ttsConfigs.delete(ttsConfig.id);
    const remaining = ttsConfigs.filter((item) => item.id !== ttsConfig.id);
    setTtsConfigs(remaining);
    const selected = remaining[0] ?? newTtsConfig();
    ttsConfigRef.current = selected; setTtsConfig(selected);
    setFeedback({ tone: 'success', text: '语音配置已删除。' });
  }

  async function updateDefaultTtsConfig(id: string): Promise<void> {
    if (!ttsConfigs.some((item) => item.id === id)) return;
    await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultTtsProviderId', value: id }));
    setDefaultTtsConfigId(id);
    selectTtsConfig(id);
    setFeedback({ tone: 'success', text: '默认语音配置已更新。' });
  }

  async function testTtsConnection(): Promise<void> {
    if (ttsBusyRef.current) return;
    ttsBusyRef.current = true; setTtsBusy(true);
    let config: TtsConfig | undefined;
    try {
      config = parseEditedTtsConfig();
      if (!config.endpoint.trim() || !config.model.trim() || !config.voice.trim()) throw new Error('请填写语音端点、模型和 voice。');
      const result = await synthesizeSpeech({ ...config, enabled: true }, 'Tokimeki 语音连接测试');
      await persistTtsResult(config, 'success');
      setFeedback({ tone: 'success', text: `语音连接成功，收到 ${result.format} 音频。` });
    } catch (error) {
      const message = errorMessage(error, '语音连接失败。');
      if (config) await persistTtsResult(config, 'error', message);
      setFeedback({ tone: 'error', text: message });
    } finally { ttsBusyRef.current = false; setTtsBusy(false); }
  }

  async function saveImageSettings(input?: ImageConfig): Promise<void> {
    try {
      const draft = input ?? imageConfigRef.current;
      if (draft.providerId && !providers.some((item) => item.id === draft.providerId && item.kind === 'openai-compatible')) throw new Error('所选图像 Provider 不存在或不是 OpenAI-compatible。');
      const parsed = ImageConfigSchema.parse({ ...draft, updatedAt: now(), lastStatus: draft.lastStatus === 'requesting' ? 'idle' : draft.lastStatus });
      await providerDb.transaction('rw', providerDb.imageConfigs, providerDb.bindings, async () => {
        await providerDb.imageConfigs.put(parsed);
        if (parsed.providerId) await providerDb.bindings.put(ProviderBindingSchema.parse({ taskId: 'image', providerId: parsed.providerId }));
        else await providerDb.bindings.delete('image');
      });
      setBindings((items) => parsed.providerId ? [...items.filter((item) => item.taskId !== 'image'), { taskId: 'image', providerId: parsed.providerId }] : items.filter((item) => item.taskId !== 'image'));
      imageConfigRef.current = parsed;
      setImageConfig(parsed);
      setFeedback({ tone: 'success', text: '图像生成设置已保存到此浏览器。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '图像生成设置无效。') }); }
  }

  async function testImageConnection(input?: ImageConfig): Promise<void> {
    if (imageBusyRef.current) return;
    let config: ImageConfig;
    try { config = ImageConfigSchema.parse(input ?? imageConfigRef.current); }
    catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '图像生成设置无效。') }); return; }
    const selectedProvider = providers.find((item) => item.id === config.providerId);
    if (!selectedProvider) { setFeedback({ tone: 'error', text: '请先在图像页面选择一个普通 Provider。' }); return; }
    if (selectedProvider.kind !== 'openai-compatible') { setFeedback({ tone: 'error', text: '首版图像生成只支持 OpenAI-compatible Provider。' }); return; }
    if (!selectedProvider.model.trim() || !selectedProvider.endpoint.trim()) { setFeedback({ tone: 'error', text: '请先完善所选 Provider 的端点和模型。' }); return; }
    imageBusyRef.current = true; setImageBusy(true);
    const startedAt = Date.now();
    const requesting = ImageConfigSchema.parse({ ...config, lastStatus: 'requesting', lastError: undefined, lastCalledAt: now(), updatedAt: now() });
    imageConfigRef.current = requesting; setImageConfig(requesting); await providerDb.imageConfigs.put(requesting);
    try {
      await generateImage(selectedProvider, 'Tokimeki 图像连接测试', { size: config.size, quality: config.quality, style: config.style, responseFormat: config.responseFormat, referenceMode: 'none' });
      const success = ImageConfigSchema.parse({ ...requesting, lastStatus: 'success', requestCount: requesting.requestCount + 1, updatedAt: now() });
      imageConfigRef.current = success; setImageConfig(success); await providerDb.imageConfigs.put(success);
      setFeedback({ tone: 'success', text: `图像 Provider 连接成功（${Date.now() - startedAt} ms）。` });
    } catch (error) {
      const message = errorMessage(error, '图像 Provider 连接失败。');
      const failed = ImageConfigSchema.parse({ ...requesting, lastStatus: 'error', requestCount: requesting.requestCount + 1, failureCount: requesting.failureCount + 1, lastError: message, updatedAt: now() });
      imageConfigRef.current = failed; setImageConfig(failed); await providerDb.imageConfigs.put(failed);
      setFeedback({ tone: 'error', text: message });
    } finally { imageBusyRef.current = false; setImageBusy(false); }
  }

  async function saveImageVisualConfig(characterId: string, appearancePrompt: string): Promise<void> {
    const existing = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
    const record = ImageVisualConfigSchema.parse({ ...existing, id: imageCharacterConfigId(saveRef.current.meta.id, characterId), saveId: saveRef.current.meta.id, characterId, appearancePrompt, updatedAt: now() });
    await providerDb.imageVisualConfigs.put(record);
    setImageVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
    setFeedback({ tone: 'success', text: '角色外貌提示词已保存到当前世界。' });
  }

  async function setCharacterFaceLock(characterId: string, enabled: boolean): Promise<void> {
    const existing = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
    const record = ImageVisualConfigSchema.parse({ ...existing, id: imageCharacterConfigId(saveRef.current.meta.id, characterId), saveId: saveRef.current.meta.id, characterId, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: enabled, updatedAt: now() });
    await providerDb.imageVisualConfigs.put(record);
    setImageVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
  }

  async function importCharacterFaceReference(characterId: string, file?: File | string): Promise<void> {
    if (typeof file === 'string') return setCharacterFaceReferenceUrl(characterId, file);
    if (!file) return;
    let assetId: string | undefined;
    try {
      const image = await downsampleImage(file, 1600, 0.9);
      assetId = `face-character-${characterId}-${Date.now()}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const existing = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
      const previousAssetId = storedAssetId(existing?.referenceImage);
      const record = ImageVisualConfigSchema.parse({ ...existing, id: imageCharacterConfigId(saveRef.current.meta.id, characterId), saveId: saveRef.current.meta.id, characterId, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId }, updatedAt: now() });
      await providerDb.imageVisualConfigs.put(record);
      setImageVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
      if (previousAssetId && previousAssetId !== assetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: '角色锁脸参考图已保存到当前世界。' });
    } catch (error) {
      if (assetId) await deleteImageAssetIfUnreferenced(assetId).catch(() => undefined);
      setFeedback({ tone: 'error', text: errorMessage(error, '角色锁脸参考图导入失败。') });
    }
  }

  async function setCharacterFaceReferenceUrl(characterId: string, input: string): Promise<void> {
    try {
      const referenceImage = externalImageAssetRef(input);
      const existing = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
      const previousAssetId = storedAssetId(existing?.referenceImage);
      const record = ImageVisualConfigSchema.parse({ ...existing, id: imageCharacterConfigId(saveRef.current.meta.id, characterId), saveId: saveRef.current.meta.id, characterId, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: true, referenceImage, updatedAt: now() });
      await providerDb.imageVisualConfigs.put(record);
      setImageVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
      if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'info', text: '角色锁脸外链已保存。外链不会下载或发送给 Provider，生成时仅使用固定外貌提示词。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '角色锁脸外链无效。') }); }
  }

  async function removeCharacterFaceReference(characterId: string): Promise<void> {
    const existing = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
    if (!existing?.referenceImage) return;
    const previousAssetId = storedAssetId(existing.referenceImage);
    const { referenceImage: _referenceImage, ...withoutReference } = existing;
    const record = ImageVisualConfigSchema.parse({ ...withoutReference, lockFaceEnabled: false, updatedAt: now() });
    await providerDb.imageVisualConfigs.put(record);
    setImageVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
    if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
    setFeedback({ tone: 'success', text: '角色锁脸参考图已移除。' });
  }

  async function saveUserImageVisualConfig(appearancePrompt: string): Promise<void> {
    const identity = currentImageIdentity(saveRef.current.world.player.personaId);
    const id = imageUserConfigId(saveRef.current.meta.id, identity);
    const existing = imageUserVisualConfigs.find((item) => item.id === id);
    const record = ImageUserVisualConfigSchema.parse({ ...existing, id, saveId: saveRef.current.meta.id, identityId: identity.id, identityKind: identity.kind, appearancePrompt, updatedAt: now() });
    await providerDb.imageUserVisualConfigs.put(record);
    setImageUserVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
    setFeedback({ tone: 'success', text: '用户外貌描述已保存到当前世界和当前身份。' });
  }

  async function setUserFaceLock(enabled: boolean): Promise<void> {
    const identity = currentImageIdentity(saveRef.current.world.player.personaId);
    const id = imageUserConfigId(saveRef.current.meta.id, identity);
    const existing = imageUserVisualConfigs.find((item) => item.id === id);
    const record = ImageUserVisualConfigSchema.parse({ ...existing, id, saveId: saveRef.current.meta.id, identityId: identity.id, identityKind: identity.kind, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: enabled, updatedAt: now() });
    await providerDb.imageUserVisualConfigs.put(record);
    setImageUserVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
  }

  async function importUserFaceReference(file?: File | string): Promise<void> {
    if (typeof file === 'string') return setUserFaceReferenceUrl(file);
    if (!file) return;
    let assetId: string | undefined;
    try {
      const identity = currentImageIdentity(saveRef.current.world.player.personaId);
      const id = imageUserConfigId(saveRef.current.meta.id, identity);
      const image = await downsampleImage(file, 1600, 0.9);
      assetId = `face-user-${identity.id}-${Date.now()}`;
      await saveAsset({ id: assetId, blob: image.blob, mimeType: image.mimeType, width: image.width, height: image.height, createdAt: now() });
      const existing = imageUserVisualConfigs.find((item) => item.id === id);
      const previousAssetId = storedAssetId(existing?.referenceImage);
      const record = ImageUserVisualConfigSchema.parse({ ...existing, id, saveId: saveRef.current.meta.id, identityId: identity.id, identityKind: identity.kind, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: true, referenceImage: { kind: 'stored', assetId }, updatedAt: now() });
      await providerDb.imageUserVisualConfigs.put(record);
      setImageUserVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
      if (previousAssetId && previousAssetId !== assetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'success', text: '用户锁脸参考图已保存到当前世界和当前身份。' });
    } catch (error) {
      if (assetId) await deleteImageAssetIfUnreferenced(assetId).catch(() => undefined);
      setFeedback({ tone: 'error', text: errorMessage(error, '用户锁脸参考图导入失败。') });
    }
  }

  async function setUserFaceReferenceUrl(input: string): Promise<void> {
    try {
      const identity = currentImageIdentity(saveRef.current.world.player.personaId);
      const id = imageUserConfigId(saveRef.current.meta.id, identity);
      const referenceImage = externalImageAssetRef(input);
      const existing = imageUserVisualConfigs.find((item) => item.id === id);
      const previousAssetId = storedAssetId(existing?.referenceImage);
      const record = ImageUserVisualConfigSchema.parse({ ...existing, id, saveId: saveRef.current.meta.id, identityId: identity.id, identityKind: identity.kind, appearancePrompt: existing?.appearancePrompt ?? '', lockFaceEnabled: true, referenceImage, updatedAt: now() });
      await providerDb.imageUserVisualConfigs.put(record);
      setImageUserVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
      if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
      setFeedback({ tone: 'info', text: '用户锁脸外链已保存。外链不会下载或发送给 Provider，互动 CG 前仍需上传本地参考图。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '用户锁脸外链无效。') }); }
  }

  async function removeUserFaceReference(): Promise<void> {
    const identity = currentImageIdentity(saveRef.current.world.player.personaId);
    const id = imageUserConfigId(saveRef.current.meta.id, identity);
    const existing = imageUserVisualConfigs.find((item) => item.id === id);
    if (!existing?.referenceImage) return;
    const previousAssetId = storedAssetId(existing.referenceImage);
    const { referenceImage: _referenceImage, ...withoutReference } = existing;
    const record = ImageUserVisualConfigSchema.parse({ ...withoutReference, lockFaceEnabled: false, updatedAt: now() });
    await providerDb.imageUserVisualConfigs.put(record);
    setImageUserVisualConfigs((items) => [...items.filter((item) => item.id !== record.id), record]);
    if (previousAssetId) await deleteImageAssetIfUnreferenced(previousAssetId);
    setFeedback({ tone: 'success', text: '用户锁脸参考图已移除。' });
  }

  async function generateCharacterImage(characterId: string, target: 'avatar' | 'portrait', scenePrompt: string): Promise<void> {
    if (imageBusyRef.current) return;
    const character = saveRef.current.world.characters[characterId];
    if (!character) { setFeedback({ tone: 'error', text: '当前世界中没有这个角色。' }); return; }
    let config: ImageConfig;
    try { config = ImageConfigSchema.parse(imageConfigRef.current); }
    catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '图像设置无效。') }); return; }
    const provider = providers.find((item) => item.id === config.providerId && item.kind === 'openai-compatible');
    if (!provider) { setFeedback({ tone: 'error', text: '请先在图像设置中选择 OpenAI-compatible Provider。' }); return; }
    const visualConfig = imageVisualConfigs.find((item) => item.saveId === saveRef.current.meta.id && item.characterId === characterId);
    let prompt: string;
    try { prompt = buildCharacterImagePrompt({ scenePrompt, stylePrompt: config.stylePrompt, appearancePrompt: visualConfig?.appearancePrompt }); }
    catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '请先填写图像生成要求。') }); return; }
    let referenceImage: Blob | undefined;
    const externalFaceReference = Boolean(visualConfig?.lockFaceEnabled && visualConfig.referenceImage?.kind === 'url');
    const referenceAssetId = faceReferenceAssetIdForGeneration(visualConfig, config.referenceMode);
    try {
      if (referenceAssetId) {
        const stored = await loadAsset(referenceAssetId);
        if (!stored?.blob.size) throw new Error('角色锁脸参考图不存在，请重新上传或关闭锁脸。');
        referenceImage = stored.blob;
      }
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '角色锁脸参考图读取失败。') }); return; }
    imageBusyRef.current = true; setImageBusy(true);
    const requesting = ImageConfigSchema.parse({ ...config, lastStatus: 'requesting', lastCalledAt: now(), updatedAt: now() });
    imageConfigRef.current = requesting; setImageConfig(requesting); await providerDb.imageConfigs.put(requesting);
    let generatedAssetId: string | undefined;
    try {
      const result = await generateImage(provider, prompt, { size: config.size, quality: config.quality, style: config.style, responseFormat: config.responseFormat, referenceMode: config.referenceMode, editEndpoint: config.editEndpoint, referenceImage });
      const blob = await generatedImageToBlob(result);
      generatedAssetId = `image-result-${target}-${characterId}-${Date.now()}`;
      await saveAsset({ id: generatedAssetId, blob, mimeType: blob.type || 'image/png', width: undefined, height: undefined, createdAt: now() });
      const previousAssetId = requesting.lastGenerated?.asset.assetId;
      const success = ImageConfigSchema.parse({ ...requesting, lastStatus: 'success', requestCount: requesting.requestCount + 1, lastGenerated: { asset: { kind: 'stored', assetId: generatedAssetId }, prompt, label: `${character.name} · ${target === 'avatar' ? '头像构图' : '立绘构图'}`, generatedAt: now() }, updatedAt: now() });
      imageConfigRef.current = success; setImageConfig(success); await providerDb.imageConfigs.put(success);
      if (previousAssetId && previousAssetId !== generatedAssetId) await deleteImageAssetIfUnreferenced(previousAssetId).catch(() => undefined);
      setFeedback({ tone: externalFaceReference ? 'info' : 'success', text: externalFaceReference ? `${character.name}的构图已生成；锁脸外链没有下载或发送，本次只使用固定外貌提示词。` : `${character.name}的${target === 'avatar' ? '头像构图' : '立绘构图'}已生成；没有替换角色视觉，可预览或下载后自行上传。` });
    } catch (error) {
      if (generatedAssetId) await deleteAsset(generatedAssetId).catch(() => undefined);
      const message = errorMessage(error, '图像生成失败。');
      const failed = ImageConfigSchema.parse({ ...requesting, lastStatus: 'error', requestCount: requesting.requestCount + 1, failureCount: requesting.failureCount + 1, lastError: message, updatedAt: now() });
      imageConfigRef.current = failed; setImageConfig(failed); await providerDb.imageConfigs.put(failed);
      setFeedback({ tone: 'error', text: `${message} 原有独立生成结果与角色视觉均保持不变。` });
    } finally { imageBusyRef.current = false; setImageBusy(false); }
  }

  async function deleteStandaloneGeneratedImage(): Promise<void> {
    const previousAssetId = imageConfigRef.current.lastGenerated?.asset.assetId;
    if (!previousAssetId) return;
    const { lastGenerated: _lastGenerated, ...rest } = imageConfigRef.current;
    const next = ImageConfigSchema.parse({ ...rest, updatedAt: now() });
    imageConfigRef.current = next; setImageConfig(next); await providerDb.imageConfigs.put(next);
    await deleteImageAssetIfUnreferenced(previousAssetId);
    await refreshImageAssetStats();
    setFeedback({ tone: 'success', text: '独立生成图片已删除，角色头像和立绘没有变化。' });
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
    const characterReferences = characterBindings.filter((binding) => binding.providerId === provider.id);
    if (characterReferences.length) {
      const sourceList = characterReferences.slice(0, 3).map((binding) => `${binding.saveId}/${binding.characterId}`).join('、');
      const suffix = characterReferences.length > 3 ? '等' : '';
      setFeedback({ tone: 'error', text: `该 Provider 仍被 ${characterReferences.length} 个角色绑定（${sourceList}${suffix}），请先解除角色绑定后再删除。` });
      return;
    }
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

  async function updateCharacterProviderBinding(characterId: string, kind: 'provider' | 'tts', providerId: string): Promise<void> {
    const saveId = saveRef.current.meta.id;
    const current = characterBindings.find((item) => item.saveId === saveId && item.characterId === characterId);
    const nextProviderId = kind === 'provider' ? providerId || undefined : current?.providerId;
    const nextTtsProviderId = kind === 'tts' ? providerId || undefined : current?.ttsProviderId;
    const nextId = current?.id ?? `${saveId}:${characterId}`;
    const raw = { id: nextId, saveId, characterId, ...(nextProviderId ? { providerId: nextProviderId } : {}), ...(nextTtsProviderId ? { ttsProviderId: nextTtsProviderId } : {}) };
    const parsed = nextProviderId || nextTtsProviderId ? CharacterProviderBindingSchema.parse(raw) : undefined;
    if (parsed) await providerDb.characterBindings.put(parsed);
    else await providerDb.characterBindings.delete(nextId);
    setCharacterBindings((items) => parsed ? [...items.filter((item) => item.id !== parsed.id), parsed] : items.filter((item) => item.id !== nextId));
    setFeedback({ tone: 'success', text: `${kind === 'provider' ? '普通 Provider' : '语音 Provider'}绑定已更新。` });
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
      const current = presetBundles.find((bundle) => bundle.id === selectedPresetBundleId);
      const bundle = current ?? { id: `bundle-${slug(name)}`, name: `${name}预设包`, entries: [], updatedAt: now() };
      const existing = bundle.entries.find((entry) => entry.id === id);
      const item = await savePreset({ id, name, systemPrompt: draftText, enabled: existing?.enabled ?? true, temperature: existing?.temperature ?? 0.7, maxOutputTokens: existing?.maxOutputTokens ?? 1024, updatedAt: now() });
      const entries = existing ? bundle.entries.map((entry) => entry.id === id ? item : entry) : [...bundle.entries, item];
      const updated = await savePresetBundle({ ...bundle, entries, updatedAt: now() });
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

  async function setPresetEntryEnabled(bundleId: string, entryId: string, enabled: boolean): Promise<void> {
    const current = presetBundles.find((bundle) => bundle.id === bundleId);
    if (!current) return;
    const entries = current.entries.map((entry) => entry.id === entryId ? { ...entry, enabled, updatedAt: now() } : entry);
    const bundle = await savePresetBundle({ ...current, entries, updatedAt: now() });
    const changed = bundle.entries.find((entry) => entry.id === entryId);
    setPresetBundles((items) => items.map((item) => item.id === bundle.id ? bundle : item));
    if (changed) setPresets((items) => items.map((item) => item.id === changed.id ? changed : item));
    setFeedback({ tone: 'success', text: `${changed?.name ?? '预设条目'}已${enabled ? '启用' : '停用'}。` });
  }

  async function movePresetEntry(bundleId: string, entryId: string, direction: -1 | 1): Promise<void> {
    const current = presetBundles.find((bundle) => bundle.id === bundleId);
    if (!current) return;
    const index = current.entries.findIndex((entry) => entry.id === entryId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.entries.length) return;
    const entries = [...current.entries];
    [entries[index], entries[target]] = [entries[target], entries[index]];
    const bundle = await savePresetBundle({ ...current, entries, updatedAt: now() });
    setPresetBundles((items) => items.map((item) => item.id === bundle.id ? bundle : item));
    setFeedback({ tone: 'success', text: `${entries[target].name}已${direction < 0 ? '上移' : '下移'}。` });
  }

  async function removePresetBundle(id: string): Promise<void> {
    if (id === BUILTIN_NARRATION_PRESET_BUNDLE_ID) { setFeedback({ tone: 'info', text: '内置预设包不能删除；可以停用条目或编辑条目内容。' }); return; }
    await deletePresetBundle(id);
    const remaining = presetBundles.filter((item) => item.id !== id);
    setPresetBundles(remaining);
    if (selectedPresetBundleId === id) setSelectedPresetBundleId(remaining[0]?.id ?? '');
    setFeedback({ tone: 'success', text: '预设包已删除。' });
  }

  async function downloadSave() {
    if (selectedCharacterId) await saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
    const extras: Record<string, unknown> = { characters, worldbooks, presets, presetBundles };
    const assetMeta: Record<string, { mimeType: string; width?: number; height?: number; category?: 'voice' | 'image' | 'music'; cacheFingerprint?: string; audioFormat?: string; durationMs?: number; voiceRequestId?: string }> = {};
    const exportedChats = includeChatsOnExport ? await contentDb.chats.toArray() : [];
    if (includeChatsOnExport) extras.chats = exportedChats;
    const assets: Record<string, Uint8Array> = {};
    const assetRefs: AssetRef[] = [
      saveRef.current.world.map.view.background,
      ...Object.values(saveRef.current.world.map.nodes).map((node) => node.sceneBackground),
      ...Object.values(saveRef.current.world.characters).flatMap((character) => [character.visuals.avatar, ...character.visuals.portraits.map((portrait) => portrait.image)]),
      ...Object.values(saveRef.current.world.npcs).flatMap((npc) => [npc.visuals?.avatar]),
      ...Object.values(saveRef.current.world.terminal.messageThreads).flatMap((thread) => thread.map((message) => message.asset)),
      ...exportedChats.flatMap((record) => record.messages.flatMap((message) => [message.voice?.asset, message.cg?.asset])),
      ...(await listTerminalStickers()).map((sticker) => sticker.asset),
    ].filter((ref): ref is AssetRef => Boolean(ref));
    for (const ref of assetRefs) if (ref.kind === 'stored' && !assets[ref.assetId]) {
      const asset = await loadAsset(ref.assetId);
      if (asset) { assets[asset.id] = new Uint8Array(await asset.blob.arrayBuffer()); assetMeta[asset.id] = { mimeType: asset.mimeType, width: asset.width, height: asset.height, category: asset.category, cacheFingerprint: asset.cacheFingerprint, audioFormat: asset.audioFormat, durationMs: asset.durationMs, voiceRequestId: asset.voiceRequestId }; }
    }
    if (Object.keys(assetMeta).length) extras.assetMeta = assetMeta;
    const blob = await exportSaveZip(saveRef.current, assets, extras);
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    anchor.href = url; anchor.download = 'tokimeki-save.zip'; anchor.click(); URL.revokeObjectURL(url);
    setFeedback({ tone: 'success', text: `存档已导出${includeChatsOnExport ? '，包含聊天记录' : '，未包含聊天记录'}；Provider 配置与 API key 未包含在内。` });
  }

  async function clearAllChats(): Promise<void> {
    if (!window.confirm('确定清除全部聊天记录吗？此操作不可撤销。')) return;
    const voiceAssetIds = [...new Set((await contentDb.chats.toArray()).flatMap((record) => record.messages.map((message) => storedAssetId(message.voice?.asset)).filter((id): id is string => Boolean(id))))];
    const cgAssetIds = [...new Set((await contentDb.chats.toArray()).flatMap((record) => record.messages.map((message) => storedAssetId(message.cg?.asset)).filter((id): id is string => Boolean(id))))];
    await clearChats();
    setMessages([]); setLoadedChatCharacterId(selectedCharacterId);
    for (const assetId of voiceAssetIds) await deleteVoiceAssetIfUnreferenced(assetId);
    for (const assetId of cgAssetIds) await deleteImageAssetIfUnreferenced(assetId);
    setFeedback({ tone: 'success', text: '全部聊天记录已清除；角色卡、世界状态和其他资料未受影响。' });
  }

  async function importTextContent(kind: TextImportKind, file?: File): Promise<void> {
    if (!file) return;
    try {
      const sourceText = /\.docx$/i.test(file.name) ? await readDocxPlainText(file) : await file.text();
      const imported = importPlainText(kind, file.name, sourceText, now());
      if (kind === 'character') { const item = await saveCharacter(imported as CharacterCard); setCharacters((items) => [...items.filter((old) => old.id !== item.id), item]); }
      if (kind === 'worldbook') { const item = await saveWorldbook(imported as WorldbookEntry); setWorldbooks((items) => [...items.filter((old) => old.id !== item.id), item]); }
      if (kind === 'preset') { const item = await savePreset(imported as Preset); const current = presetBundles.find((bundle) => bundle.id === selectedPresetBundleId); const bundle = current ?? { id: `bundle-${slug(item.name)}`, name: `${item.name}预设包`, entries: [], updatedAt: now() }; const updated = await savePresetBundle({ ...bundle, entries: [...bundle.entries.filter((entry) => entry.id !== item.id), item], updatedAt: now() }); setPresets((items) => [...items.filter((old) => old.id !== item.id), item]); setPresetBundles((items) => [...items.filter((old) => old.id !== updated.id), updated]); if (!selectedPresetBundleId) setSelectedPresetBundleId(updated.id); }
      setFeedback({ tone: 'success', text: `${/\.docx$/i.test(file.name) ? 'DOCX' : 'TXT'} 已导入为${kind === 'character' ? '角色卡' : kind === 'worldbook' ? '世界书' : '预设'}，请继续编辑确认。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '文本导入失败。') }); }
  }

  async function downloadCharacterPackage(characterId: string, includeImages: boolean): Promise<void> {
    const character = saveRef.current.world.characters[characterId];
    if (!character) { setFeedback({ tone: 'error', text: '当前世界中没有这个正式角色。' }); return; }
    try {
      const card = characterCardForPackage(characters.find((item) => item.id === characterId), character, now());
      const assets: Record<string, Uint8Array> = {};
      const assetMeta: Record<string, { mimeType: string; width?: number; height?: number }> = {};
      let missing = 0;
      if (includeImages) for (const assetId of collectStoredAssetIds(card.packageProfile?.visuals)) {
        const asset = await loadAsset(assetId);
        if (!asset) { missing += 1; continue; }
        assets[assetId] = new Uint8Array(await asset.blob.arrayBuffer());
        assetMeta[assetId] = { mimeType: asset.mimeType, width: asset.width, height: asset.height };
      }
      const blob = await exportCharacterPackage(card, assets, assetMeta, saveRef.current.meta.appVersion);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `tokimeki-character-${slug(character.name)}.zip`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: missing ? 'info' : 'success', text: `角色包已导出（${includeImages ? '含本地图片' : '仅保留引用'}）${missing ? `；${missing} 个图片引用缺少本地二进制，未打包` : ''}。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '角色包导出失败。') }); }
  }

  async function loadCharacterPackage(file: File | undefined, addToWorld: boolean): Promise<void> {
    if (!file) return;
    const createdAssetIds: string[] = [];
    try {
      const imported = await importCharacterPackage(file);
      if (characters.some((item) => item.id === imported.card.id) && !window.confirm(`角色库中已有“${imported.card.name}”（${imported.card.id}）。确认用导入角色卡覆盖吗？`)) return;
      if (addToWorld && saveRef.current.world.characters[imported.card.id]) throw new Error('当前世界中已有相同 ID 的正式角色；请先选择仅加入角色库。');
      const replacements = new Map<string, string>();
      let index = 0;
      for (const [sourceId, bytes] of imported.assets) {
        const targetId = `character-package-${imported.card.id}-${Date.now()}-${index += 1}`;
        const meta = imported.assetMeta[sourceId];
        const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
        await saveAsset({ id: targetId, blob: new Blob([copy], { type: meta?.mimeType ?? 'application/octet-stream' }), mimeType: meta?.mimeType ?? 'application/octet-stream', width: meta?.width, height: meta?.height, createdAt: now() });
        createdAssetIds.push(targetId);
        replacements.set(sourceId, targetId);
      }
      const card = await saveCharacter(remapCharacterCardAssetIds({ ...imported.card, updatedAt: now() }, replacements));
      if (addToWorld) {
        const next = structuredClone(saveRef.current);
        const result = addCharacterToWorld(next.world, card);
        if (!result.ok) throw new Error(result.warning ?? '角色无法加入当前世界。');
        commitSave(next);
      }
      setCharacters((items) => [...items.filter((item) => item.id !== card.id), card]);
      const unresolved = [...collectStoredAssetIds(card.packageProfile?.visuals)].filter((assetId) => !createdAssetIds.includes(assetId) && !replacements.has(assetId));
      const missing = (await Promise.all(unresolved.map((assetId) => loadAsset(assetId)))).filter((asset) => !asset).length;
      setFeedback({ tone: missing ? 'info' : 'success', text: `角色包已导入${addToWorld ? '并加入当前世界' : '到角色库'}${missing ? `；${missing} 个仅引用图片在本机不存在，可稍后重新上传` : ''}。` });
    } catch (error) {
      for (const assetId of createdAssetIds) await deleteAsset(assetId).catch(() => undefined);
      setFeedback({ tone: 'error', text: errorMessage(error, '角色包导入失败，未覆盖现有角色。') });
    }
  }

  async function downloadWorldPackage(includeImages: boolean): Promise<void> {
    const current = saveRef.current;
    try {
      const pack = createWorldPackage({ id: `${current.meta.id}-world-package`, name: current.meta.title, map: sanitizeWorldMapForPackage(current.world.map), characters: current.world.characters, npcs: current.world.npcs, npcTemplates: current.world.npcTemplates, items: current.world.items, eventDefs: current.world.eventDefs, worldbooks, characterCards: characters });
      const assets: Record<string, Uint8Array> = {};
      const assetMeta: Record<string, { mimeType: string; width?: number; height?: number }> = {};
      let missing = 0;
      if (includeImages) for (const assetId of collectStoredAssetIds(pack)) {
        const asset = await loadAsset(assetId);
        if (!asset) { missing += 1; continue; }
        assets[assetId] = new Uint8Array(await asset.blob.arrayBuffer());
        assetMeta[assetId] = { mimeType: asset.mimeType, width: asset.width, height: asset.height };
      }
      const blob = await exportWorldPackage(pack, assets, assetMeta, current.meta.appVersion);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokimeki-world-${slug(current.meta.title)}.zip`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: missing ? 'info' : 'success', text: `世界包已导出（${includeImages ? '含本地图片' : '仅保留引用'}）${missing ? `；${missing} 个资产缺少本地二进制，未打包` : ''}。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '世界包导出失败。') }); }
  }

  async function loadWorldPackage(file: File | undefined): Promise<void> {
    if (!file) return;
    const createdAssetIds: string[] = [];
    try {
      const imported = await importWorldPackage(file);
      const current = saveRef.current;
      const conflicts = [...new Set([...Object.keys(imported.pack.map.nodes).filter((id) => current.world.map.nodes[id]), ...Object.keys(imported.pack.characters).filter((id) => current.world.characters[id]), ...Object.keys(imported.pack.npcs).filter((id) => current.world.npcs[id]), ...Object.keys(imported.pack.items).filter((id) => current.world.items[id]), ...Object.keys(imported.pack.eventDefs).filter((id) => current.world.eventDefs[id])])];
      if (conflicts.length && !window.confirm(`世界包包含 ${conflicts.length} 个与当前世界同 ID 的内容。确认覆盖这些静态内容吗？玩家进度不会被覆盖。`)) return;
      const replacements = new Map<string, string>(); let index = 0;
      for (const [sourceId, bytes] of imported.assets) { const targetId = `world-package-${Date.now()}-${index += 1}`; const meta = imported.assetMeta[sourceId]; const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes); await saveAsset({ id: targetId, blob: new Blob([copy], { type: meta?.mimeType ?? 'application/octet-stream' }), mimeType: meta?.mimeType ?? 'application/octet-stream', width: meta?.width, height: meta?.height, createdAt: now() }); createdAssetIds.push(targetId); replacements.set(sourceId, targetId); }
      const pack = remapWorldPackageAssetIds(imported.pack, replacements);
      const next = structuredClone(current);
      mergeWorldPackage(next.world, pack);
      commitSave(next);
      for (const item of pack.worldbooks) { const saved = await saveWorldbook(item); setWorldbooks((items) => [...items.filter((old) => old.id !== saved.id), saved]); }
      for (const card of pack.characterCards) { const saved = await saveCharacter(card); setCharacters((items) => [...items.filter((old) => old.id !== saved.id), saved]); }
      setFeedback({ tone: 'success', text: `世界包“${pack.name}”已合并；玩家时间、位置、关系、库存、终端和事件进度均已保留。` });
    } catch (error) { for (const assetId of createdAssetIds) await deleteAsset(assetId).catch(() => undefined); setFeedback({ tone: 'error', text: errorMessage(error, '世界包导入失败，当前世界未改变。') }); }
  }

  async function downloadEventPackage(): Promise<void> {
    const current = saveRef.current;
    try {
      const events = Object.values(current.world.eventDefs ?? {});
      if (!events.length) { setFeedback({ tone: 'info', text: '当前世界没有可导出的事件定义。' }); return; }
      const blob = await exportEventPackage({ id: `${current.meta.id}-events`, name: `${current.meta.title} 事件包`, events }, current.meta.appVersion, CURRENT_SCHEMA_VERSION);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokimeki-events-${slug(current.meta.title)}.zip`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: 'success', text: `已导出 ${events.length} 个事件定义。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '事件包导出失败。') }); }
  }

  async function loadEventPackage(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      const imported = await importEventPackage(file);
      const report = auditEventPackage(imported.pack, saveRef.current);
      if (report.errors.length) {
        setFeedback({ tone: 'error', text: `事件包检查失败：${report.errors.slice(0, 3).map((issue) => `${issue.eventId ?? ''} ${issue.message}`).join('；')}${report.errors.length > 3 ? `（另有 ${report.errors.length - 3} 项）` : ''}` });
        return;
      }
      if (report.warnings.length) {
        const warningText = report.warnings.slice(0, 4).map((issue) => `${issue.eventId ?? ''} ${issue.message}`).join('\n');
        if (!window.confirm(`事件包有 ${report.warnings.length} 项提示，可能导致事件较难触发：\n\n${warningText}\n\n仍要继续导入吗？`)) return;
      }
      const current = saveRef.current;
      const conflicts = imported.pack.events.filter((event) => current.world.eventDefs[event.id]).map((event) => event.id);
      if (conflicts.length && !window.confirm(`事件包包含 ${conflicts.length} 个与当前世界同 ID 的事件。确认覆盖这些事件定义吗？玩家进度不会被重置。`)) return;
      const next = structuredClone(current);
      installEventDefs(next.world, imported.pack.events);
      commitSave(next);
      setFeedback({ tone: 'success', text: `事件包“${imported.pack.name}”已安装：新增 ${imported.pack.events.length - conflicts.length} 个，覆盖 ${conflicts.length} 个。不会自动排程或触发事件。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '事件包导入失败，当前世界未改变。') }); }
  }

  async function downloadProviderSettings(selection: ProviderSettingsSelection): Promise<void> {
    try {
      const pack = createProviderSettingsPackage({ providers, ttsConfigs, bindings, characterBindings, imageConfig: imageConfigRef.current, saveId: saveRef.current.meta.id, defaultProviderId, defaultTtsProviderId: defaultTtsConfigId }, selection);
      const url = URL.createObjectURL(exportProviderSettingsPackage(pack)); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokimeki-provider-settings-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: 'success', text: `设置迁移包已导出：${pack.providers.length} 个普通 Provider、${pack.ttsConfigs.length} 个语音 Provider及图像选项。${selection.includeSecrets ? '已包含所选配置的 API key，请勿分享。' : 'API key 未导出。'}` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '设置迁移包导出失败。') }); }
  }

  async function applyProviderSettings(pack: ProviderSettingsPackage, selection: ProviderSettingsSelection): Promise<void> {
    try {
      const selected = createProviderSettingsPackage({ ...pack, saveId: 'package', characterBindings: pack.characterBindings.map((item) => ({ ...item, id: `package:${item.characterId}`, saveId: 'package' })) }, selection);
      const merged = mergeProviderSettingsPackage({ providers, ttsConfigs, bindings, characterBindings, imageConfig: imageConfigRef.current, saveId: saveRef.current.meta.id }, selected);
      await providerDb.transaction('rw', [providerDb.providers, providerDb.ttsConfigs, providerDb.bindings, providerDb.characterBindings, providerDb.imageConfigs, providerDb.settings], async () => {
        await providerDb.providers.bulkPut(merged.providers); await providerDb.ttsConfigs.bulkPut(merged.ttsConfigs); await providerDb.bindings.bulkPut(merged.bindings); await providerDb.characterBindings.bulkPut(merged.characterBindings);
        if (merged.imageConfig) await providerDb.imageConfigs.put(merged.imageConfig);
        if (selected.defaultProviderId) await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultProviderId', value: selected.defaultProviderId }));
        if (selected.defaultTtsProviderId) await providerDb.settings.put(ProviderSettingSchema.parse({ key: 'defaultTtsProviderId', value: selected.defaultTtsProviderId }));
      });
      setProviders(merged.providers); setTtsConfigs(merged.ttsConfigs); setBindings(merged.bindings); setCharacterBindings(merged.characterBindings);
      if (merged.imageConfig) { imageConfigRef.current = merged.imageConfig; setImageConfig(merged.imageConfig); }
      if (selected.defaultProviderId) setDefaultProviderId(selected.defaultProviderId); if (selected.defaultTtsProviderId) setDefaultTtsConfigId(selected.defaultTtsProviderId);
      setFeedback({ tone: 'success', text: `已导入 ${selected.providers.length} 个普通 Provider、${selected.ttsConfigs.length} 个语音 Provider。已有同 ID 配置的本机 API key 已保留。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '设置迁移包导入失败。') }); throw error; }
  }

  async function downloadGlobalBackup(includeSecrets: boolean): Promise<void> {
    try {
      const assets = await listAssets();
      const [currentSave, snapshots, characters, personas, worldbooks, presets, presetBundles, storyScenePresets, chats, chatRecovery, memoryVectors, musicStates, terminalStickers, ps, tts, bs, cbs, imageConfigs, imageVisuals, imageUserVisuals, settings] = await Promise.all([loadCurrentSave(), listSnapshots(), contentDb.characters.toArray(), contentDb.personas.toArray(), contentDb.worldbooks.toArray(), contentDb.presets.toArray(), contentDb.presetBundles.toArray(), contentDb.storyScenePresets.toArray(), contentDb.chats.toArray(), contentDb.chatRecovery.toArray(), contentDb.memoryVectors.toArray(), contentDb.musicStates.toArray(), contentDb.terminalStickers.toArray(), providerDb.providers.toArray(), providerDb.ttsConfigs.toArray(), providerDb.bindings.toArray(), providerDb.characterBindings.toArray(), providerDb.imageConfigs.toArray(), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray(), providerDb.settings.toArray()]);
      const localStorage = collectTokimekiPreferences(window.localStorage);
      const blob = await exportGlobalBackup({ currentSave, snapshots, content: { characters, personas, worldbooks, presets, presetBundles, storyScenePresets, chats, chatRecovery, memoryVectors, musicStates, terminalStickers }, providers: ps, ttsConfigs: tts, bindings: bs, characterBindings: cbs, imageConfigs, imageVisualConfigs: imageVisuals, imageUserVisualConfigs: imageUserVisuals, settings, localStorage, theme: collectThemeBackup(window.localStorage) }, assets, includeSecrets);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokimeki-global-backup-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: 'success', text: `全局备份已导出，包含 ${assets.length} 个资产${includeSecrets ? '（含 API key，请勿分享）' : '（不含 API key）'}。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '全局备份导出失败。') }); }
  }

  async function previewGlobalBackup(file?: File): Promise<void> {
    if (!file) return;
    try {
      const backup = await importGlobalBackup(file); setGlobalBackupPreview(backup);
      setFeedback({ tone: 'info', text: `已读取全局备份：${backup.data.providers.length} 个普通 Provider、${backup.data.ttsConfigs.length} 个语音 Provider、${backup.data.imageVisualConfigs.length + backup.data.imageUserVisualConfigs.length} 份视觉配置、${backup.assets.size} 个资产${backup.hasSecrets ? '，包含 API key' : ''}。尚未写入本地数据。` });
    } catch (error) { setGlobalBackupPreview(null); setFeedback({ tone: 'error', text: errorMessage(error, '全局备份读取失败，当前数据未改变。') }); }
  }

  async function restoreGlobalBackup(backup: ImportedGlobalBackup, selection: GlobalBackupRestoreSelection = { world: true, content: true, providers: true, assets: true, preferences: true }): Promise<void> {
    if (!window.confirm('恢复所选类别会覆盖当前浏览器中的对应本地数据。确定继续吗？')) return;
    const previous = {
      current: selection.world ? await loadCurrentSave() : undefined,
      snapshots: selection.world ? await listSnapshots() : [],
      content: selection.content ? { characters: await contentDb.characters.toArray(), personas: await contentDb.personas.toArray(), worldbooks: await contentDb.worldbooks.toArray(), presets: await contentDb.presets.toArray(), presetBundles: await contentDb.presetBundles.toArray(), storyScenePresets: await contentDb.storyScenePresets.toArray(), chats: await contentDb.chats.toArray(), chatRecovery: await contentDb.chatRecovery.toArray(), memoryVectors: await contentDb.memoryVectors.toArray(), musicStates: await contentDb.musicStates.toArray(), terminalStickers: await contentDb.terminalStickers.toArray() } : undefined,
      providers: selection.providers ? { providers: await providerDb.providers.toArray(), ttsConfigs: await providerDb.ttsConfigs.toArray(), bindings: await providerDb.bindings.toArray(), characterBindings: await providerDb.characterBindings.toArray(), imageConfigs: await providerDb.imageConfigs.toArray(), imageVisualConfigs: await providerDb.imageVisualConfigs.toArray(), imageUserVisualConfigs: await providerDb.imageUserVisualConfigs.toArray(), settings: await providerDb.settings.toArray() } : undefined,
      assets: selection.assets ? await assetDb.assets.bulkGet([...backup.assets.keys()]) : [],
      preferences: selection.preferences ? collectTokimekiPreferences(window.localStorage) : {},
    };
    try {
      if (selection.world) { if (backup.data.currentSave) await saveCurrentSave(backup.data.currentSave); await saveSnapshotRecords(backup.data.snapshots); }
      if (selection.content) { await Promise.all([contentDb.characters.clear(), contentDb.personas.clear(), contentDb.worldbooks.clear(), contentDb.presets.clear(), contentDb.presetBundles.clear(), contentDb.storyScenePresets.clear(), contentDb.chats.clear(), contentDb.chatRecovery.clear(), contentDb.memoryVectors.clear(), contentDb.musicStates.clear(), contentDb.terminalStickers.clear()]); await Promise.all([contentDb.characters.bulkPut(backup.data.content.characters), contentDb.personas.bulkPut(backup.data.content.personas), contentDb.worldbooks.bulkPut(backup.data.content.worldbooks), contentDb.presets.bulkPut(backup.data.content.presets), contentDb.presetBundles.bulkPut(backup.data.content.presetBundles), contentDb.storyScenePresets.bulkPut(backup.data.content.storyScenePresets), contentDb.chats.bulkPut(backup.data.content.chats), contentDb.chatRecovery.bulkPut(backup.data.content.chatRecovery), contentDb.memoryVectors.bulkPut(backup.data.content.memoryVectors), contentDb.musicStates.bulkPut(backup.data.content.musicStates), contentDb.terminalStickers.bulkPut(backup.data.content.terminalStickers)]); }
      if (selection.providers) { await Promise.all([providerDb.providers.clear(), providerDb.ttsConfigs.clear(), providerDb.bindings.clear(), providerDb.characterBindings.clear(), providerDb.imageConfigs.clear(), providerDb.imageVisualConfigs.clear(), providerDb.imageUserVisualConfigs.clear(), providerDb.settings.clear()]); await Promise.all([providerDb.providers.bulkPut(backup.data.providers), providerDb.ttsConfigs.bulkPut(backup.data.ttsConfigs), providerDb.bindings.bulkPut(backup.data.bindings), providerDb.characterBindings.bulkPut(backup.data.characterBindings), providerDb.imageConfigs.bulkPut(backup.data.imageConfigs), providerDb.imageVisualConfigs.bulkPut(backup.data.imageVisualConfigs), providerDb.imageUserVisualConfigs.bulkPut(backup.data.imageUserVisualConfigs), providerDb.settings.bulkPut(backup.data.settings)]); }
      if (selection.preferences) restoreTokimekiPreferences(window.localStorage, { ...backup.data.localStorage, ...themeBackupPreferences(backup.data.theme) });
      if (selection.assets) for (const [id, bytes] of backup.assets) { const meta = backup.assetMeta[id]; const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes); await saveAsset({ id, blob: new Blob([copy], { type: meta?.mimeType ?? 'application/octet-stream' }), mimeType: meta?.mimeType ?? 'application/octet-stream', category: meta?.category, cacheFingerprint: meta?.cacheFingerprint, audioFormat: meta?.audioFormat, durationMs: meta?.durationMs, voiceRequestId: meta?.voiceRequestId, width: meta?.width, height: meta?.height, createdAt: meta?.createdAt ?? now() }); }
      window.location.reload();
    } catch (error) {
      try {
        if (selection.world) { if (previous.current) await saveCurrentSave(previous.current); else await saveDb.current.delete('current'); await saveDb.snapshots.clear(); await saveSnapshotRecords(previous.snapshots); }
        if (selection.content && previous.content) { await Promise.all([contentDb.characters.clear(), contentDb.personas.clear(), contentDb.worldbooks.clear(), contentDb.presets.clear(), contentDb.presetBundles.clear(), contentDb.storyScenePresets.clear(), contentDb.chats.clear(), contentDb.chatRecovery.clear(), contentDb.memoryVectors.clear(), contentDb.musicStates.clear(), contentDb.terminalStickers.clear()]); await Promise.all([contentDb.characters.bulkPut(previous.content.characters), contentDb.personas.bulkPut(previous.content.personas), contentDb.worldbooks.bulkPut(previous.content.worldbooks), contentDb.presets.bulkPut(previous.content.presets), contentDb.presetBundles.bulkPut(previous.content.presetBundles), contentDb.storyScenePresets.bulkPut(previous.content.storyScenePresets), contentDb.chats.bulkPut(previous.content.chats), contentDb.chatRecovery.bulkPut(previous.content.chatRecovery), contentDb.memoryVectors.bulkPut(previous.content.memoryVectors), contentDb.musicStates.bulkPut(previous.content.musicStates), contentDb.terminalStickers.bulkPut(previous.content.terminalStickers)]); }
        if (selection.providers && previous.providers) { await Promise.all([providerDb.providers.clear(), providerDb.ttsConfigs.clear(), providerDb.bindings.clear(), providerDb.characterBindings.clear(), providerDb.imageConfigs.clear(), providerDb.imageVisualConfigs.clear(), providerDb.imageUserVisualConfigs.clear(), providerDb.settings.clear()]); await Promise.all([providerDb.providers.bulkPut(previous.providers.providers), providerDb.ttsConfigs.bulkPut(previous.providers.ttsConfigs), providerDb.bindings.bulkPut(previous.providers.bindings), providerDb.characterBindings.bulkPut(previous.providers.characterBindings), providerDb.imageConfigs.bulkPut(previous.providers.imageConfigs), providerDb.imageVisualConfigs.bulkPut(previous.providers.imageVisualConfigs), providerDb.imageUserVisualConfigs.bulkPut(previous.providers.imageUserVisualConfigs), providerDb.settings.bulkPut(previous.providers.settings)]); }
        if (selection.assets) { for (const asset of previous.assets.filter((item): item is StoredAsset => Boolean(item))) await saveAsset(asset); for (const [id] of backup.assets) if (!previous.assets.some((asset) => asset?.id === id)) await deleteAsset(id); }
        if (selection.preferences) restoreTokimekiPreferences(window.localStorage, previous.preferences);
        setFeedback({ tone: 'error', text: `全局备份恢复失败，已回滚所选数据：${errorMessage(error, '未知错误')}` });
      } catch (rollbackError) { setFeedback({ tone: 'error', text: `全局备份恢复失败，自动回滚也未完成：${errorMessage(rollbackError, '未知错误')}` }); }
    }
  }

  async function downloadThemePackage(): Promise<void> {
    try {
      const theme = collectThemeBackup(window.localStorage);
      const assetIds = themePackageAssetIds(theme);
      const assets = (await listAssets()).filter((asset) => assetIds.has(asset.id));
      const blob = await exportThemePackage(theme, assets, saveRef.current.meta.appVersion);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tokimeki-theme-${new Date().toISOString().slice(0, 10)}.zip`; anchor.click(); URL.revokeObjectURL(url);
      setFeedback({ tone: 'success', text: `主题包已导出：${Object.keys(theme.desktopTitles).length + Object.keys(theme.desktopIcons).length} 组入口自定义、${assets.length} 个本地图标；不包含世界、聊天或 Provider。` });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '主题包导出失败。') }); }
  }

  async function previewThemePackage(file?: File): Promise<void> {
    if (!file) return;
    try {
      const imported = await importThemePackage(file);
      setThemePackagePreview(imported);
      const conflicts = listThemePackageConflicts(collectThemeBackup(window.localStorage), imported.theme);
      setFeedback({ tone: 'info', text: `已读取主题包：${conflicts.length} 项可能覆盖，${imported.assets.size} 个本地图标，${Object.values(imported.theme.desktopIcons).flatMap((entries) => Object.values(entries)).filter((ref) => ref.kind === 'url').length} 个外链图标。尚未写入当前主题。` });
    } catch (error) { setThemePackagePreview(null); setFeedback({ tone: 'error', text: errorMessage(error, '主题包读取失败，当前主题未改变。') }); }
  }

  async function applyThemePackage(imported: ImportedThemePackage, saveAs = false): Promise<void> {
    try {
      const replacements = new Map<string, string>();
      let index = 0;
      for (const sourceId of imported.assets.keys()) {
        let targetId = sourceId;
        if (await loadAsset(targetId)) targetId = `theme-package-${Date.now()}-${index += 1}`;
        replacements.set(sourceId, targetId);
        const bytes = imported.assets.get(sourceId)!; const meta = imported.assetMeta[sourceId]; const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
        await saveAsset({ id: targetId, blob: new Blob([copy], { type: meta?.mimeType ?? 'image/webp' }), mimeType: meta?.mimeType ?? 'image/webp', category: 'image', width: meta?.width, height: meta?.height, createdAt: meta?.createdAt ?? now() });
      }
      const theme = remapThemePackageAssetIds(imported.theme, replacements);
      if (saveAs) {
        const key = `tokimeki.saved-theme.${Date.now()}`;
        window.localStorage.setItem(key, JSON.stringify(theme));
        setFeedback({ tone: 'success', text: '主题包已另存为本地主题数据；当前主题未覆盖。' });
      } else {
        restoreTokimekiPreferences(window.localStorage, { ...collectTokimekiPreferences(window.localStorage), ...themeBackupPreferences(theme) });
        setThemeMode(theme.mode); setThemeTemplate(theme.template); setThemeAppearance(theme.appearance); setCustomCss(theme.customCss); setCustomCssDraft(theme.customCss); setDesktopIcons(theme.desktopIcons);
        window.dispatchEvent(new CustomEvent('tokimeki:theme-change'));
        setFeedback({ tone: 'success', text: '主题包已应用；世界、聊天、Provider 和 API key 未被导入。' });
      }
      setThemePackagePreview(null);
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '主题包应用失败；当前主题未改变。') }); }
  }

  async function clearVoiceCache(): Promise<void> {
    const assets = await listVoiceAssets();
    if (!assets.length) { setFeedback({ tone: 'info', text: '当前没有可清理的语音缓存。' }); return; }
    if (!window.confirm(`确定清理 ${assets.length} 条语音缓存吗？文字消息会保留，语音将显示为不可用。`)) return;
    try {
      if (selectedCharacterId) await saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
      const assetIds = new Set(assets.map((asset) => asset.id));
      const chatRecords = await contentDb.chats.toArray();
      const detachedChats = chatRecords.map((record) => detachVoiceAssetsFromChat(record, assetIds));
      for (const result of detachedChats) if (result.changed) await saveChat(result.record);

      const current = detachVoiceAssetsFromSave(saveRef.current, assetIds);
      if (current.changed) commitSave(current.save);
      const savedSnapshots = await listSnapshots();
      const detachedSnapshots = savedSnapshots.map((snapshot) => {
        const result = detachVoiceAssetsFromSave(snapshot.save, assetIds);
        return result.changed ? { ...snapshot, save: result.save } : snapshot;
      });
      await saveSnapshotRecords(detachedSnapshots);
      setSnapshots(detachedSnapshots);

      const savedChats = detachedChats.map((result) => result.record);
      const stickers = await listTerminalStickers();
      const retainedIds = collectStoredAssetIds([current.save, detachedSnapshots.map((snapshot) => snapshot.save), savedChats, stickers]);
      let retainedForOtherFeatures = 0;
      for (const asset of assets) {
        if (retainedIds.has(asset.id)) { await unmarkVoiceAsset(asset.id); retainedForOtherFeatures += 1; }
        else await deleteAsset(asset.id);
      }
      const activeChat = savedChats.find((record) => record.characterId === selectedCharacterId);
      if (activeChat) setMessages(activeChat.messages);
      await refreshVoiceCacheStats();
      setFeedback({ tone: 'success', text: `语音缓存已清理，文字消息已保留${retainedForOtherFeatures ? `；${retainedForOtherFeatures} 个被其他功能引用的资产仅移除缓存标记` : ''}。` });
    } catch (error) {
      await refreshVoiceCacheStats().catch(() => undefined);
      setFeedback({ tone: 'error', text: errorMessage(error, '语音缓存清理失败；已有文字和资产引用不会被静默删除。') });
    }
  }

  async function clearMusicOfflineCaches(): Promise<void> {
    const count = musicAssetStats.offlineCacheCount;
    if (!count) { setFeedback({ tone: 'info', text: '当前没有外链曲目的离线缓存。' }); return; }
    if (!window.confirm(`确定移除 ${count} 个外链音乐离线缓存吗？曲目和原 URL 会保留，本地导入的音乐不会删除。`)) return;
    const result = await musicPlayer.clearOfflineCaches();
    if (!result.ok) { setFeedback({ tone: 'error', text: result.warning ?? '音乐离线缓存清理失败。' }); return; }
    setFeedback({ tone: 'success', text: `已移除 ${result.count} 首外链曲目的离线缓存；曲目将继续使用原 URL。` });
  }

  async function clearOrphanedMusicAssets(): Promise<void> {
    const [assets, storedStates] = await Promise.all([listMusicAssets(), contentDb.musicStates.toArray()]);
    const referenced = collectStoredAssetIds([musicPlayer.state, storedStates]);
    const orphaned = assets.filter((asset) => !referenced.has(asset.id));
    if (!orphaned.length) { setFeedback({ tone: 'info', text: '当前没有无引用音乐资产。' }); return; }
    if (!window.confirm(`确定删除 ${orphaned.length} 个无引用音乐资产吗？仍被本地曲目或外链缓存引用的音频不会删除。`)) return;
    for (const asset of orphaned) await deleteAsset(asset.id);
    await refreshMusicAssetStats();
    setFeedback({ tone: 'success', text: `已删除 ${orphaned.length} 个无引用音乐资产。` });
  }

  async function clearUnusedImageAssets(): Promise<void> {
    try {
      const [assets, roots, characterConfigs, userConfigs] = await Promise.all([listAssets(), loadImageAssetReferenceRoots(), providerDb.imageVisualConfigs.toArray(), providerDb.imageUserVisualConfigs.toArray()]);
      const available = new Set(assets.filter((asset) => asset.blob.size > 0).map((asset) => asset.id));
      const cleanedCharacterConfigs = characterConfigs.map((config) => {
        if (!config.referenceImage || config.referenceImage.kind === 'url' || available.has(config.referenceImage.assetId)) return config;
        const { referenceImage: _referenceImage, ...rest } = config;
        return ImageVisualConfigSchema.parse({ ...rest, lockFaceEnabled: false, updatedAt: now() });
      });
      const cleanedUserConfigs = userConfigs.map((config) => {
        if (!config.referenceImage || config.referenceImage.kind === 'url' || available.has(config.referenceImage.assetId)) return config;
        const { referenceImage: _referenceImage, ...rest } = config;
        return ImageUserVisualConfigSchema.parse({ ...rest, lockFaceEnabled: false, updatedAt: now() });
      });
      const cleanedRoots = [
        ...roots.filter((root) => !root.label.startsWith('角色锁脸/') && !root.label.startsWith('用户锁脸/')),
        ...cleanedCharacterConfigs.map((config) => ({ label: `角色锁脸/${config.id}`, value: config })),
        ...cleanedUserConfigs.map((config) => ({ label: `用户锁脸/${config.id}`, value: config })),
      ];
      const auditedAssets = assets.map((asset) => ({ id: asset.id, size: asset.blob.size, mimeType: asset.mimeType, category: asset.category }));
      const orphanIds = orphanedImageAssetIds(auditedAssets, cleanedRoots);
      const detachedCount = characterConfigs.filter((config, index) => config.referenceImage && !cleanedCharacterConfigs[index]?.referenceImage).length + userConfigs.filter((config, index) => config.referenceImage && !cleanedUserConfigs[index]?.referenceImage).length;
      if (!orphanIds.length && !detachedCount) { setFeedback({ tone: 'info', text: '没有可安全清理的图片资产或失效锁脸引用。' }); return; }
      if (!window.confirm(`将删除 ${orphanIds.length} 个无引用图片，并修复 ${detachedCount} 个失效锁脸引用。仍被头像、立绘、地图、贴图或锁脸配置引用的图片会保留。确定继续吗？`)) return;
      await providerDb.transaction('rw', providerDb.imageVisualConfigs, providerDb.imageUserVisualConfigs, async () => {
        await providerDb.imageVisualConfigs.bulkPut(cleanedCharacterConfigs);
        await providerDb.imageUserVisualConfigs.bulkPut(cleanedUserConfigs);
      });
      for (const assetId of orphanIds) await deleteAsset(assetId);
      setImageVisualConfigs(cleanedCharacterConfigs);
      setImageUserVisualConfigs(cleanedUserConfigs);
      await refreshImageAssetStats();
      setAssetIntegrityReport(null);
      setFeedback({ tone: 'success', text: `图片清理完成：删除 ${orphanIds.length} 个无引用图片，修复 ${detachedCount} 个失效锁脸引用。` });
    } catch (error) {
      await refreshImageAssetStats().catch(() => undefined);
      setFeedback({ tone: 'error', text: errorMessage(error, '图片资产清理失败；被引用图片不会被静默删除。') });
    }
  }

  async function clearChatCgImages(): Promise<void> {
    try {
      if (selectedCharacterId) await saveChat({ characterId: selectedCharacterId, messages, updatedAt: now() });
      const chats = await contentDb.chats.toArray();
      const assetIds = [...new Set(chats.flatMap((record) => record.messages.map((message) => storedAssetId(message.cg?.asset)).filter((id): id is string => Boolean(id))))];
      if (!assetIds.length) { setFeedback({ tone: 'info', text: '当前没有聊天 CG 可清理。' }); return; }
      if (!window.confirm(`确定清理 ${assetIds.length} 张聊天 CG 吗？角色台词、旁白、头像和立绘都会保留。`)) return;
      const cleaned = chats.map((record) => ({ ...record, messages: record.messages.map((message) => {
        if (!message.cg) return message;
        const { cg: _cg, ...withoutCg } = message;
        return withoutCg;
      }), updatedAt: now() }));
      for (const record of cleaned) await saveChat(record);
      const active = cleaned.find((record) => record.characterId === selectedCharacterId);
      if (active) setMessages(active.messages);
      for (const assetId of assetIds) await deleteImageAssetIfUnreferenced(assetId);
      await refreshImageAssetStats();
      setAssetIntegrityReport(null);
      setFeedback({ tone: 'success', text: `已清理 ${assetIds.length} 张聊天 CG；文字记录、角色头像和立绘均已保留。` });
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '聊天 CG 清理失败。') });
    }
  }

  async function persistLocalStorage(): Promise<void> {
    const persisted = await requestPersistentStorage();
    if (persisted === undefined) setFeedback({ tone: 'info', text: '当前浏览器不支持持久化存储申请。' });
    else setFeedback({ tone: persisted ? 'success' : 'info', text: persisted ? '已请求浏览器将本地数据标记为持久化。' : '浏览器未授予持久化存储；本地数据仍保存在当前浏览器。' });
    setStorageEstimate(await readStorageEstimate());
  }

  async function checkAssetIntegrity(): Promise<void> {
    if (assetIntegrityBusy) return;
    setAssetIntegrityBusy(true);
    try {
      const [assets, roots] = await Promise.all([listAssets(), loadImageAssetReferenceRoots()]);
      const report = auditAssetReferences(roots, assets.map((asset) => ({ id: asset.id, size: asset.blob.size, mimeType: asset.mimeType, category: asset.category })));
      setAssetIntegrityReport(report);
      setFeedback({ tone: report.missing.length ? 'info' : 'success', text: report.missing.length ? `检查完成：发现 ${report.missing.length} 个缺失或空资产引用。` : '本地资产引用检查完成，未发现失效引用。' });
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error, '本地资产引用检查失败。') });
    } finally { setAssetIntegrityBusy(false); }
  }

  async function loadSave(file?: File) {
    if (!file) return;
    try {
      const imported = await importSaveZip(file); const extra = imported.extras;
      const importedMeta = extra.assetMeta as Record<string, { mimeType?: unknown; width?: unknown; height?: unknown; category?: unknown; cacheFingerprint?: unknown; audioFormat?: unknown; durationMs?: unknown; voiceRequestId?: unknown }> | undefined;
      for (const [id, bytes] of imported.assets) {
        const metadata = importedMeta?.[id];
        const mimeType = typeof metadata?.mimeType === 'string' ? metadata.mimeType : mimeTypeForAsset(id);
        const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes);
        await saveAsset({ id, blob: new Blob([copy], { type: mimeType }), mimeType, width: typeof metadata?.width === 'number' ? metadata.width : undefined, height: typeof metadata?.height === 'number' ? metadata.height : undefined, category: metadata?.category === 'voice' || metadata?.category === 'image' ? metadata.category : undefined, cacheFingerprint: typeof metadata?.cacheFingerprint === 'string' ? metadata.cacheFingerprint : undefined, audioFormat: typeof metadata?.audioFormat === 'string' ? metadata.audioFormat : undefined, durationMs: typeof metadata?.durationMs === 'number' ? metadata.durationMs : undefined, voiceRequestId: typeof metadata?.voiceRequestId === 'string' ? metadata.voiceRequestId : undefined, createdAt: now() });
      }
      if (Array.isArray(extra.characters)) { const items = await Promise.all((extra.characters as CharacterCard[]).map(saveCharacter)); setCharacters(items); if (items[0]) setSelectedCharacterId(items[0].id); }
      if (Array.isArray(extra.worldbooks)) { const items = await Promise.all((extra.worldbooks as WorldbookEntry[]).map(saveWorldbook)); setWorldbooks(items); }
      const importedPresets = Array.isArray(extra.presets) ? await Promise.all((extra.presets as Preset[]).map(savePreset)) : [];
      const localBuiltin = presetBundles.find((bundle) => bundle.id === BUILTIN_NARRATION_PRESET_BUNDLE_ID) ?? createBuiltinNarrationPresetBundle();
      if (Array.isArray(extra.presetBundles)) {
        const importedBundles = await Promise.all((extra.presetBundles as PresetBundle[]).map(savePresetBundle));
        const importedBuiltin = importedBundles.find((bundle) => bundle.id === BUILTIN_NARRATION_PRESET_BUNDLE_ID);
        const bundles = [importedBuiltin ?? localBuiltin, ...importedBundles.filter((bundle) => bundle.id !== BUILTIN_NARRATION_PRESET_BUNDLE_ID)];
        const bundledEntries = bundles.flatMap((bundle) => bundle.entries);
        setPresets([...importedPresets.filter((preset) => !bundledEntries.some((entry) => entry.id === preset.id)), ...bundledEntries]);
        setPresetBundles(bundles); setSelectedPresetBundleId(bundles[0]?.id ?? '');
        if (!importedBuiltin) await savePresetBundle(localBuiltin);
      }
      else if (Array.isArray(extra.presets) && extra.presets.length > 0) {
        const bundle = await savePresetBundle({ id: 'bundle-imported', name: '导入的预设包', entries: importedPresets, updatedAt: now() });
        setPresets([...localBuiltin.entries, ...importedPresets]);
        setPresetBundles([localBuiltin, bundle]); setSelectedPresetBundleId(localBuiltin.id);
        await savePresetBundle(localBuiltin);
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
      await refreshVoiceCacheStats();
      setDebug((current) => ({ ...current, raw: '已导入存档与内容；Provider 设置未改变。' }));
      setFeedback({ tone: 'success', text: '导入成功；Provider 配置与 API key 未覆盖。' });
    } catch (error) { setFeedback({ tone: 'error', text: errorMessage(error, '导入失败') }); }
  }

  function mimeTypeForAsset(id: string): string {
    const extension = id.split('.').pop()?.toLowerCase();
    return extension === 'webp' ? 'image/webp' : extension === 'png' ? 'image/png' : extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : extension === 'gif' ? 'image/gif' : 'application/octet-stream';
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
    if (kind === 'memory') {
      const [charId, ...memoryParts] = id.split(':');
      deleteMemory(charId, memoryParts.join(':'));
      return;
    }
    setFeedback({ tone: 'success', text: '内容已删除。' });
  };

  const dayViewProps: Omit<DayViewProps, 'activePage' | 'onOpenPage' | 'onBack' | 'shellEyebrow'> = {
    save,
    snapshots,
    morningBriefs: save.world.morningBriefs,
    morningUpdates: save.world.morningUpdates,
    morningStyle: save.config.morningStyle,
    summarizingDay,
    onAction: runDayAction,
    onAcceptRental: acceptRental,
    onRequestHousingUpgrade: requestHousingUpgrade,
    onAcceptJob: acceptJob,
    onWorkJob: workJob,
    onAcceptShop: acceptShop,
    onOperateShop: operateShop,
    onSleep: sleepEarly,
    onRestoreSnapshot: restoreSnapshot,
    onSaveDiary: saveDiaryEdit,
    onPresetChange: setCalendarPreset,
    onRevealEvent: revealEvent,
    onResolveEventChoice: resolveChoice,
    onExportEventHistory: exportEventHistory,
    onExportChatArchive: exportChatArchive,
    canExportChatArchive: Boolean(selectedCharacterId && messages.length),
    onDeleteEventHistory: deleteEventHistory,
    onMove: (nodeId) => { if (moveToNode(nodeId)) setTab('map'); },
  };
  const saveAppName = () => {
    const next = appNameDraft.trim().slice(0, 32);
    if (!next) { setAppNameDraft(appName); setEditingAppName(false); return; }
    setAppName(next);
    setAppNameDraft(next);
    setEditingAppName(false);
    try { window.localStorage.setItem(APP_NAME_STORAGE_KEY, next); } catch { /* Local UI preference may be unavailable. */ }
  };
  const resetAppName = () => {
    setAppName(DEFAULT_APP_NAME);
    setAppNameDraft(DEFAULT_APP_NAME);
    setEditingAppName(false);
    try { window.localStorage.removeItem(APP_NAME_STORAGE_KEY); } catch { /* Local UI preference may be unavailable. */ }
  };
  const libraryDayPage = libraryPage ? LIBRARY_DAY_PAGE_MAP[libraryPage] : undefined;

  return <div className="app-shell">
    <audio ref={musicPlayer.audioRef} preload="metadata" aria-hidden="true" />
    {tab !== 'map' && <header className={`topbar ${tab === 'chat' ? 'chat-topbar' : ''}`}><div><small>第 {save.world.clock.day} 天 · {save.world.clock.slotId}</small>{editingAppName ? <form className="app-name-editor" onSubmit={(event) => { event.preventDefault(); saveAppName(); }}><input aria-label="应用名称" value={appNameDraft} maxLength={32} autoFocus onChange={(event) => setAppNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') { setAppNameDraft(appName); setEditingAppName(false); } }} /><button type="submit" className="app-name-save">保存</button><button type="button" className="app-name-cancel" onClick={() => { setAppNameDraft(appName); setEditingAppName(false); }}>取消</button></form> : <button type="button" className="app-name-trigger" aria-label="编辑应用名称" title="编辑应用名称" onClick={() => { setAppNameDraft(appName); setEditingAppName(true); }}><h1>{appName}{tab === 'chat' && <span className="topbar-context"> · 面对面</span>}</h1></button>}</div></header>}
    <main className={`screen ${tab === 'chat' ? 'chat-screen-host' : ''} ${tab === 'map' ? 'map-screen-host' : ''} ${tab === 'library' && libraryPage === 'messages' ? 'terminal-message-screen-host' : ''}`}>
      {feedback && <div className={`feedback ${feedback.tone}`} role="status">{feedback.text}<button aria-label="关闭提示" onClick={() => setFeedback(null)}>×</button></div>}
      {tab === 'map' && <MapView save={save} worldbooks={worldbooks} activeEncounter={activeEncounter} encounterParticipantIds={encounterParticipantIds} onEncounterParticipantIdsChange={setEncounterParticipantIds} onEncounterOutcome={chooseEncounterOutcome} onContinueEncounter={continueEncounter} onMove={moveToNode} onImportBackground={importMapBackground} onSetBackgroundUrl={setMapBackgroundUrl} onImportSceneBackground={importSceneBackground} onSetSceneBackgroundUrl={setSceneBackgroundUrl} onRemoveSceneBackground={removeSceneBackground} onToggleMode={toggleMapMode} onCreateNode={addMapNode} onEditNode={editMapNode} onDeleteNode={removeMapNode} onSuggestNode={suggestMapNode} onGenerateMap={generateMap} onExpandMap={expandMap} mapGenerating={mapGenerating} />}
      {tab === 'day' && <DayView {...dayViewProps} activePage={dayPage} onOpenPage={setDayPage} onBack={() => setDayPage(null)} />}
      {tab === 'chat' && <ChatView characters={presentChatCharacters} worldCharacters={save.world.characters} worldCharacter={selectedCharacterId ? save.world.characters[selectedCharacterId] : undefined} world={save.world} hiddenTopicStyle={save.config.hiddenTopicStyle} participantIds={chatParticipantIds} participantsLocked={chatParticipantsLocked} onParticipantIdsChange={updateChatParticipants} sceneBackground={save.world.map.nodes[save.world.player.nodeId]?.sceneBackground} playerLabel={activePersona?.displayName ?? save.world.player.name} selectedCharacterId={selectedCharacterId} setSelectedCharacterId={setSelectedCharacterId} messages={messages} input={input} setInput={setInput} onAppend={appendMessage} onGenerate={generateReply} onEditMessage={editChatHistoryMessage} onDeleteMessage={deleteChatHistoryMessage} onGenerateVoice={generateChatVoice} onDownloadVoice={(index) => downloadVoiceAsset(messages[index]?.voice?.asset, `chat-${messages[index]?.id ?? index}`)} onGenerateCg={generateChatCg} onDownloadCg={(index) => downloadImageAsset(messages[index]?.cg?.asset, `chat-cg-${messages[index]?.id ?? index}`)} onDeleteCg={deleteChatCg} imageBusy={imageBusy} imageConfigured={Boolean(imageConfig.providerId && providers.some((item) => item.id === imageConfig.providerId && item.kind === 'openai-compatible'))} voiceAvailableCharacterIds={Object.keys(save.world.characters).filter((characterId) => Boolean(resolveTtsProviderForCharacter(ttsConfigs, characterBindings, save.meta.id, characterId, defaultTtsConfigId)?.enabled))} ttsBusy={ttsBusy} regenerateInput={regenerateInput} setRegenerateInput={setRegenerateInput} onRegenerate={regenerateReply} canRegenerate={topicMode === 'manual' && lastResponseSource === 'manual'} requestStatus={requestStatus} busy={busy} replyInProgress={replyInProgress} pendingOps={pendingOps} manualOps={manualOps} setManualOps={setManualOps} onRetryOps={retryOpsExtraction} onApplyManualOps={applyManualOps} interrupted={Boolean(chatRecovery && (chatRecovery.status === 'interrupted' || chatRecovery.status === 'error'))} onRetryInterrupted={retryInterruptedReply} topicTree={topicTree} topicMode={topicMode} topicLoading={topicLoading} topicRetryAvailable={Boolean(topicRetryContext)} onRetryTopicTree={retryTopicTree} onTopicSelect={selectTopic} departure={chatDeparture} canFarewell={Boolean(chatEncounterEntryId)} onPlayerFarewell={sayGoodbye} onResolveDeparture={resolveChatDeparture} giftItems={Object.values(save.world.items).filter((item) => item.giftable !== false && save.world.player.inventory.some((entry) => entry.itemId === item.id && entry.count > 0))} giftTargets={chatParticipantIds.map((id) => save.world.characters[id]).filter(Boolean)} giftHistory={save.world.giftHistory.filter((entry) => chatParticipantIds.includes(entry.charId)).slice(-5)} onOfferGift={offerGiftToCurrent} onRetryGift={retryPendingGift} collectionEntries={save.world.collection} onShowCollection={showCollectionToCurrent} />}
      {tab === 'library' && libraryDayPage && <DayView {...dayViewProps} activePage={libraryDayPage} onOpenPage={() => undefined} onBack={() => setLibraryPage(null)} shellEyebrow="终端" />}
      {/* @ts-expect-error legacy unused sticker callbacks remain accepted by LibraryView */}
      {tab === 'library' && !libraryDayPage && !(['story', 'memories', 'collection'] as LibraryPage[]).includes(libraryPage ?? 'messages') && <LibraryNavigationContext.Provider value={{ activePage: libraryPage, onOpenPage: setLibraryPage, onBack: () => setLibraryPage(null) }}><LibraryView appName={appName} characters={characters} worldbooks={worldbooks} providers={providers} ttsConfigs={ttsConfigs} characterBindings={characterBindings} onCharacterProviderBindingChange={updateCharacterProviderBinding} presets={presets} presetBundles={presetBundles} selectedPresetBundleId={selectedPresetBundleId} setSelectedPresetBundleId={setSelectedPresetBundleId} setPresetBundleName={setPresetBundleName} presetBundleName={presetBundleName} onCreatePresetBundle={createPresetBundle} onRenamePresetBundle={renamePresetBundle} onDeletePresetBundle={removePresetBundle} onSetPresetEntryEnabled={setPresetEntryEnabled} onMovePresetEntry={movePresetEntry} save={save} name={name} setName={setName} draftText={draftText} setDraftText={setDraftText} editing={editing} setEditing={setEditing} addContent={addContent} onDelete={onDelete} onExport={downloadJson} onImport={importContent} onImportText={importTextContent} onExportSave={downloadSave} onImportSave={loadSave} onExportPresetBundle={exportPresetBundleFile} onImportPresetBundle={importPresetBundleFile} includeChatsOnExport={includeChatsOnExport} setIncludeChatsOnExport={setIncludeChatsOnExport} onClearChats={clearAllChats} itemName={itemName} setItemName={setItemName} itemTags={itemTags} setItemTags={setItemTags} itemDescription={itemDescription} setItemDescription={setItemDescription} onAddItem={addItemDefinition} onAddCharacterToWorld={addCharacterToCurrentWorld} onExportCharacterPackage={downloadCharacterPackage} onImportCharacterPackage={loadCharacterPackage} onExportWorldPackage={downloadWorldPackage} onImportWorldPackage={loadWorldPackage} onExportEventPackage={downloadEventPackage} onImportEventPackage={loadEventPackage} visualCharacterId={visualCharacterId} setVisualCharacterId={setVisualCharacterId} onImportCharacterVisual={importCharacterVisual} onRemoveCharacterVisual={removeCharacterVisual} onUpdateCharacterAccentColor={updateCharacterAccentColor} onOpenImageSettings={() => { setTab('settings'); setSettingsPage('image'); }} onRequestFriend={requestTerminalFriend} onResolveFriend={resolveTerminalFriend} onPromoteNpc={promoteNpcFromContacts} onExpandNpcPromotionDraft={expandNpcPromotionDraft} onSendTerminalText={sendTerminalText} onSendStickerAsset={sendTerminalStickerAsset} stickers={terminalStickers} onImportStickerFile={importTerminalStickerFile} onImportStickerUrl={importTerminalStickerUrl} onDeleteSticker={removeTerminalSticker} onRejoin={requestTerminalRejoin} onEditTerminalMessage={editTerminalText} onDeleteTerminalMessage={deleteTerminalText} onGenerateTerminalReply={generateTerminalReply} onSendVoice={sendTerminalVoice} onDownloadVoice={(characterId, messageId) => { const message = listTerminalMessages(saveRef.current.world, characterId).find((item) => item.id === messageId); return downloadVoiceAsset(message?.asset, `message-${messageId}`); }} isVoiceAvailable={(characterId) => Boolean(resolveTtsProviderForCharacter(ttsConfigs, characterBindings, save.meta.id, characterId, defaultTtsConfigId)?.enabled)} ttsConfig={ttsConfig} ttsBusy={ttsBusy} onSendPlayerTransfer={sendPlayerTerminalTransfer} onResolveIncomingTransfer={resolveIncomingTransfer} onCreateTerminalAppointment={createTerminalAppointment} onSimulateIncomingAppointment={(characterId, input) => createTerminalAppointment(characterId, input, 'incoming')} onResolveTerminalAppointment={resolveTerminalAppointment} onSimulateAppointmentAcceptance={simulateTerminalAppointmentAcceptanceForUi} onConfirmTerminalAppointment={confirmTerminalAppointmentForUi} terminalCall={terminalCall} onStartCall={startTerminalCall} onSimulateIncomingCall={simulateIncomingTerminalCall} onAnswerCall={answerTerminalCall} onSimulateCallAnswer={simulateTerminalCallAnswer} onEndCall={endTerminalCall} terminalBusy={terminalBusy} musicPlayer={musicPlayer} /></LibraryNavigationContext.Provider>}
      {tab === 'library' && libraryPage === 'story' && <SubpageShell eyebrow="终端" title="多人剧情" pageId="story" onBack={() => setLibraryPage(null)}><StorySceneLibraryView save={save} storyScenePresets={storyScenePresets} onSavePreset={saveStoryScenePresetCopy} onUpdatePreset={updateStoryScenePreset} onDeletePreset={removeStoryScenePreset} onCreateDraft={createStorySceneDraftFromInput} onEditDraft={editStorySceneDraft} onDeleteDraft={removeStorySceneDraft} onConfirmDraft={confirmStorySceneDraft} onAdvanceStage={advanceStoryScene} onSetStatus={setStorySceneStatus} onReadStage={(sceneId, stageId) => updateStorySceneReading(sceneId, stageId, 'read')} onSelectStage={(sceneId, stageId) => updateStorySceneReading(sceneId, stageId, 'select')} /></SubpageShell>}
      {tab === 'library' && libraryPage === 'memories' && <SubpageShell eyebrow="终端" title="记忆库" pageId="memories" onBack={() => setLibraryPage(null)}><MemoryLibraryView save={save} onArchiveMemory={deleteMemory} onRestoreMemory={restoreMemory} onDeleteMemory={permanentlyDeleteMemory} onEditMemory={editMemory} onToggleInjection={toggleMemoryInjection} /></SubpageShell>}
      {tab === 'library' && libraryPage === 'collection' && <SubpageShell eyebrow="终端" title="收藏" pageId="collection" onBack={() => setLibraryPage(null)}><CollectionLibraryView save={save} onUpdate={updateCollectionEntry} onDelete={deleteCollectionEntry} /></SubpageShell>}
      {tab === 'settings' && <SettingsView appName={appName} desktopIcons={desktopIcons} onImportDesktopIcon={importDesktopIcon} onSetDesktopIconUrl={setDesktopIconUrl} onRemoveDesktopIcon={(launcherId, entryId) => setDesktopIcon(launcherId, entryId, undefined)} themeAppearance={themeAppearance} onThemeAppearanceChange={updateThemeAppearance} customCssDraft={customCssDraft} setCustomCssDraft={setCustomCssDraft} onSaveCustomCss={saveCustomCss} onResetCustomCss={resetCustomCss} activePage={settingsPage} onOpenPage={setSettingsPage} onBack={() => setSettingsPage(null)} provider={provider} setProvider={setProvider} providers={providers} bindings={bindings} defaultProviderId={defaultProviderId} headersDraft={headersDraft} setHeadersDraft={setHeadersDraft} models={models} embeddingConfig={embeddingConfig} setEmbeddingConfig={setEmbeddingConfig} embeddingHeadersDraft={embeddingHeadersDraft} setEmbeddingHeadersDraft={setEmbeddingHeadersDraft} embeddingBusy={embeddingBusy} onSaveEmbedding={saveEmbeddingSettings} onTestEmbedding={testEmbeddingConnection} onRebuildEmbedding={rebuildEmbeddingIndex} ttsConfigs={ttsConfigs} defaultTtsConfigId={defaultTtsConfigId} ttsConfig={ttsConfig} setTtsConfig={(next) => { setTtsConfig(next); ttsConfigRef.current = next; setTtsConfigs((items) => items.some((item) => item.id === next.id) ? items.map((item) => item.id === next.id ? next : item) : items); }} ttsHeadersDraft={ttsHeadersDraft} setTtsHeadersDraft={setTtsHeadersDraft} onSelectTtsConfig={selectTtsConfig} onNewTtsConfig={createTtsConfigDraft} onDeleteTtsConfig={deleteTtsConfig} onDefaultTtsChange={updateDefaultTtsConfig} ttsBusy={ttsBusy} onSaveTts={saveTtsSettings} onTestTts={testTtsConnection} imageConfig={imageConfig} setImageConfig={(next) => { const parsed = ImageConfigSchema.parse(next); imageConfigRef.current = parsed; setImageConfig(parsed); }} imageBusy={imageBusy} onSaveImage={saveImageSettings} onTestImage={testImageConnection} onOpenProvider={() => setSettingsPage('provider')} save={save} imageVisualConfigs={imageVisualConfigs} imageUserVisualConfigs={imageUserVisualConfigs} visualCharacterId={visualCharacterId} setVisualCharacterId={setVisualCharacterId} imagePrompt={imagePrompt} setImagePrompt={setImagePrompt} imageTarget={imageTarget} setImageTarget={setImageTarget} onSaveImageVisualConfig={saveImageVisualConfig} onSetCharacterFaceLock={setCharacterFaceLock} onImportCharacterFaceReference={importCharacterFaceReference} onRemoveCharacterFaceReference={removeCharacterFaceReference} onSaveUserImageVisualConfig={saveUserImageVisualConfig} onSetUserFaceLock={setUserFaceLock} onImportUserFaceReference={importUserFaceReference} onRemoveUserFaceReference={removeUserFaceReference} onGenerateCharacterImage={generateCharacterImage} voiceCacheStats={voiceCacheStats} onClearVoiceCache={clearVoiceCache} imageAssetStats={imageAssetStats} onClearUnusedImageAssets={clearUnusedImageAssets} onClearChatCgImages={clearChatCgImages} musicAssetStats={musicAssetStats} onClearMusicOfflineCaches={clearMusicOfflineCaches} onClearOrphanedMusicAssets={clearOrphanedMusicAssets} storageEstimate={storageEstimate} onPersistStorage={persistLocalStorage} assetIntegrityReport={assetIntegrityReport} assetIntegrityBusy={assetIntegrityBusy} onCheckAssetIntegrity={checkAssetIntegrity} requestStatus={requestStatus} onNewProvider={() => { setProvider(newProvider()); setModels([]); }} onSaveProvider={saveProviderConfig} onDeleteProvider={deleteProviderConfig} onDiscoverModels={discoverModels} onTestConnection={testConnection} onDefaultProviderChange={updateDefaultProvider} onBindingChange={updateTaskBinding} debug={debug} debugTab={debugTab} setDebugTab={setDebugTab} onShowNumbersChange={setShowNumbers} onEnergyEnabledChange={setEnergyEnabled} onMorningStyleChange={setMorningStyle} personas={personas} personaId={save.world.player.personaId ?? ''} personaEditingId={personaEditingId} setPersonaEditingId={setPersonaEditingId} personaName={personaName} setPersonaName={setPersonaName} personaDisplayName={personaDisplayName} setPersonaDisplayName={setPersonaDisplayName} personaDescription={personaDescription} setPersonaDescription={setPersonaDescription} onSavePersona={savePersonaDraft} onBindPersona={bindPersona} onDeletePersona={removePersona} statKey={statKey} setStatKey={setStatKey} statValue={statValue} setStatValue={setStatValue} onAddStat={addCustomStat} mockFixtureId={mockFixtureId} setMockFixtureId={setMockFixtureId} onLoadStage4Fixture={loadStage4EncounterFixture} devToolSeed={devToolSeed} setDevToolSeed={setDevToolSeed} devToolDays={devToolDays} setDevToolDays={setDevToolDays} devToolReport={devToolReport} onRunDevTool={runDevTool} onExportProviderSettings={downloadProviderSettings} onImportProviderSettings={applyProviderSettings} onExportGlobalBackup={downloadGlobalBackup} onImportGlobalBackup={previewGlobalBackup} globalBackupPreview={globalBackupPreview} onRestoreGlobalBackup={restoreGlobalBackup} onExportThemePackage={downloadThemePackage} onImportThemePackage={previewThemePackage} themePackagePreview={themePackagePreview} onApplyThemePackage={applyThemePackage} onCancelThemePackage={() => setThemePackagePreview(null)} />}
    </main>
    <nav className="bottom-nav" aria-label="主导航">{BOTTOM_NAV_ITEMS.map(([id, label, Icon]) => <button key={id} type="button" className={tab === id ? 'selected' : ''} aria-label={label} title={label} onClick={() => setTab(id)}><Icon size={25} weight="fill" aria-hidden="true" /><span className="bottom-nav-label">{label}</span></button>)}</nav>
  </div>;
}

function MapView({ save, worldbooks, activeEncounter, encounterParticipantIds, onEncounterParticipantIdsChange, onEncounterOutcome, onContinueEncounter, onMove, onImportBackground, onSetBackgroundUrl, onImportSceneBackground, onSetSceneBackgroundUrl, onRemoveSceneBackground, onToggleMode, onCreateNode, onEditNode, onDeleteNode, onSuggestNode, onGenerateMap, onExpandMap, mapGenerating }: { save: SaveFile; worldbooks: WorldbookEntry[]; activeEncounter: ActiveEncounter | null; encounterParticipantIds: string[]; onEncounterParticipantIdsChange: (ids: string[]) => void; onEncounterOutcome: (outcome: 'continued' | 'urgent_leave') => void; onContinueEncounter: () => void; onMove: (nodeId: string) => void; onImportBackground: (file?: File) => Promise<void>; onSetBackgroundUrl: (url: string) => Promise<void>; onImportSceneBackground: (nodeId: string, file?: File) => Promise<void>; onSetSceneBackgroundUrl: (nodeId: string, url: string) => Promise<void>; onRemoveSceneBackground: (nodeId: string) => Promise<void>; onToggleMode: () => void; onCreateNode: (input: CreateMapNodeInput) => boolean; onEditNode: (nodeId: string, input: UpdateMapNodeInput) => boolean; onDeleteNode: (nodeId: string) => boolean; onSuggestNode: (input: { requirements: string; regionName: string; anchorName: string }) => Promise<{ name: string; description: string } | null>; onGenerateMap: (requirements?: string) => Promise<void>; onExpandMap: (anchorNodeId: string, count: number, requirements?: string) => Promise<void>; mapGenerating: boolean }) {
  type MapSheetState = 'collapsed' | 'half' | 'expanded';
  const map = save.world.map;
  const currentNode = map.nodes[save.world.player.nodeId];
  const nodes = Object.values(map.nodes);
  const viewportStorageKey = `tokimeki.map-viewport.${save.meta.id}.${map.view.mode}`;
  const readViewport = () => {
    const fallback = { zoom: map.view.mode === 'graph' ? 1.5 : 1, offset: { x: 0, y: 0 } };
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(viewportStorageKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as { zoom?: unknown; offset?: { x?: unknown; y?: unknown } };
      if (typeof parsed.zoom !== 'number' || !Number.isFinite(parsed.zoom) || typeof parsed.offset?.x !== 'number' || !Number.isFinite(parsed.offset.x) || typeof parsed.offset?.y !== 'number' || !Number.isFinite(parsed.offset.y)) return fallback;
      return { zoom: Math.max(0.65, Math.min(2.5, parsed.zoom)), offset: { x: parsed.offset.x, y: parsed.offset.y } };
    } catch { return fallback; }
  };
  const initialViewport = readViewport();
  const [backgroundUrl, setBackgroundUrl] = useState<string>();
  const [requirements, setRequirements] = useState('');
  const [expandCount, setExpandCount] = useState('1');
  const [anchorNodeId, setAnchorNodeId] = useState(currentNode?.id ?? nodes[0]?.id ?? '');
  const [zoom, setZoom] = useState(initialViewport.zoom);
  const [offset, setOffset] = useState(initialViewport.offset);
  const [viewportHydratedKey, setViewportHydratedKey] = useState(viewportStorageKey);
  const [selectedMapNodeId, setSelectedMapNodeId] = useState<string | null>(null);
  const [toolSheetState, setToolSheetState] = useState<MapSheetState>('collapsed');
  const [detailSheetState, setDetailSheetState] = useState<MapSheetState>('expanded');
  const [toolSheetProgress, setToolSheetProgress] = useState(0);
  const [detailSheetProgress, setDetailSheetProgress] = useState(1);
  const [sheetDraggingKind, setSheetDraggingKind] = useState<'tool' | 'detail' | null>(null);
  const dragRef = useRef({ pointerId: -1, startX: 0, startY: 0, originX: 0, originY: 0, moved: false });
  const sheetDragRef = useRef({ pointerId: -1, kind: 'tool' as 'tool' | 'detail', startY: 0, startProgress: 0, currentProgress: 0, moved: false, startTime: 0, lastY: 0, lastTime: 0, lastVelocity: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef({ distance: 0, zoom: 1, contentX: 0, contentY: 0 });
  const graphSurfaceRef = useRef<SVGSVGElement>(null);
  const hotspotSurfaceRef = useRef<HTMLDivElement>(null);
  const mapCanvasRef = useRef<HTMLDivElement>(null);
  const toolSheetRef = useRef<HTMLDetailsElement>(null);
  const detailSheetRef = useRef<HTMLDetailsElement>(null);
  const [editorMode, setEditorMode] = useState(false);
  const [editorPos, setEditorPos] = useState<{ x: number; y: number } | null>(null);
  const [editorNodeId, setEditorNodeId] = useState<string | null>(null);
  const [editorName, setEditorName] = useState('');
  const [editorDescription, setEditorDescription] = useState('');
  const [editorRegionId, setEditorRegionId] = useState(currentNode?.regionId ?? Object.keys(map.regions)[0] ?? '');
  const [editorAnchorId, setEditorAnchorId] = useState(currentNode?.id ?? nodes[0]?.id ?? '');
  const [editorKind, setEditorKind] = useState('');
  const [editorOpenSlots, setEditorOpenSlots] = useState<string[]>([]);
  const [editorDiscovered, setEditorDiscovered] = useState(true);
  const [editorTravelSlots, setEditorTravelSlots] = useState('1');
  const [editorRequirements, setEditorRequirements] = useState('');
  const [editorWorldbookIds, setEditorWorldbookIds] = useState<string[]>([]);
  const [editorSceneBackground, setEditorSceneBackground] = useState<AssetRef>();
  useEffect(() => { const next = readViewport(); setZoom(next.zoom); setOffset(next.offset); setViewportHydratedKey(viewportStorageKey); }, [viewportStorageKey]);
  useEffect(() => {
    if (viewportHydratedKey !== viewportStorageKey) return;
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(viewportStorageKey, JSON.stringify({ zoom, offset })); } catch { /* ignore unavailable browser storage */ }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [offset, viewportHydratedKey, viewportStorageKey, zoom]);
  const mapPresence = useMemo(() => {
    const byNode: Record<string, ReturnType<typeof whoIsWhere>> = {};
    const visuals: Record<string, MapPresenceVisual> = {};
    const accentColors = resolveCharacterAccentColors(save.world.characters);
    for (const person of whoIsWhere(save.world, save.world.clock.day, save.world.clock.slotId, save.config.calendar.daysPerWeek)) {
      if (!map.nodes[person.nodeId]?.discovered) continue;
      (byNode[person.nodeId] ??= []).push(person);
      visuals[person.id] = mapPresenceVisual(save.world, person, accentColors);
    }
    return { byNode, visuals };
  }, [map.nodes, save.config.calendar.daysPerWeek, save.world]);
  const encounterTraces = useMemo(() => Object.fromEntries(Object.values(map.nodes).filter((node) => node.discovered).map((node) => [node.id, recentEncounterTraces(save.world, node.id)])) as Record<string, EncounterTrace[]>, [map.nodes, save.world]);
  const [mapAvatarUrls, setMapAvatarUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let cancelled = false;
    const objectUrls: string[] = [];
    void Promise.all(Object.values(mapPresence.visuals).map(async (visual) => {
      if (!visual.avatar) return [visual.id, undefined] as const;
      if (visual.avatar.kind === 'url') return [visual.id, visual.avatar.url] as const;
      const asset = await loadAsset(visual.avatar.assetId);
      if (!asset) return [visual.id, undefined] as const;
      const url = URL.createObjectURL(asset.blob);
      objectUrls.push(url);
      return [visual.id, url] as const;
    })).then((entries) => {
      if (cancelled) return;
      setMapAvatarUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => Boolean(entry[1]))));
    }).catch(() => { if (!cancelled) setMapAvatarUrls({}); });
    return () => { cancelled = true; objectUrls.forEach((url) => URL.revokeObjectURL(url)); };
  }, [mapPresence.visuals]);
  useEffect(() => {
    let objectUrl: string | undefined;
    let cancelled = false;
    const background = map.view.background;
    if (!background) { setBackgroundUrl(undefined); return () => undefined; }
    if (background.kind === 'url') { setBackgroundUrl(background.url); return () => undefined; }
    void loadAsset(background.assetId).then((asset) => {
      if (!asset || cancelled) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setBackgroundUrl(objectUrl);
    }).catch(() => { if (!cancelled) setBackgroundUrl(undefined); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [map.view.background]);
  const edgeKey = (edge: SaveFile['world']['map']['edges'][number]) => `${edge.from}-${edge.to}`;
  useEffect(() => { if (!map.nodes[anchorNodeId]) setAnchorNodeId(currentNode?.id ?? nodes[0]?.id ?? ''); }, [anchorNodeId, currentNode?.id, map.nodes, nodes]);
  useEffect(() => { if (!map.nodes[editorAnchorId]) setEditorAnchorId(currentNode?.id ?? nodes[0]?.id ?? ''); }, [currentNode?.id, editorAnchorId, map.nodes, nodes]);
  useEffect(() => { if (!map.regions[editorRegionId]) setEditorRegionId(currentNode?.regionId ?? Object.keys(map.regions)[0] ?? ''); }, [currentNode?.regionId, editorRegionId, map.regions]);
  const pointOnMap = (clientX: number, clientY: number, element: Element) => {
    const rect = element.getBoundingClientRect();
    return { x: Math.max(0, Math.min(map.view.size.w, ((clientX - rect.left) / rect.width) * map.view.size.w)), y: Math.max(0, Math.min(map.view.size.h, ((clientY - rect.top) / rect.height) * map.view.size.h)) };
  };
  const handleMapCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!editorMode || dragRef.current.moved) return;
    const surface = map.view.mode === 'graph' ? graphSurfaceRef.current : hotspotSurfaceRef.current;
    if (surface) setEditorPos(pointOnMap(event.clientX, event.clientY, surface));
  };
  const closeEditor = () => { setEditorPos(null); setEditorNodeId(null); setEditorName(''); setEditorDescription(''); setEditorKind(''); setEditorOpenSlots([]); setEditorRequirements(''); setEditorWorldbookIds([]); setEditorSceneBackground(undefined); };
  const beginEditNode = (nodeId: string) => {
    const node = map.nodes[nodeId]; if (!node) return;
    setEditorNodeId(nodeId); setEditorPos(node.pos); setEditorName(node.name); setEditorDescription(node.description ?? ''); setEditorRegionId(node.regionId); setEditorAnchorId(currentNode?.id ?? nodes[0]?.id ?? ''); setEditorKind(node.kind.join(', ')); setEditorOpenSlots(node.openSlots ?? []); setEditorWorldbookIds(node.worldbookIds.filter((id) => worldbooks.some((entry) => entry.id === id))); setEditorDiscovered(node.discovered); setEditorRequirements(''); setEditorSceneBackground(node.sceneBackground);
  };
  const generateEditorText = async () => {
    const suggestion = await onSuggestNode({ requirements: editorRequirements.trim(), regionName: map.regions[editorRegionId]?.name ?? editorRegionId, anchorName: map.nodes[editorAnchorId]?.name ?? editorAnchorId });
    if (suggestion) { setEditorName(suggestion.name); setEditorDescription(suggestion.description); }
  };
  const saveEditorNode = () => {
    if (!editorPos) return;
    const common = { name: editorName, description: editorDescription, regionId: editorRegionId, kind: editorKind.split(/[,，]/), openSlots: editorOpenSlots, worldbookIds: editorWorldbookIds, discovered: editorDiscovered, pos: editorPos, sceneBackground: editorSceneBackground };
    const saved = editorNodeId ? onEditNode(editorNodeId, common) : onCreateNode({ ...common, anchorNodeId: editorAnchorId, travelSlots: Math.max(0, Math.floor(Number(editorTravelSlots) || 0)) });
    if (saved) { closeEditor(); setEditorMode(false); }
  };
  const deleteEditorNode = () => { if (editorNodeId && onDeleteNode(editorNodeId)) { closeEditor(); setEditorMode(false); } };
  const beginPan = (event: PointerEvent<HTMLDivElement>) => {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      const points = [...pointersRef.current.values()]; const dx = points[0].x - points[1].x; const dy = points[0].y - points[1].y;
      const rect = event.currentTarget.getBoundingClientRect(); const centerX = (points[0].x + points[1].x) / 2 - rect.left; const centerY = (points[0].y + points[1].y) / 2 - rect.top;
      pinchRef.current = { distance: Math.max(1, Math.hypot(dx, dy)), zoom, contentX: (centerX - offset.x) / zoom, contentY: (centerY - offset.y) / zoom }; dragRef.current.pointerId = -1; return;
    }
    if (event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: offset.x, originY: offset.y, moved: false };
  };
  const movePan = (event: PointerEvent<HTMLDivElement>) => {
    if (pointersRef.current.has(event.pointerId)) pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2 && pinchRef.current.distance > 0) {
      const points = [...pointersRef.current.values()]; const dx = points[0].x - points[1].x; const dy = points[0].y - points[1].y;
      const rect = event.currentTarget.getBoundingClientRect(); const centerX = (points[0].x + points[1].x) / 2 - rect.left; const centerY = (points[0].y + points[1].y) / 2 - rect.top;
      const nextZoom = Math.max(0.65, Math.min(2.5, Number((pinchRef.current.zoom * Math.hypot(dx, dy) / pinchRef.current.distance).toFixed(2))));
      setZoom(nextZoom); setOffset({ x: centerX - pinchRef.current.contentX * nextZoom, y: centerY - pinchRef.current.contentY * nextZoom }); return;
    }
    if (dragRef.current.pointerId !== event.pointerId) return; const dx = event.clientX - dragRef.current.startX; const dy = event.clientY - dragRef.current.startY; if (Math.abs(dx) + Math.abs(dy) > 4 && !dragRef.current.moved) { dragRef.current.moved = true; event.currentTarget.setPointerCapture(event.pointerId); } setOffset({ x: dragRef.current.originX + dx, y: dragRef.current.originY + dy });
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => { pointersRef.current.delete(event.pointerId); if (pointersRef.current.size < 2) pinchRef.current.distance = 0; if (dragRef.current.pointerId === event.pointerId) dragRef.current.pointerId = -1; };
  const changeZoom = (delta: number) => setZoom((value) => Math.max(0.65, Math.min(2.5, Number((value + delta).toFixed(2)))));
  const resetViewport = () => { const nextZoom = map.view.mode === 'graph' ? 1.5 : 1; setZoom(nextZoom); setOffset({ x: 0, y: 0 }); if (map.view.mode === 'graph') requestAnimationFrame(() => requestAnimationFrame(centerCurrentNode)); };
  const centerCurrentNode = () => {
    if (!currentNode || !mapCanvasRef.current) return;
    const canvasRect = mapCanvasRef.current.getBoundingClientRect();
    let screenX: number | undefined; let screenY: number | undefined;
    if (map.view.mode === 'graph' && graphSurfaceRef.current) {
      const matrix = graphSurfaceRef.current.getScreenCTM();
      if (matrix) { const point = graphSurfaceRef.current.createSVGPoint(); point.x = currentNode.pos.x; point.y = currentNode.pos.y; const screenPoint = point.matrixTransform(matrix); screenX = screenPoint.x; screenY = screenPoint.y; }
    } else if (map.view.mode === 'hotspot' && hotspotSurfaceRef.current) {
      const surfaceRect = hotspotSurfaceRef.current.getBoundingClientRect(); screenX = surfaceRect.left + (currentNode.pos.x / map.view.size.w) * surfaceRect.width; screenY = surfaceRect.top + (currentNode.pos.y / map.view.size.h) * surfaceRect.height;
    }
    if (screenX === undefined || screenY === undefined) return;
    setOffset((current) => ({ x: current.x + canvasRect.left + canvasRect.width / 2 - screenX!, y: current.y + canvasRect.top + canvasRect.height / 2 - screenY! }));
  };
  const mapWheel = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault(); const nextZoom = Math.max(0.65, Math.min(2.5, Number((zoom + (event.deltaY < 0 ? 0.1 : -0.1)).toFixed(2))));
    const rect = event.currentTarget.getBoundingClientRect(); const focalX = event.clientX - rect.left; const focalY = event.clientY - rect.top;
    setOffset((current) => ({ x: focalX - ((focalX - current.x) / zoom) * nextZoom, y: focalY - ((focalY - current.y) / zoom) * nextZoom })); setZoom(nextZoom);
  };
  const currentSlotName = save.config.calendar.slots.find((slot) => slot.id === save.world.clock.slotId)?.name ?? save.world.clock.slotId;
  const selectedMapNode = (selectedMapNodeId ? map.nodes[selectedMapNodeId] : undefined) ?? currentNode;
  const energy = getEnergyState(save.world);
  const selectedMoveEnergyKind = selectedMapNode ? movementEnergyKind(save.world, selectedMapNode.id) : undefined;
  const selectedMoveEnergyCost = selectedMoveEnergyKind ? energyCostForAction(save.world, save.config.actionCosts, selectedMoveEnergyKind) : 0;
  const selectedMoveAffordable = selectedMoveEnergyKind ? canAffordEnergy(save.world, save.config.actionCosts, selectedMoveEnergyKind) : true;
  const selectedScope = nodeScopeLabel(deriveNodeScope(selectedMapNode, save.world.clock.slotId));
  const progressForState = (state: MapSheetState) => state === 'expanded' ? 1 : state === 'half' ? 0.5 : 0;
  const stateForProgress = (progress: number): MapSheetState => progress >= 0.72 ? 'expanded' : progress > 0.04 ? 'half' : 'collapsed';
  const setSheetProgress = (kind: 'tool' | 'detail', progress: number) => {
    const next = Math.max(0, Math.min(1, progress));
    if (kind === 'tool') { setToolSheetProgress(next); setToolSheetState(stateForProgress(next)); }
    else { setDetailSheetProgress(next); setDetailSheetState(stateForProgress(next)); }
  };
  const selectMapNode = (nodeId: string) => { if (!map.nodes[nodeId]?.discovered) return; setSelectedMapNodeId(nodeId); setToolSheetProgress(0); setToolSheetState('collapsed'); setDetailSheetProgress(1); setDetailSheetState('expanded'); };
  const beginSheetDrag = (event: PointerEvent<HTMLElement>) => {
    const kind = event.currentTarget.closest('.map-detail-sheet') ? 'detail' : 'tool';
    const progress = kind === 'detail' ? detailSheetProgress : toolSheetProgress;
    const now = performance.now();
    sheetDragRef.current = { pointerId: event.pointerId, kind, startY: event.clientY, startProgress: progress, currentProgress: progress, moved: false, startTime: now, lastY: event.clientY, lastTime: now, lastVelocity: 0 };
    setSheetDraggingKind(kind);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveSheetDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = sheetDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const now = performance.now();
    const dragDistance = Math.max(180, Math.min(window.innerHeight * 0.58, 520));
    const next = drag.startProgress + (drag.startY - event.clientY) / dragDistance;
    if (Math.abs(event.clientY - drag.startY) > 6) drag.moved = true;
    const elapsed = Math.max(1, now - drag.lastTime);
    drag.lastVelocity = (event.clientY - drag.lastY) / elapsed;
    drag.currentProgress = Math.max(0, Math.min(1, next));
    drag.lastY = event.clientY;
    drag.lastTime = now;
    setSheetProgress(drag.kind, drag.currentProgress);
    if (drag.moved) event.preventDefault();
  };
  const updateSheetState = (kind: 'tool' | 'detail', state: MapSheetState) => {
    const progress = progressForState(state);
    setSheetProgress(kind, progress);
    if (kind === 'detail' && state === 'collapsed') setSelectedMapNodeId(null);
  };
  const endSheetDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = sheetDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const moved = drag.moved;
    const elapsed = Math.max(1, performance.now() - drag.startTime);
    const velocity = Math.abs(drag.lastVelocity) > 0 ? drag.lastVelocity : (event.clientY - drag.startY) / elapsed;
    const kind = drag.kind;
    const currentProgress = drag.currentProgress;
    drag.pointerId = -1;
    setSheetDraggingKind(null);
    if (!moved) return;
    event.preventDefault();
    const target = Math.abs(velocity) > 0.28 ? (velocity < 0 ? 1 : 0) : currentProgress;
    setSheetProgress(kind, target);
    if (kind === 'detail' && target <= 0.04) setSelectedMapNodeId(null);
  };
  const handleSheetClick = (kind: 'tool' | 'detail') => (event: MouseEvent<HTMLElement>) => {
    if (sheetDragRef.current.moved) { event.preventDefault(); event.stopPropagation(); sheetDragRef.current.moved = false; return; }
    event.preventDefault();
    const progress = kind === 'detail' ? detailSheetProgress : toolSheetProgress;
    updateSheetState(kind, progress > 0.04 ? 'collapsed' : kind === 'tool' ? 'expanded' : 'half');
  };
  const sheetStyle = (progress: number) => ({ '--sheet-progress': progress } as CSSProperties);
  return <section className="map-screen">
    <div className="map-top-panel">
      <div className="map-toolbar"><div className="map-title"><strong>{currentNode?.name ?? save.world.player.nodeId}</strong></div><div className="map-toolbar-meta"><span>第 {save.world.clock.day} 天 · {currentSlotName}</span>{energy?.enabled && <span>体力 {energy.current}/{energy.max}</span>}<span>{map.view.mode === 'graph' ? 'Graph' : 'Hotspot'} · {Math.round(zoom * 100)}%</span></div></div>
      <div className="map-quick-actions" aria-label="地图快捷操作"><button type="button" className={`map-icon-button ${editorMode ? 'active' : ''}`} aria-label={editorMode ? '退出编辑地图' : '编辑地图'} title={editorMode ? '退出编辑地图' : '编辑地图'} onClick={() => { setEditorMode((value) => !value); closeEditor(); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Z" /><path d="m14.3 6.7 3.5 3.5M4 20h16" /></svg></button><button type="button" className="map-icon-button" aria-label={`切换到 ${map.view.mode === 'graph' ? 'Hotspot' : 'Graph'}`} title={`切换到 ${map.view.mode === 'graph' ? 'Hotspot' : 'Graph'}`} onClick={onToggleMode}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5 12 3l8 2.5L12 8 4 5.5Z" /><path d="m4 12 8 3.5 8-3.5M4 16.5 12 20l8-3.5" /></svg></button></div>
    </div>
    <div ref={mapCanvasRef} className="map-canvas" onClick={handleMapCanvasClick} onWheel={mapWheel} onPointerDown={beginPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan}>
      {map.view.mode === 'graph' ? <svg ref={graphSurfaceRef} className={`map-svg ${editorMode ? 'editing' : ''}`} style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }} viewBox={`0 0 ${map.view.size.w} ${map.view.size.h}`} role="img" aria-label="世界地图">
        <g className="map-edges">{map.edges.map((edge) => { const from = map.nodes[edge.from]; const to = map.nodes[edge.to]; if (!from || !to) return null; const visible = from.discovered || to.discovered; return <line key={edgeKey(edge)} className={visible ? '' : 'fog'} x1={from.pos.x} y1={from.pos.y} x2={to.pos.x} y2={to.pos.y} />; })}</g>
        <g className="map-nodes">{nodes.map((node) => { const isCurrent = node.id === save.world.player.nodeId; const canSelect = node.discovered; return <g key={node.id} className={`map-node ${node.discovered ? 'discovered' : 'undiscovered'} ${isCurrent ? 'current' : ''} ${selectedMapNodeId === node.id ? 'selected' : ''}`} role={editorMode || canSelect ? 'button' : undefined} tabIndex={editorMode || canSelect ? 0 : undefined} onClick={(event) => { event.stopPropagation(); if (editorMode) beginEditNode(node.id); else if (canSelect && !dragRef.current.moved) selectMapNode(node.id); }} onKeyDown={(event) => { if ((editorMode || canSelect) && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); if (editorMode) beginEditNode(node.id); else if (canSelect) selectMapNode(node.id); } }}><circle cx={node.pos.x} cy={node.pos.y} r={isCurrent ? 28 : 23} /><text x={node.pos.x} y={node.pos.y + 50} textAnchor="middle">{node.discovered ? node.name : '未发现地点'}</text>{isCurrent && <text className="map-node-marker" x={node.pos.x} y={node.pos.y + 6} textAnchor="middle">你</text>}<GraphMapPresence people={mapPresence.byNode[node.id] ?? []} visuals={mapPresence.visuals} avatarUrls={mapAvatarUrls} x={node.pos.x} y={node.pos.y} />{encounterTraces[node.id]?.[0] && <text className="map-node-trace" x={node.pos.x} y={node.pos.y + 66} textAnchor="middle">{encounterTraceLabel(encounterTraces[node.id][0])}</text>}</g>; })}</g>
      </svg> : <div className="hotspot-editor"><div ref={hotspotSurfaceRef} className={`hotspot-canvas ${editorMode ? 'editing' : ''}`} style={{ aspectRatio: `${map.view.size.w} / ${map.view.size.h}`, backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: '0 0' }} role="application" aria-label="Hotspot 地图">{nodes.map((node) => { const isCurrent = node.id === save.world.player.nodeId; const canSelect = node.discovered; return <button key={node.id} className={`hotspot-pin ${isCurrent ? 'current' : ''} ${selectedMapNodeId === node.id ? 'selected' : ''}`} style={{ left: `${(node.pos.x / map.view.size.w) * 100}%`, top: `${(node.pos.y / map.view.size.h) * 100}%` }} onClick={(event) => { event.stopPropagation(); if (editorMode) beginEditNode(node.id); else if (canSelect) selectMapNode(node.id); }} title={node.name}><span className="hotspot-pin-label">{node.discovered ? node.name : '未发现'}</span><HotspotMapPresence people={mapPresence.byNode[node.id] ?? []} visuals={mapPresence.visuals} avatarUrls={mapAvatarUrls} />{encounterTraces[node.id]?.[0] && <span className="hotspot-trace">{encounterTraceLabel(encounterTraces[node.id][0])}</span>}</button>; })}{!backgroundUrl && <span className="hotspot-empty">上传底图后可使用热点地图；编辑模式下点击空白处创建地点。</span>}</div><p className="io-scope">普通模式点击已发现图钉查看详情，展开地点抽屉后可前往；编辑模式点击图钉可修改地点，点击空白处可新建。</p></div>}
      {editorMode && !editorPos && <div className="map-editor-hint">点击空白处新建地点，或点击已有节点进行编辑；仍可拖动和缩放地图。</div>}
      {editorPos && <div className="map-editor-card" role="dialog" aria-label="新建地点" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
        <div className="list-heading"><strong>{editorNodeId ? '编辑地点' : '新建地点'}</strong><small>坐标 X {Math.round(editorPos.x)} / Y {Math.round(editorPos.y)}</small></div>
        <label>AI 生成要求<textarea value={editorRequirements} onChange={(event) => setEditorRequirements(event.target.value)} placeholder="例如：安静的海边小店，适合傍晚约会。" /></label>
        <button className="secondary" disabled={mapGenerating} onClick={() => void generateEditorText()}>{mapGenerating ? '正在生成…' : 'AI 生成名称与描述'}</button>
        <label>名称<input autoFocus value={editorName} onChange={(event) => setEditorName(event.target.value)} /></label>
        <label>描述<textarea value={editorDescription} onChange={(event) => setEditorDescription(event.target.value)} /></label>
        <div className="map-editor-grid"><label>区域<select value={editorRegionId} onChange={(event) => setEditorRegionId(event.target.value)}>{Object.values(map.regions).map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>{!editorNodeId && <label>连接到<select value={editorAnchorId} onChange={(event) => setEditorAnchorId(event.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>}</div>
        <div className="map-editor-grid"><label>类型<input value={editorKind} onChange={(event) => setEditorKind(event.target.value)} placeholder="室内, 商业" /></label>{!editorNodeId && <label>跨区域移动成本<input type="number" min="0" step="1" value={editorTravelSlots} onChange={(event) => setEditorTravelSlots(event.target.value)} /></label>}</div>
        <fieldset><legend>开放时段（不选表示始终开放）</legend><div className="map-slot-options">{save.config.calendar.slots.map((slot) => <label key={slot.id}><input type="checkbox" checked={editorOpenSlots.includes(slot.id)} onChange={(event) => setEditorOpenSlots((items) => event.target.checked ? [...items, slot.id] : items.filter((id) => id !== slot.id))} />{slot.name}</label>)}</div></fieldset>
        <fieldset><legend>进入地点时注入的世界书</legend>{worldbooks.length ? <div className="map-worldbook-options">{worldbooks.map((entry) => <label key={entry.id}><input type="checkbox" checked={editorWorldbookIds.includes(entry.id)} onChange={(event) => setEditorWorldbookIds((items) => event.target.checked ? [...items, entry.id] : items.filter((id) => id !== entry.id))} />{entry.name}</label>)}</div> : <p className="io-scope">暂无世界书，请先在资料页创建或导入。</p>}</fieldset>
        <fieldset><legend>面对面场景背景</legend><p className="io-scope">进入当前地点的面对面聊天时显示；可上传本地文件或保存 http(s) 外链，缺图时使用主题背景。</p>{editorNodeId ? <><div className="button-row"><label className="file-button">{editorSceneBackground ? '更换场景背景' : '上传场景背景'}<input type="file" accept="image/*" onChange={(event) => void onImportSceneBackground(editorNodeId, event.target.files?.[0])} /></label>{editorSceneBackground && <button type="button" className="danger" onClick={() => { void onRemoveSceneBackground(editorNodeId); setEditorSceneBackground(undefined); }}>移除背景</button>}</div><ImageUrlInput label="保存场景外链" onApply={(url) => onSetSceneBackgroundUrl(editorNodeId, url)} /></> : <p className="io-scope">请先保存地点，再配置场景背景。</p>}{editorSceneBackground && <small>已配置场景背景</small>}</fieldset>
        <label className="map-editor-check"><input type="checkbox" checked={editorDiscovered} onChange={(event) => setEditorDiscovered(event.target.checked)} />创建后立即显示</label>
        <div className="button-row"><button onClick={saveEditorNode} disabled={!editorName.trim() || !editorRegionId || (!editorNodeId && !editorAnchorId)}>保存地点</button><button className="secondary" onClick={() => setEditorPos(null)}>重新选位置</button>{editorNodeId && <button className="danger" onClick={deleteEditorNode} disabled={editorNodeId === save.world.player.nodeId}>删除地点</button>}<button className="secondary" onClick={closeEditor}>取消</button></div>
      </div>}
    </div>
    {activeEncounter && <EncounterDialog encounter={activeEncounter} selectedParticipantIds={encounterParticipantIds} onSelectionChange={onEncounterParticipantIdsChange} onOutcome={onEncounterOutcome} onContinue={onContinueEncounter} />}
    <details ref={toolSheetRef} open={toolSheetProgress > 0.001} data-sheet-state={toolSheetState} data-sheet-dragging={sheetDraggingKind === 'tool' ? 'true' : undefined} style={sheetStyle(toolSheetProgress)} className="map-menu map-bottom-sheet map-tool-sheet">
      <summary onPointerDown={beginSheetDrag} onPointerMove={moveSheetDrag} onPointerUp={endSheetDrag} onPointerCancel={endSheetDrag} onClick={handleSheetClick('tool')}><span>地图工具{editorMode ? ' · 编辑中' : ''}</span><span>{toolSheetState === 'expanded' ? '向下收起' : toolSheetState === 'half' ? '半展开' : '向上展开'}</span></summary>
      <div className="map-menu-content">
        <div className="map-controls"><label className="file-button">上传底图<input type="file" accept="image/*" onChange={(event) => void onImportBackground(event.target.files?.[0])} /></label><ImageUrlInput label="保存底图外链" onApply={onSetBackgroundUrl} /><button className="secondary" onClick={() => void onGenerateMap(requirements)} disabled={mapGenerating}>{mapGenerating ? '正在生成地图…' : 'AI 生成地图'}</button><button className="secondary" onClick={() => setZoom((value) => Math.min(2.5, Number((value + 0.1).toFixed(2))))}>放大</button><button className="secondary" onClick={() => setZoom((value) => Math.max(0.65, Number((value - 0.1).toFixed(2))))}>缩小</button><button className="secondary" onClick={centerCurrentNode}>回到当前位置</button><button className="secondary" onClick={resetViewport}>重置视野</button></div>
        <div className="map-generation-panel"><label>地图生成要求<textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} placeholder="例如：沿海小镇，包含车站、海边和一处适合夜晚散步的地点。" /></label><div className="map-expand-row"><label>从地点扩展<select value={anchorNodeId} onChange={(event) => setAnchorNodeId(event.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label><label>新增数量<input type="number" min="1" max="8" value={expandCount} onChange={(event) => setExpandCount(event.target.value)} /></label><button className="secondary" onClick={() => void onExpandMap(anchorNodeId, Math.max(1, Math.min(8, Number(expandCount) || 1)), requirements)} disabled={mapGenerating || !anchorNodeId}>扩展地点</button></div></div>
      </div>
    </details>
    {selectedMapNodeId && <details ref={detailSheetRef} open={detailSheetProgress > 0.001} data-sheet-state={detailSheetState} data-sheet-dragging={sheetDraggingKind === 'detail' ? 'true' : undefined} style={sheetStyle(detailSheetProgress)} className="map-menu map-bottom-sheet map-detail-sheet">
      <summary onPointerDown={beginSheetDrag} onPointerMove={moveSheetDrag} onPointerUp={endSheetDrag} onPointerCancel={endSheetDrag} onClick={handleSheetClick('detail')}><span>{selectedMapNode?.name ?? '地点详情'}</span><span>{detailSheetState === 'expanded' ? '向下收起' : '继续展开'}</span></summary>
      <div className="map-menu-content"><div className="place-card"><span className="eyebrow">{selectedMapNode?.id === currentNode?.id ? '当前位置' : '地点详情'}</span><h2>{selectedMapNode?.name ?? save.world.player.nodeId}</h2><p>{selectedMapNode?.description ?? '从地图出发，去遇见今天的世界。'}</p>{selectedMapNode && <div className="place-details"><span>区域<strong>{map.regions[selectedMapNode.regionId]?.name ?? selectedMapNode.regionId}</strong></span><span>类型<strong>{selectedMapNode.kind.length ? selectedMapNode.kind.join('、') : '未分类'}</strong></span><span>开放<strong>{selectedMapNode.openSlots?.length ? selectedMapNode.openSlots.map((id) => save.config.calendar.slots.find((slot) => slot.id === id)?.name ?? id).join('、') : '始终开放'}</strong></span><span>范围<strong>{selectedScope}</strong></span></div>}<div className="button-row">{selectedMapNode && selectedMapNode.id !== currentNode?.id && <button onClick={() => onMove(selectedMapNode.id)} disabled={!selectedMoveAffordable}>前往此地{energy?.enabled && <small>{selectedMoveAffordable ? `体力 -${selectedMoveEnergyCost}` : `体力不足 · 需要 ${selectedMoveEnergyCost}`}</small>}</button>}{selectedMapNode && <span className="map-meta">访问 {selectedMapNode.visitCount} 次</span>}</div>{selectedMapNode && <PresenceList people={whoIsHere(save.world, selectedMapNode.id, save.world.clock.day, save.world.clock.slotId, save.config.calendar.daysPerWeek)} scope={selectedScope} />}<EncounterTraceList traces={selectedMapNode ? encounterTraces[selectedMapNode.id] ?? [] : []} /></div></div>
    </details>}
  </section>;
}

function GraphMapPresence({ people, visuals, avatarUrls, x, y }: { people: ReturnType<typeof whoIsWhere>; visuals: Record<string, MapPresenceVisual>; avatarUrls: Record<string, string>; x: number; y: number }) {
  if (!people.length) return null;
  return <g className="map-presence-stack" transform={`translate(${x + 58} ${y - 76})`} aria-label={`这里有${people.map((person) => person.name).join('、')}`}>{people.slice(0, 3).map((person, index) => { const visual = visuals[person.id]; const avatarUrl = avatarUrls[person.id]; const avatarX = index * 56; return <g key={person.id} transform={`translate(${avatarX} 0)`}><title>{person.name}</title><circle className="map-presence-avatar-ring" cx="0" cy="0" r="32" /><circle cx="0" cy="0" r="28" fill={visual?.accentColor ?? '#667085'} />{avatarUrl ? <image className="map-presence-avatar-image" href={avatarUrl} x="-28" y="-28" width="56" height="56" preserveAspectRatio="xMidYMid slice" /> : <text className="map-presence-avatar-initial" x="0" y="10" textAnchor="middle">{visual?.initial ?? '?'}</text>}</g>; })}{people.length > 3 && <text className="map-presence-more" x="168" y="10">+{people.length - 3}</text>}</g>;
}

function HotspotMapPresence({ people, visuals, avatarUrls }: { people: ReturnType<typeof whoIsWhere>; visuals: Record<string, MapPresenceVisual>; avatarUrls: Record<string, string> }) {
  if (!people.length) return null;
  return <span className="hotspot-presence" aria-label={`这里有${people.map((person) => person.name).join('、')}`}>{people.slice(0, 3).map((person) => { const visual = visuals[person.id]; const avatarUrl = avatarUrls[person.id]; return <span key={person.id} className="hotspot-presence-avatar" style={{ '--presence-color': visual?.accentColor ?? '#667085' } as CSSProperties} title={person.name}>{avatarUrl ? <img src={avatarUrl} alt={person.name} /> : visual?.initial ?? '?'}</span>; })}{people.length > 3 && <span className="hotspot-presence-more">+{people.length - 3}</span>}</span>;
}

function encounterTraceLabel(trace: EncounterTrace): string {
  const names = trace.characterNames.join('、');
  return `${trace.daysAgo}天前在这里见过${names}`;
}

function EncounterTraceList({ traces }: { traces: EncounterTrace[] }) {
  if (!traces.length) return null;
  return <div className="encounter-trace-list" aria-label="最近相遇残影"><span className="eyebrow">相遇残影</span>{traces.map((trace) => <span className="encounter-trace" key={`${trace.day}-${trace.characterIds.join(',')}`}>{encounterTraceLabel(trace)}</span>)}</div>;
}

function EncounterDialog({ encounter, selectedParticipantIds, onSelectionChange, onOutcome, onContinue }: { encounter: ActiveEncounter; selectedParticipantIds: string[]; onSelectionChange: (ids: string[]) => void; onOutcome: (outcome: 'continued' | 'urgent_leave') => void; onContinue: () => void }) {
  const names = encounter.candidates.map((candidate) => candidate.name).join('、');
  const formalCandidates = encounter.candidates.filter((candidate) => candidate.tier === 'formal');
  const toggle = (id: string) => onSelectionChange(selectedParticipantIds.includes(id) ? selectedParticipantIds.filter((item) => item !== id) : [...selectedParticipantIds, id]);
  return <div className="encounter-dialog" role="dialog" aria-label="相遇事件"><div className="encounter-dialog-copy"><span className="eyebrow">有人可遇</span><strong>你在这里遇见了{names}</strong><p>{encounter.scope === 'formal' ? '地点正在开放，可以正式进入范围。' : '地点尚未开放，你们只能在附近外围短暂相遇。'}</p></div>{formalCandidates.length > 0 && <div className="encounter-participant-picker"><strong>选择要正式交谈的人</strong><span className="io-scope">本次选择确认后将固定到对话结束</span><div>{formalCandidates.map((candidate) => <label key={candidate.id}><input type="checkbox" checked={selectedParticipantIds.includes(candidate.id)} onChange={() => toggle(candidate.id)} /><span>{candidate.name}</span></label>)}</div></div>}<div className="encounter-options"><button onClick={onContinue} disabled={formalCandidates.length > 0 && !selectedParticipantIds.length}>留下并对话</button><button className="secondary" onClick={() => onOutcome('urgent_leave')}>离开</button></div></div>;
}

function PresenceList({ people, scope }: { people: ReturnType<typeof whoIsHere>; scope: string }) {
  return <div className="presence-list"><div className="list-heading"><strong>现在这里</strong><span className="io-scope">{scope} · 纯本地查询</span></div>{people.length ? people.map((person) => <div className="presence-row" key={person.id}><span>{person.name}<small>{person.tier === 'formal' ? '正式角色' : '半正式 NPC'} · {person.activity}</small></span></div>) : <p className="empty">当前没有已知角色在这里。</p>}</div>;
}

type DayViewProps = {
  activePage: DayPage | null;
  onOpenPage: (page: DayPage) => void;
  onBack: () => void;
  shellEyebrow?: string;
  save: SaveFile;
  snapshots: SaveSnapshot[];
  morningBriefs: SaveFile['world']['morningBriefs'];
  morningUpdates: SaveFile['world']['morningUpdates'];
  morningStyle: SaveFile['config']['morningStyle'];
  summarizingDay: number | null;
  onAction: (kind: string) => void;
  onAcceptRental: (nodeId: string, rentRuleId?: string) => void;
  onRequestHousingUpgrade: (upgradeRuleId: string) => void;
  onAcceptJob: (nodeId: string, jobRuleId?: string) => void;
  onWorkJob: () => void;
  onAcceptShop: (nodeId: string, shopRuleId?: string) => void;
  onOperateShop: () => void;
  onSleep: () => void;
  onRestoreSnapshot: (id: string) => Promise<void>;
  onSaveDiary: (day: number, text: string) => void;
  onPresetChange: (preset: SaveFile['config']['calendar']['preset']) => void;
  onRevealEvent: (scheduledId: string) => void;
  onResolveEventChoice: (historyId: string, choiceId: string) => void;
  onExportEventHistory: () => void;
  onExportChatArchive: () => Promise<void>;
  canExportChatArchive: boolean;
  onDeleteEventHistory: (id?: string) => void;
  onMove: (nodeId: string) => void;
};
export const ROUTING_TASK_IDS: readonly TaskId[] = TASK_IDS.filter((taskId) => taskId !== 'image');

function DayView(props: DayViewProps) {
  const [activeAd, setActiveAd] = useState<SaveFile['world']['morningBriefs'][number] | null>(null);
  const [housingMode, setHousingMode] = useState<'rent' | 'buy' | null>(null);
  const [housingDetailOpen, setHousingDetailOpen] = useState(false);
  const [shopTransferOpen, setShopTransferOpen] = useState(false);
  const openAd = (entry: SaveFile['world']['morningBriefs'][number]): void => { setActiveAd(entry); setHousingMode(null); setShopTransferOpen(false); };
  const { calendar } = props.save.config;
  const capacity = availableSlots(calendar);
  const used = props.save.world.slotsUsedToday;
  const remaining = Math.max(0, capacity - used);
  const energy = getEnergyState(props.save.world);
  const latestSettlement = props.save.world.settlements.at(-1);
  const latestDiary = latestSettlement ? props.save.world.diary.find((entry) => entry.day === latestSettlement.day) : undefined;
  const archivedDiaries = [...props.save.world.diary].filter((entry) => entry.day !== latestDiary?.day).sort((a, b) => b.day - a.day);
  const slotName = calendar.slots.find((slot) => slot.id === props.save.world.clock.slotId)?.name ?? props.save.world.clock.slotId;
  const actionButtons = [
    { kind: 'explore', label: '探索', cost: props.save.config.actionCosts.explore?.slotCost ?? 0, energyCost: energyCostForAction(props.save.world, props.save.config.actionCosts, 'explore'), affordable: canAffordEnergy(props.save.world, props.save.config.actionCosts, 'explore') },
    { kind: 'rest', label: '休息', cost: props.save.config.actionCosts.rest?.slotCost ?? 0, energyCost: energyCostForAction(props.save.world, props.save.config.actionCosts, 'rest'), affordable: canAffordEnergy(props.save.world, props.save.config.actionCosts, 'rest') },
  ];
  const todayBriefs = props.morningBriefs.filter((entry) => entry.day === props.save.world.clock.day);
  const todayUpdate = props.morningUpdates.find((entry) => entry.day === props.save.world.clock.day);
  const scheduledEvents = listPendingEvents(props.save.world);
  const morningPresentation = {
    newspaper: { title: '今日晨报', eyebrow: '报纸', empty: '今天还没有晨报；进入新一天后会生成。' },
    notice_board: { title: '今日委托板', eyebrow: '委托板', empty: '今天还没有委托；进入新一天后会生成。' },
    terminal: { title: '终端推送', eyebrow: '终端', empty: '今天还没有新的推送；进入新一天后会生成。' },
    tavern: { title: '酒馆流言', eyebrow: '流言', empty: '今天酒馆还没有新的流言；进入新一天后会生成。' },
  }[props.morningStyle];
  const housing = props.save.world.player.housing;
  const housingNode = housing ? props.save.world.map.nodes[housing.nodeId] : undefined;
  const housingTier = getHousingTier(props.save.world);
  const housingUpgrade = getHousingUpgradeOffer(props.save.world);
  const atHome = Boolean(housing && props.save.world.player.nodeId === housing.nodeId);
  const softGoals = getSoftGoals(props.save.world, calendar);
  const rentalNodeId = activeAd?.nodeId && props.save.world.map.nodes[activeAd.nodeId] ? activeAd.nodeId : props.save.world.player.nodeId;
  const rentalQuote = getRentalQuote(props.save.world, rentalNodeId);
  const nextRentDay = housing ? props.save.world.player.stats[housing.nextDueDayStatKey] : undefined;
  const job = props.save.world.player.job;
  const jobNode = job ? props.save.world.map.nodes[job.nodeId] : undefined;
  const jobQuote = job ? getJobQuote(props.save.world, job.nodeId, job.jobRuleId, false) : undefined;
  const jobShift = jobQuote ? calendar.slots.find((slot) => slot.id === jobQuote.rule.shiftSlotId) : undefined;
  const jobStatus = getJobShiftStatus(props.save.world, calendar);
  const workCost = props.save.config.actionCosts.work?.slotCost ?? 0;
  const workEnergyCost = energyCostForAction(props.save.world, props.save.config.actionCosts, 'work');
  const hasWorkEnergy = canAffordEnergy(props.save.world, props.save.config.actionCosts, 'work');
  const canWork = jobStatus === 'ready' && hasWorkEnergy && (calendar.unlimitedSlots || workCost <= remaining);
  const jobStatusText = {
    unemployed: '先在晨报接受岗位', invalid: '岗位配置无效', upcoming: `等待${jobShift?.name ?? '班次'}开始`, ready: '现在可以上班',
    wrong_node: `需先到${jobNode?.name ?? job?.nodeId ?? '工作地点'}`, worked: '今日班次已完成', missed: '今日班次已错过',
  }[jobStatus];
  const workStatusText = jobStatus === 'ready' && !hasWorkEnergy ? `体力不足 · 需要 ${workEnergyCost}` : jobStatusText;
  const jobOfferNodeId = activeAd?.nodeId && props.save.world.map.nodes[activeAd.nodeId] ? activeAd.nodeId : props.save.world.player.nodeId;
  const jobOffer = getJobQuote(props.save.world, jobOfferNodeId);
  const shop = props.save.world.player.shop;
  const shopNode = shop ? props.save.world.map.nodes[shop.nodeId] : undefined;
  const shopOffer = shop ? getShopOffer(props.save.world, shop.nodeId, shop.shopRuleId, false) : undefined;
  const shopOpenSlots = shopOffer?.rule.openSlotIds.map((id) => calendar.slots.find((slot) => slot.id === id)?.name ?? id).join('、');
  const shopStatus = getShopStatus(props.save.world, calendar);
  const hasShopActionCost = Boolean(props.save.config.actionCosts.operate_shop);
  const shopCost = props.save.config.actionCosts.operate_shop?.slotCost ?? 0;
  const shopEnergyCost = energyCostForAction(props.save.world, props.save.config.actionCosts, 'operate_shop');
  const hasShopEnergy = canAffordEnergy(props.save.world, props.save.config.actionCosts, 'operate_shop');
  const canOperateShop = shopStatus === 'ready' && hasShopActionCost && hasShopEnergy && (calendar.unlimitedSlots || shopCost <= remaining);
  const shopStatusText = {
    no_shop: '先在晨报接手店铺', invalid: '店铺配置无效', closed: `等待营业时段${shopOpenSlots ? `（${shopOpenSlots}）` : ''}`, ready: '现在可以营业',
    wrong_node: `需先到${shopNode?.name ?? shop?.nodeId ?? '店铺地点'}`, opened: '今日已经营业',
  }[shopStatus];
  const operateShopStatusText = shopStatus === 'ready' && !hasShopActionCost ? '营业成本未配置' : shopStatus === 'ready' && !hasShopEnergy ? `体力不足 · 需要 ${shopEnergyCost}` : shopStatusText;
  const shopOfferNodeId = activeAd?.nodeId && props.save.world.map.nodes[activeAd.nodeId] ? activeAd.nodeId : props.save.world.player.nodeId;
  const transferOffer = getShopOffer(props.save.world, shopOfferNodeId);
  const transferOpenSlots = transferOffer?.rule.openSlotIds.map((id) => calendar.slots.find((slot) => slot.id === id)?.name ?? id).join('、');
  const renderDaySubpage = (page: DayPage) => {
    if (page === 'calendar') return <div className="day-card event-calendar-card"><div className="list-heading"><div><span className="eyebrow">日历</span><h3>已排程事件</h3></div><span className="io-scope">纯本地 · 不调用 API</span></div>{scheduledEvents.length ? <div className="event-calendar-list">{scheduledEvents.map((scheduled) => { const event = props.save.world.eventDefs[scheduled.eventId]; const revealed = Boolean(scheduled.revealed); const slot = calendar.slots.find((item) => item.id === scheduled.slotId); const node = props.save.world.map.nodes[scheduled.nodeId]; return <div className="list-row" key={scheduled.id}><span><strong>{revealed ? event?.title ?? scheduled.eventId : '未公开事件'}</strong><small>第 {scheduled.day} 天 · {slot?.name ?? scheduled.slotId}{revealed && ` · ${node?.name ?? scheduled.nodeId}`}</small></span>{revealed ? <span className="io-scope">已公开</span> : <button className="secondary" onClick={() => props.onRevealEvent(scheduled.id)}>公开线索</button>}</div>; })}</div> : <p className="empty">目前没有待触发事件。</p>}</div>;
    if (page === 'goals') return <div className="day-card soft-goals-card"><div className="list-heading"><div><span className="eyebrow">生活方向</span><h3>常驻软目标</h3></div><span className="io-scope">确定性事实 · 不消耗时段</span></div><div className="soft-goal-list">{softGoals.map((goal) => <div className="list-row" key={goal.id}><span><strong>{goal.title}</strong><small>{goal.detail}</small></span><span className={`io-scope ${goal.status === 'complete' ? 'goal-complete' : ''}`}>{goal.status === 'complete' ? '已推进' : '可推进'}</span></div>)}</div></div>;
    if (page === 'housing') return <div className="day-card"><div className="list-heading"><div><span className="eyebrow">住所</span><h3>{housingNode?.name ?? '住所状态'}</h3></div><span className="io-scope">查看与安排升级不消耗时段</span></div>{housing ? <><p>当前等级：{housingTier?.name ?? housing.tierId}{Number.isFinite(nextRentDay) ? ` · 下次租金第 ${nextRentDay} 天结算` : ''}</p>{housingUpgrade ? <div className="morning-housing-detail"><strong>{housingUpgrade.rule.name}</strong><p>{housingUpgrade.currentTier.name} → {housingUpgrade.nextTier.name} · 费用 {formatCurrency(housingUpgrade.cost, housingUpgrade.currency)}；当前余额 {formatCurrency(housingUpgrade.balance, housingUpgrade.currency)}。</p><div className="button-row">{!atHome && <button className="secondary" onClick={() => props.onMove(housing.nodeId)}>前往住所</button>}<button onClick={() => { if (window.confirm(`确认安排${housingUpgrade.rule.name}？费用将在今日结算时扣除。`)) props.onRequestHousingUpgrade(housingUpgrade.rule.id); }} disabled={housingUpgrade.requested || !housingUpgrade.affordable || !atHome}>{housingUpgrade.requested ? '今晚将完成升级' : !atHome ? '需先回到住所' : !housingUpgrade.affordable ? '余额不足' : '安排升级'}</button></div></div> : <p className="empty">当前住所已没有可用的后续升级。</p>}</> : <p className="empty">当前还没有住所，可在晨报中查看住房方案。</p>}</div>;
    if (page === 'career') return <div className="day-card"><div className="list-heading"><div><span className="eyebrow">事业</span><h3>工作与店铺</h3></div><span className="io-scope">确定性行动</span></div>{job ? <p>工作：{jobQuote?.rule.name ?? job.jobRuleId} · {jobNode?.name ?? job.nodeId} · {jobShift?.name ?? jobQuote?.rule.shiftSlotId ?? '未知班次'}开班{jobQuote ? ` · 工资 ${formatCurrency(jobQuote.wage, jobQuote.currency)}` : ''}</p> : <p className="empty">当前没有已接受的岗位。</p>}{shop ? <p>店铺：{shopOffer?.rule.name ?? shop.shopRuleId} · {shopNode?.name ?? shop.nodeId}{shopOpenSlots ? ` · ${shopOpenSlots}可营业` : ''}</p> : <p className="empty">当前没有经营中的店铺。</p>}<div className="day-actions"><button onClick={props.onWorkJob} disabled={!canWork}>上班<small>{workStatusText}</small></button><button onClick={props.onOperateShop} disabled={!canOperateShop}>营业<small>{operateShopStatusText}</small></button></div></div>;
    if (page === 'settlement') return <div className="settlement-card"><div className="list-heading"><h3>最近结算</h3>{props.summarizingDay === latestSettlement?.day && <span className="request-status requesting">正在生成日记…</span>}</div>{latestSettlement ? <><div className="settlement-grid"><span>日期<strong>第 {latestSettlement.day} 天</strong></span><span>足迹<strong>{latestSettlement.footprint.join('、') || '无'}</strong></span><span>遇见<strong>{latestSettlement.met.join('、') || '无人'}</strong></span><span>收支<strong>{settlementFinancialSummary(latestSettlement, props.save.world.economy)}</strong></span></div>{latestDiary && <DiaryEditor entry={latestDiary} onSave={props.onSaveDiary} />}</> : <p className="empty">完成今天或选择提前休息后，这里会显示日结算与日记。</p>}</div>;
    if (page === 'diary') return <div className="diary-archive"><div className="list-heading"><h3>日记回顾</h3><span className="io-scope">共 {props.save.world.diary.length} 天</span></div>{props.save.world.diary.length ? [...props.save.world.diary].sort((a, b) => b.day - a.day).map((entry) => <details key={entry.day}><summary>第 {entry.day} 天{entry.editedAt ? ' · 已编辑' : ''}</summary><DiaryEditor entry={entry} onSave={props.onSaveDiary} /></details>) : <p className="empty">完成第一天结算后，这里会保留历日日记。</p>}</div>;
    if (page === 'events') return <div className="day-card event-history-card"><div className="list-heading"><div><span className="eyebrow">事件回顾</span><h3>已触发事件</h3></div><div className="button-row"><span className="io-scope">只读事实 · 不回滚世界</span>{props.save.world.eventHistory.length > 0 && <><button className="secondary" onClick={props.onExportEventHistory}>导出事件档案</button><button className="danger" onClick={() => props.onDeleteEventHistory()}>删除全部</button></>}</div></div>{props.save.world.eventHistory.length ? <div className="event-history-list">{[...props.save.world.eventHistory].reverse().map((entry) => <details className="event-history-entry" key={entry.id}><summary><span><strong>{entry.title}</strong><small>第 {entry.day} 天</small></span></summary><div className="fold-body"><p>{entry.narrative ?? entry.content ?? '该事件没有附带叙述。'}</p>{entry.choice && <p><strong>选择：</strong>{entry.choice}</p>}<div className="button-row"><button className="danger" onClick={() => props.onDeleteEventHistory(entry.id)}>删除这条回顾</button></div></div></details>)}</div> : <p className="empty">触发事件后，这里会保留可回看的本地记录。</p>}</div>;
    if (page === 'story') return <div className="day-card story-progress-card"><div className="list-heading"><div><span className="eyebrow">剧情进展</span><h3>里程碑与章节</h3></div><span className="io-scope">纯本地摘要</span></div>{props.save.world.milestones.length ? <div className="milestone-list">{[...props.save.world.milestones].sort((left, right) => right.day - left.day).map((milestone) => <div className="list-row" key={milestone.id}><span><strong>{milestone.text}</strong><small>第 {milestone.day} 天{milestone.charIds.length ? ` · ${milestone.charIds.map((id) => props.save.world.characters[id]?.name ?? id).join('、')}` : ''}</small></span></div>)}</div> : <p className="empty">触发带里程碑的事件后，这里会显示剧情节点。</p>}{props.save.world.chapters.length ? <div className="chapter-summary-list">{props.save.world.chapters.map((chapter) => <details key={chapter.id}><summary>第 {chapter.fromDay}–{chapter.toDay} 天章节摘要</summary><p>{chapter.text}</p></details>)}</div> : <p className="empty">生成章节摘要后，这里会保留较早剧情的压缩记录。</p>}</div>;
    return <div className="snapshot-card"><div className="list-heading"><h3>本地快照</h3><span className="io-scope">结算时自动保存，保留最近 7 天</span></div>{props.snapshots.length ? props.snapshots.map((snapshot) => <div className="list-row" key={snapshot.id}><span>第 {snapshot.day} 天<strong>{snapshot.save.world.clock.day === snapshot.day + 1 ? ' · 次日开始前' : ''}</strong><small>保存于 {snapshot.createdAt}</small></span><button className="secondary" onClick={() => void props.onRestoreSnapshot(snapshot.id)}>回到这一天</button></div>) : <p className="empty">完成一次日结算后，这里会出现可回退的快照。</p>}</div>;
  };
  if (props.activePage) return <SubpageShell eyebrow={props.shellEyebrow ?? '日程'} title={DAY_PAGE_DEFINITIONS.find((entry) => entry.id === props.activePage)?.pageTitle ?? '日程'} pageId={props.activePage} onBack={props.onBack}>{renderDaySubpage(props.activePage)}</SubpageShell>;
  return <section className="day-default-view">
    <div className="section-heading"><div><span className="eyebrow">生活节奏</span><h2>第 {props.save.world.clock.day} 天 · {slotName}</h2></div><span className="slot-count">{calendar.unlimitedSlots ? '无限时段' : `${used} / ${capacity}`}</span></div>
    <div className="day-card"><label>每日节奏<select value={calendar.preset} disabled={used > 0} onChange={(event) => props.onPresetChange(event.target.value as SaveFile['config']['calendar']['preset'])}><option value="leisure">悠闲 · 6 时段</option><option value="standard">标准 · 4 时段</option><option value="tight">紧凑 · 3 时段</option><option value="sandbox">沙盒 · 不消耗</option></select></label><p className="io-scope">行动只修改本地确定性状态，不调用 API。节奏仅能在当天尚未行动时切换。</p>{energy && <p className="io-scope">体力：{energy.enabled ? `${energy.current} / ${energy.max} · 休息恢复 ${energy.restRestore}` : '限制已关闭 · 数值保留'}</p>}{housing && <div className="button-row"><p className="io-scope">住所：{housingNode?.name ?? housing.nodeId} · {housingTier?.name ?? housing.tierId}{Number.isFinite(nextRentDay) ? ` · 下次租金第 ${nextRentDay} 天结算` : ''}</p><button className="secondary" onClick={() => setHousingDetailOpen((open) => !open)}>{housingDetailOpen ? '收起住所' : '查看住所'}</button></div>}{job && <p className="io-scope">工作：{jobQuote?.rule.name ?? job.jobRuleId} · {jobNode?.name ?? job.nodeId} · {jobShift?.name ?? jobQuote?.rule.shiftSlotId ?? '未知班次'}开班{jobQuote ? ` · 工资 ${formatCurrency(jobQuote.wage, jobQuote.currency)}` : ''}</p>}{shop && <p className="io-scope">店铺：{shopOffer?.rule.name ?? shop.shopRuleId} · {shopNode?.name ?? shop.nodeId}{shopOpenSlots ? ` · ${shopOpenSlots}可营业` : ''}{shopOffer ? ` · 累计营业 ${shopOffer.openDays} 天` : ''}</p>}<div className="day-actions">{actionButtons.map((action) => <button key={action.kind} onClick={() => props.onAction(action.kind)} disabled={(!calendar.unlimitedSlots && action.cost > remaining) || !action.affordable}>{action.label}<small>{calendar.unlimitedSlots ? '不消耗时段' : `${action.cost} 时段`}{energy?.enabled ? ` · ${action.kind === 'rest' ? `恢复 ${energy.restRestore}` : `体力 -${action.energyCost}`}` : ''}</small></button>)}<button onClick={props.onWorkJob} disabled={!canWork}>上班<small>{workStatusText}{jobStatus === 'ready' && hasWorkEnergy ? ` · ${calendar.unlimitedSlots ? '不消耗时段' : `${workCost} 时段`}${energy?.enabled ? ` · 体力 -${workEnergyCost}` : ''}` : ''}</small></button><button onClick={props.onOperateShop} disabled={!canOperateShop}>营业<small>{operateShopStatusText}{shopStatus === 'ready' && hasShopActionCost && hasShopEnergy ? ` · ${calendar.unlimitedSlots ? '不消耗时段' : `${shopCost} 时段`}${energy?.enabled ? ` · 体力 -${shopEnergyCost}` : ''}` : ''}</small></button><button className="secondary" onClick={props.onSleep}>推进世界<small>结算今天 · 进入下一天</small></button></div></div>
    {housing && housingDetailOpen && <div className="morning-ad-entry"><div className="list-heading"><div><span className="eyebrow">住所</span><h3>{housingNode?.name ?? housing.nodeId}</h3></div><button className="secondary" onClick={() => setHousingDetailOpen(false)}>关闭</button></div><p>当前等级：{housingTier?.name ?? '住所等级配置无效'}。查看与安排升级不消耗时段，也不调用 API。</p>{housingUpgrade ? <div className="morning-housing-detail"><strong>{housingUpgrade.rule.name}</strong><p>{housingUpgrade.currentTier.name} → {housingUpgrade.nextTier.name} · 费用 {formatCurrency(housingUpgrade.cost, housingUpgrade.currency)}；当前余额 {formatCurrency(housingUpgrade.balance, housingUpgrade.currency)}。确认后在今日结算时完成并记入收支。</p><div className="button-row">{!atHome && <button className="secondary" onClick={() => props.onMove(housing.nodeId)}>前往住所</button>}<button onClick={() => { if (window.confirm(`确认安排${housingUpgrade.rule.name}？费用将在今日结算时扣除。`)) props.onRequestHousingUpgrade(housingUpgrade.rule.id); }} disabled={housingUpgrade.requested || !housingUpgrade.affordable || !atHome}>{housingUpgrade.requested ? '今晚将完成升级' : !atHome ? '需先回到住所' : !housingUpgrade.affordable ? '余额不足' : '安排升级'}</button></div></div> : housingTier ? <p>当前住所已没有可用的后续升级。</p> : <p>当前住所等级或升级规则配置无效。</p>}</div>}
    <div className="morning-brief-card"><div className="list-heading"><div><span className="eyebrow">{morningPresentation.eyebrow}</span><h3>{morningPresentation.title}</h3></div><span className="io-scope">最多每日一次合并更新</span></div>{todayUpdate && <div className="morning-world-meta"><span>天气：{todayUpdate.weather.label}</span>{todayUpdate.worldNote && <span>{todayUpdate.worldNote}</span>}</div>}{todayBriefs.length ? <div className="morning-brief-list">{todayBriefs.map((entry) => { const destination = resolveMorningAdDestination(entry, props.save.world); const isJobAd = entry.category === 'ad' && entry.entryKind === 'job'; const isHousingAd = entry.category === 'ad' && entry.entryKind === 'housing'; const isShopTransferAd = entry.category === 'ad' && entry.entryKind === 'shop_transfer'; return <article key={entry.id} className={`morning-brief-entry morning-${entry.category}`}><span className="eyebrow">{entry.category}</span><strong>{entry.title}</strong><p>{entry.body}</p>{(destination || isJobAd || isHousingAd || isShopTransferAd) && <div className="morning-entry-actions">{destination && <button className="secondary" onClick={() => props.onMove(destination.id)}>前往{destination.name}</button>}{isJobAd && <button onClick={() => openAd(entry)}>查看招聘</button>}{isHousingAd && <button onClick={() => openAd(entry)}>查看住房</button>}{isShopTransferAd && <button onClick={() => openAd(entry)}>查看转让</button>}</div>}</article>; })}</div> : <p className="empty">{morningPresentation.empty}</p>}{activeAd?.entryKind === 'job' && <div className="morning-ad-entry"><div className="list-heading"><h3>招聘入口</h3><button className="secondary" onClick={() => setActiveAd(null)}>关闭</button></div><p>{activeAd.body}</p>{jobOffer ? <><p>{props.save.world.map.nodes[jobOffer.nodeId]?.name ?? jobOffer.nodeId} · {calendar.slots.find((slot) => slot.id === jobOffer.rule.shiftSlotId)?.name ?? jobOffer.rule.shiftSlotId}开班 · 完成班次获得 {formatCurrency(jobOffer.wage, jobOffer.currency)}。班次占用 {calendar.unlimitedSlots ? '0' : workCost} 个时段，错过班次则当天没有工资。</p><button onClick={() => { if (window.confirm(`确认接受${jobOffer.rule.name}？`)) { props.onAcceptJob(jobOffer.nodeId, jobOffer.rule.id); setActiveAd(null); } }} disabled={Boolean(job)}>{job ? '当前已有工作' : '接受这份工作'}</button></> : <p>当前世界没有可用的确定性岗位规则。</p>}</div>}{activeAd?.entryKind === 'housing' && <div className="morning-ad-entry"><div className="list-heading"><h3>住房入口</h3><button className="secondary" onClick={() => setActiveAd(null)}>关闭</button></div><p>{activeAd.body}</p><div className="morning-housing-options"><button className={housingMode === 'rent' ? 'selected' : ''} onClick={() => setHousingMode('rent')}>查看租房方案</button><button className={housingMode === 'buy' ? 'selected' : ''} onClick={() => setHousingMode('buy')}>查看买房方案</button></div>{housingMode === 'rent' && <div className="morning-housing-detail"><strong>租房方案</strong>{rentalQuote ? <><p>{props.save.world.map.nodes[rentalQuote.nodeId]?.name ?? rentalQuote.nodeId} · 每 {rentalQuote.intervalDays} 天支付 {formatCurrency(rentalQuote.amount, rentalQuote.currency)}（{rentalQuote.currency.name}）。余额不足时允许负数，不阻断游玩。</p><button onClick={() => { if (window.confirm(`确认入住并接受${rentalQuote.rule.name}？`)) { props.onAcceptRental(rentalQuote.nodeId, rentalQuote.rule.id); setActiveAd(null); } }} disabled={Boolean(housing)}>{housing ? '当前已有生效租约' : '确认入住'}</button></> : <p>当前世界没有可用的确定性租房规则。</p>}</div>}{housingMode === 'buy' && <div className="morning-housing-detail"><strong>买房方案</strong><p>购买产权不在本切片实现；租住后可通过日程页上方的住所详情安排升级。</p></div>}</div>}{activeAd?.entryKind === 'shop_transfer' && <div className="morning-ad-entry"><div className="list-heading"><h3>店铺转让入口</h3><button className="secondary" onClick={() => setActiveAd(null)}>关闭</button></div><p>{activeAd.body}</p><button onClick={() => setShopTransferOpen(true)}>查看转让方案</button>{shopTransferOpen && <div className="morning-housing-detail"><strong>转让方案</strong>{transferOffer ? <><p>{props.save.world.map.nodes[transferOffer.nodeId]?.name ?? transferOffer.nodeId} · {transferOffer.rule.name} · {transferOpenSlots ?? '未配置'}可营业。{hasShopActionCost ? <>营业占用 {calendar.unlimitedSlots ? '0' : shopCost} 个时段；</> : <>营业成本未配置；</>}已排程到店的角色可能在营业期间主动上门。</p><button onClick={() => { if (window.confirm(`确认接手${transferOffer.rule.name}？`)) { props.onAcceptShop(transferOffer.nodeId, transferOffer.rule.id); setActiveAd(null); } }} disabled={Boolean(shop) || !hasShopActionCost}>{shop ? '当前已有店铺' : '接手这间店'}</button></> : <p>当前世界没有可用的确定性店铺规则。</p>}</div>}</div>}</div>
    <div className="day-moved-content">
    <div className="day-card soft-goals-card"><div className="list-heading"><div><span className="eyebrow">生活方向</span><h3>常驻软目标</h3></div><span className="io-scope">确定性事实 · 不消耗时段</span></div><div className="soft-goal-list">{softGoals.map((goal) => <div className="list-row" key={goal.id}><span><strong>{goal.title}</strong><small>{goal.detail}</small></span><span className={`io-scope ${goal.status === 'complete' ? 'goal-complete' : ''}`}>{goal.status === 'complete' ? '已推进' : '可推进'}</span></div>)}</div></div>
    <div className="day-card event-calendar-card"><div className="list-heading"><div><span className="eyebrow">日历</span><h3>已排程事件</h3></div><span className="io-scope">纯本地 · 不调用 API</span></div>{scheduledEvents.length ? <div className="event-calendar-list">{scheduledEvents.map((scheduled) => { const event = props.save.world.eventDefs[scheduled.eventId]; const revealed = Boolean(scheduled.revealed); const slot = calendar.slots.find((item) => item.id === scheduled.slotId); const node = props.save.world.map.nodes[scheduled.nodeId]; return <div className="list-row" key={scheduled.id}><span><strong>{revealed ? event?.title ?? scheduled.eventId : '未公开事件'}</strong><small>第 {scheduled.day} 天 · {slot?.name ?? scheduled.slotId}{revealed && ` · ${node?.name ?? scheduled.nodeId}`}</small></span>{revealed ? <span className="io-scope">已公开</span> : <button className="secondary" onClick={() => props.onRevealEvent(scheduled.id)}>公开线索</button>}</div>; })}</div> : <p className="empty">目前没有待触发事件。</p>}</div>
    <div className="day-card event-history-card"><div className="list-heading"><div><span className="eyebrow">事件回顾</span><h3>已触发事件</h3></div><div className="button-row"><span className="io-scope">只读事实 · 不回滚世界</span>{props.save.world.eventHistory.length > 0 && <><button className="secondary" onClick={props.onExportEventHistory}>导出事件档案</button><button className="danger" onClick={() => props.onDeleteEventHistory()}>删除全部</button></>}{props.canExportChatArchive && <button className="secondary" onClick={() => void props.onExportChatArchive()}>导出聊天档案</button>}</div></div>{props.save.world.eventHistory.length ? <div className="event-history-list">{[...props.save.world.eventHistory].reverse().map((entry) => { const node = props.save.world.map.nodes[entry.nodeId]; const slot = calendar.slots.find((item) => item.id === entry.slotId); const participants = entry.charIds.map((charId) => props.save.world.characters[charId]?.name ?? charId); const choices = props.save.world.eventDefs[entry.eventId]?.choices ?? []; return <details className="event-history-entry" key={entry.id}><summary><span><strong>{entry.title}</strong><small>第 {entry.day} 天 · {slot?.name ?? entry.slotId} · {node?.name ?? entry.nodeId}</small></span><span className="io-scope">{entry.scope === 'formal' ? '正式进入' : '外围'}</span></summary><div className="fold-body"><p>{entry.narrative ?? entry.content ?? '该事件没有附带叙述。'}</p>{entry.choice && <p><strong>选择：</strong>{entry.choice}</p>}{entry.resultSummary && <p><strong>结果：</strong>{entry.resultSummary}</p>}{!entry.choice && choices.length > 0 && <div className="button-row"><strong>选择结果：</strong>{choices.map((choice) => <button key={choice.id} onClick={() => props.onResolveEventChoice(entry.id, choice.id)}>{choice.label}</button>)}</div>}<small>事件 ID：{entry.eventId} · 参与者：{participants.length ? participants.join('、') : '无'}</small><div className="button-row"><button className="danger" onClick={() => props.onDeleteEventHistory(entry.id)}>删除这条回顾</button></div></div></details>; })}</div> : <p className="empty">触发事件后，这里会保留可回看的本地记录。</p>}</div>
    <div className="day-card story-progress-card"><div className="list-heading"><div><span className="eyebrow">剧情进展</span><h3>里程碑与章节</h3></div><span className="io-scope">纯本地摘要</span></div>{props.save.world.milestones.length ? <div className="milestone-list">{[...props.save.world.milestones].sort((left, right) => right.day - left.day).slice(0, 8).map((milestone) => <div className="list-row" key={milestone.id}><span><strong>{milestone.text}</strong><small>第 {milestone.day} 天{milestone.charIds.length ? ` · ${milestone.charIds.map((id) => props.save.world.characters[id]?.name ?? id).join('、')}` : ''}</small></span></div>)}</div> : <p className="empty">触发带里程碑的事件后，这里会显示剧情节点。</p>}{props.save.world.chapters.length ? <div className="chapter-summary-list">{[...props.save.world.chapters].sort((left, right) => right.toDay - left.toDay).slice(0, 3).map((chapter) => <details key={chapter.id}><summary>第 {chapter.fromDay}–{chapter.toDay} 天章节摘要</summary><p>{chapter.text}</p></details>)}</div> : <p className="empty">生成章节摘要后，这里会保留较早剧情的压缩记录。</p>}</div>
    </div>
    <div className="settlement-card"><div className="list-heading"><h3>最近结算</h3>{props.summarizingDay === latestSettlement?.day && <span className="request-status requesting">正在生成日记…</span>}</div>{latestSettlement ? <><div className="settlement-grid"><span>日期<strong>第 {latestSettlement.day} 天</strong></span><span>足迹<strong>{latestSettlement.footprint.join('、') || '无'}</strong></span><span>遇见<strong>{latestSettlement.met.join('、') || '无人'}</strong></span><span>收支<strong>{settlementFinancialSummary(latestSettlement, props.save.world.economy)}</strong></span><span>新物品<strong>{latestSettlement.itemsGained.length ? latestSettlement.itemsGained.map((entry) => `${entry.itemId} ×${entry.count}`).join('、') : '无'}</strong></span><span>明日待办<strong>{latestSettlement.appointmentsTomorrow.length ? latestSettlement.appointmentsTomorrow.map((item) => item.note ?? item.id).join('、') : '无'}</strong></span></div><div className="relation-summary"><strong>关系变化</strong>{latestSettlement.relationChanges.length ? latestSettlement.relationChanges.map((change) => { const numbers = settlementRelationNumbers(change, props.save.config.showNumbers); return <div className="relation-change" key={change.charId}><p>{change.prose}</p>{numbers && <small>{numbers}</small>}</div>; }) : <p className="empty">本阶段暂无相遇记录。</p>}</div>{latestDiary && <DiaryEditor entry={latestDiary} onSave={props.onSaveDiary} />}</> : <p className="empty">完成今天或选择提前休息后，这里会显示日结算与日记。</p>}</div>
    <div className="day-moved-content">
    <details className="fold-card"><summary>本地快照</summary><div className="fold-body"><div className="snapshot-card"><div className="list-heading"><h3>本地快照</h3><span className="io-scope">结算时自动保存，保留最近 7 天</span></div>{props.snapshots.length ? props.snapshots.map((snapshot) => <div className="list-row" key={snapshot.id}><span>第 {snapshot.day} 天<strong>{snapshot.save.world.clock.day === snapshot.day + 1 ? ' · 次日开始前' : ''}</strong><small>保存于 {snapshot.createdAt}</small></span><button className="secondary" onClick={() => void props.onRestoreSnapshot(snapshot.id)}>回到这一天</button></div>) : <p className="empty">完成一次日结算后，这里会出现可回退的快照。</p>}</div></div></details>
    <div className="diary-archive"><div className="list-heading"><h3>日记回顾</h3><span className="io-scope">共 {props.save.world.diary.length} 天</span></div>{archivedDiaries.length ? archivedDiaries.map((entry) => <details key={entry.day}><summary>第 {entry.day} 天{entry.editedAt ? ' · 已编辑' : ''}</summary><DiaryEditor entry={entry} onSave={props.onSaveDiary} /></details>) : <p className="empty">完成第一天结算后，这里会保留历日日记。</p>}</div>
    </div>
  </section>;
}

function DiaryEditor(props: { entry: SaveFile['world']['diary'][number]; onSave: (day: number, text: string) => void }) {
  const [text, setText] = useState(props.entry.text);
  useEffect(() => { setText(props.entry.text); }, [props.entry.day, props.entry.text]);
  return <div className="diary-editor"><div className="list-heading"><strong>第 {props.entry.day} 天日记</strong>{props.entry.editedAt && <small>已手动编辑</small>}</div><textarea value={text} onChange={(event) => setText(event.target.value)} /><button onClick={() => props.onSave(props.entry.day, text)}>保存日记</button></div>;
}

function giftReactionLabel(reaction: GiftHistoryEntry['reaction']): string {
  if (!reaction) return '等待回应';
  return reaction === 'special' ? '特别喜欢' : reaction === 'liked' ? '喜欢' : reaction === 'disliked' ? '拒绝' : '反应平淡';
}

function ChatView(props: {
  characters: CharacterCard[];
  worldCharacters: SaveFile['world']['characters'];
  worldCharacter?: SaveFile['world']['characters'][string];
  world: SaveFile['world'];
  hiddenTopicStyle: SaveFile['config']['hiddenTopicStyle'];
  participantIds: string[];
  participantsLocked: boolean;
  onParticipantIdsChange: (ids: string[]) => void;
  sceneBackground?: AssetRef;
  playerLabel: string;
  selectedCharacterId: string;
  setSelectedCharacterId: (id: string) => void;
  messages: ChatMessage[];
  input: string;
  setInput: (value: string) => void;
  onAppend: () => Promise<void>;
  onGenerate: () => Promise<void>;
  onEditMessage: (index: number, content: string) => Promise<void>;
  onDeleteMessage: (index: number) => Promise<void>;
  onGenerateVoice: (index: number, requestId?: string) => Promise<void>;
  onDownloadVoice: (index: number) => Promise<void>;
  onGenerateCg: (index: number, scenePrompt: string, characterIds: string[], includesPlayer: boolean) => Promise<void>;
  onDownloadCg: (index: number) => Promise<void>;
  onDeleteCg: (index: number) => Promise<void>;
  voiceAvailableCharacterIds: string[];
  ttsBusy: boolean;
  imageBusy: boolean;
  imageConfigured: boolean;
  regenerateInput: string;
  setRegenerateInput: (value: string) => void;
  onRegenerate: () => Promise<void>;
  canRegenerate: boolean;
  requestStatus: RequestStatus;
  busy: boolean;
  replyInProgress: boolean;
  pendingOps: PendingOpsRecovery | null;
  interrupted: boolean;
  onRetryInterrupted: () => Promise<void>;
  manualOps: string;
  setManualOps: (value: string) => void;
  onRetryOps: () => Promise<void>;
  onApplyManualOps: () => Promise<void>;
  topicTree: TopicTree | null;
  topicMode: 'topics' | 'manual' | 'ended';
  topicLoading: boolean;
  topicRetryAvailable: boolean;
  onRetryTopicTree: () => void;
  onTopicSelect: (topic: Topic) => void;
  departure?: EncounterDeparture;
  canFarewell: boolean;
  onPlayerFarewell: () => void;
  onResolveDeparture: (outcome: 'stayed' | 'left') => void;
  giftItems: SaveFile['world']['items'][string][];
  giftTargets: SaveFile['world']['characters'][string][];
  giftHistory: GiftHistoryEntry[];
  onOfferGift: (itemId: string, targetId: string) => void;
  onRetryGift: (giftId: string) => void;
  collectionEntries: CollectionEntry[];
  onShowCollection: (entryId: string) => void;
}) {
  const messagesRef = useRef<HTMLDivElement>(null);
  const followLatestRef = useRef(true);
  const previousCharacterIdRef = useRef(props.selectedCharacterId);
  const [showOlderMessages, setShowOlderMessages] = useState(false);
  const [activeChatPanel, setActiveChatPanel] = useState<ActiveChatPanel>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState('');
  const [messageMenuIndex, setMessageMenuIndex] = useState<number | null>(null);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [cgDraftIndex, setCgDraftIndex] = useState<number | null>(null);
  const [cgDraftText, setCgDraftText] = useState('');
  const [cgCharacterIds, setCgCharacterIds] = useState<string[]>([]);
  const [cgIncludesPlayer, setCgIncludesPlayer] = useState(false);
  const [revealedLineCount, setRevealedLineCount] = useState(1);
  const [revealedAssistantKey, setRevealedAssistantKey] = useState('');
  const messagePressTimerRef = useRef<number | null>(null);
  const [dialogueBoxHeight, setDialogueBoxHeight] = useState(() => {
    if (typeof window === 'undefined') return 150;
    try {
      const stored = Number(window.localStorage.getItem('tokimeki.dialogueBoxHeight'));
      return Number.isFinite(stored) ? Math.max(80, stored) : 150;
    } catch { return 150; }
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const [dialogueMaxHeight, setDialogueMaxHeight] = useState(360);
  const recoveryVisibleRef = useRef(false);
  const resizeStartRef = useRef<{ y: number; height: number } | null>(null);
  const canGenerate = canGenerateReply(props.messages, props.input);
  const latestMessage = props.messages.at(-1)?.content;
  const latestRole = props.messages.at(-1)?.role;
  const latestAssistantIndex = [...props.messages].map((message, index) => message.role === 'assistant' ? index : -1).filter((index) => index >= 0).at(-1) ?? -1;
  const olderMessageCount = Math.max(0, props.messages.length - 40);
  const visibleMessages = showOlderMessages ? props.messages : props.messages.slice(olderMessageCount);
  const [portraitUrl, setPortraitUrl] = useState<string>();
  const [sceneBackgroundUrl, setSceneBackgroundUrl] = useState<string>();
  const characterName = props.characters.find((item) => item.id === props.selectedCharacterId)?.name ?? '选择角色聊天';
  const speakerIdsByName = { [props.playerLabel]: 'player', ...Object.fromEntries(Object.values(props.worldCharacters).map((character) => [character.name, character.id])) };
  const speakerLabelsById = { player: props.playerLabel, ...Object.fromEntries(Object.values(props.worldCharacters).map((character) => [character.id, character.name])) };
  const latestAssistantLines = latestAssistantIndex >= 0
    ? splitDialogueMessage(props.messages[latestAssistantIndex], characterName, props.playerLabel, speakerLabelsById)
    : [];
  const latestAssistantKey = latestAssistantIndex >= 0 ? `${latestAssistantIndex}:${props.messages[latestAssistantIndex].content}` : '';
  const effectiveRevealedLineCount = latestRole === 'assistant' && revealedAssistantKey !== latestAssistantKey ? 1 : revealedLineCount;
  const replyProgress = replyProgressIndicator(props.replyInProgress, props.requestStatus, latestRole === 'assistant' && latestAssistantLines.length > 0);
  const activeSpeakerId = (() => {
    if (latestRole !== 'assistant' || latestAssistantIndex < 0 || latestAssistantLines.length <= effectiveRevealedLineCount) return latestDialogueSpeakerId(props.messages, props.selectedCharacterId, speakerIdsByName);
    const displayed = latestAssistantLines.slice(0, Math.max(1, effectiveRevealedLineCount));
    for (let index = displayed.length - 1; index >= 0; index -= 1) {
      const line = displayed[index];
      if (line.kind !== 'dialogue') continue;
      if (line.speaker === props.playerLabel) return 'player';
      return speakerIdsByName[line.speaker ?? ''] ?? props.selectedCharacterId;
    }
    return latestDialogueSpeakerId(props.messages.slice(0, latestAssistantIndex), props.selectedCharacterId, speakerIdsByName);
  })();
  const activeWorldCharacter = activeSpeakerId === 'player' ? undefined : props.worldCharacters[activeSpeakerId] ?? props.worldCharacter;
  const activePortrait = activeWorldCharacter?.visuals.portraits.find((portrait) => portrait.id === activeWorldCharacter?.visuals.activePortraitId) ?? activeWorldCharacter?.visuals.portraits[0];
  const accentColor = 'var(--gray-600)';
  const activeSpeakerName = activeWorldCharacter?.name ?? (activeSpeakerId === 'player' ? props.playerLabel : characterName);
  const participantIds = props.participantIds.length ? props.participantIds : (props.selectedCharacterId ? [props.selectedCharacterId] : []);
  const participantCharacters = props.characters.filter((character) => participantIds.includes(character.id));
  const toggleParticipant = (id: string) => {
    if (participantIds.includes(id)) {
      const next = participantIds.filter((participantId) => participantId !== id);
      if (next.length) props.onParticipantIdsChange(next);
      return;
    }
    if (participantIds.length >= 3) return;
    props.onParticipantIdsChange([...participantIds, id]);
  };
  const topicEntries = props.topicTree ? visibleTopics(props.topicTree, props.world, props.hiddenTopicStyle) : [];
  const [selectedGiftId, setSelectedGiftId] = useState('');
  const [selectedGiftTargetId, setSelectedGiftTargetId] = useState(props.giftTargets[0]?.id ?? '');
  useEffect(() => { if (!props.giftItems.some((item) => item.id === selectedGiftId)) setSelectedGiftId(props.giftItems[0]?.id ?? ''); }, [props.giftItems, selectedGiftId]);
  useEffect(() => { if (!props.giftTargets.some((character) => character.id === selectedGiftTargetId)) setSelectedGiftTargetId(props.giftTargets[0]?.id ?? ''); }, [props.giftTargets, selectedGiftTargetId]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setPortraitUrl(undefined);
    const image = activePortrait?.image;
    if (!image) return () => { cancelled = true; };
    if (image.kind === 'url') {
      setPortraitUrl(image.url);
      return () => { cancelled = true; };
    }
    void loadAsset(image.assetId).then((asset) => {
      if (!asset || cancelled) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setPortraitUrl(objectUrl);
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [activePortrait?.image]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSceneBackgroundUrl(undefined);
    const image = props.sceneBackground;
    if (!image) return () => { cancelled = true; };
    if (image.kind === 'url') { setSceneBackgroundUrl(image.url); return () => { cancelled = true; }; }
    void loadAsset(image.assetId).then((asset) => {
      if (!asset || cancelled) return;
      objectUrl = URL.createObjectURL(asset.blob);
      setSceneBackgroundUrl(objectUrl);
    }).catch(() => { if (!cancelled) setSceneBackgroundUrl(undefined); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [props.sceneBackground]);

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
  }, [effectiveRevealedLineCount, latestMessage, props.busy, props.messages.length, props.requestStatus, props.selectedCharacterId]);

  useEffect(() => {
    if (!props.busy && latestRole === 'assistant') {
      setRevealedAssistantKey(latestAssistantKey);
      setRevealedLineCount(1);
    }
  }, [latestAssistantKey, latestRole, props.busy]);

  useEffect(() => { setActiveChatPanel((panel) => panel === 'regenerate' ? null : panel); }, [latestAssistantKey]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateStageHeight = () => {
      const maxHeight = Math.max(80, Math.round(stage.clientHeight));
      setDialogueMaxHeight(maxHeight);
      setDialogueBoxHeight((height) => Math.min(maxHeight, Math.max(80, height)));
    };
    updateStageHeight();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateStageHeight);
      return () => window.removeEventListener('resize', updateStageHeight);
    }
    const observer = new ResizeObserver(updateStageHeight);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const recoveryVisible = Boolean(props.interrupted || props.pendingOps);
    if (recoveryVisible && !recoveryVisibleRef.current) setActiveChatPanel('recovery');
    recoveryVisibleRef.current = recoveryVisible;
  }, [props.interrupted, props.pendingOps]);

  useEffect(() => {
    try { window.localStorage.setItem('tokimeki.dialogueBoxHeight', String(dialogueBoxHeight)); }
    catch { /* The current browser may block local UI preferences. */ }
  }, [dialogueBoxHeight]);

  const beginDialogueResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeStartRef.current = { y: event.clientY, height: dialogueBoxHeight };
  };
  const moveDialogueResize = (event: PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start) return;
    setDialogueBoxHeight(Math.min(dialogueMaxHeight, Math.max(80, start.height + start.y - event.clientY)));
  };
  const endDialogueResize = () => { resizeStartRef.current = null; };
  const toggleChatPanel = (panel: Exclude<ActiveChatPanel, null>) => {
    setActiveChatPanel((current) => current === panel ? null : panel);
  };
  const clearMessagePress = () => {
    if (messagePressTimerRef.current !== null) {
      window.clearTimeout(messagePressTimerRef.current);
      messagePressTimerRef.current = null;
    }
  };
  const openMessageMenu = (index: number) => {
    const message = props.messages[index];
    if (!message || !isEditableChatMessage(message)) return;
    setMessageMenuIndex(index);
    setEditingMessageIndex(null);
  };
  const beginMessagePress = (event: PointerEvent<HTMLDivElement>, index: number) => {
    if (!isEditableChatMessage(props.messages[index])) return;
    clearMessagePress();
    messagePressTimerRef.current = window.setTimeout(() => openMessageMenu(index), 550);
  };
  const startMessageEdit = (index: number) => {
    const message = props.messages[index];
    if (!message || !isEditableChatMessage(message)) return;
    setEditingMessageIndex(index);
    setEditingMessageText(message.content);
  };
  const startCgDraft = (index: number) => {
    const message = props.messages[index];
    if (!message || message.role !== 'assistant') return;
    const speakerId = message.speakerId && props.worldCharacters[message.speakerId] ? message.speakerId : props.selectedCharacterId;
    setCgDraftIndex(index);
    setCgDraftText(message.content);
    setCgCharacterIds(speakerId ? [speakerId] : participantIds.slice(0, 1));
    setCgIncludesPlayer(false);
    setMessageMenuIndex(null);
    setEditingMessageIndex(null);
  };
  const toggleCgCharacter = (characterId: string, checked: boolean) => {
    setCgCharacterIds((current) => checked ? [...new Set([...current, characterId])].slice(0, 3) : current.filter((id) => id !== characterId));
  };
  const messageVoiceSpeakerId = (message: ChatMessage) => message.speakerId && message.speakerId !== 'player' ? message.speakerId : props.selectedCharacterId;
  const cancelMessageMenu = () => { setMessageMenuIndex(null); setEditingMessageIndex(null); setEditingMessageText(''); setCgDraftIndex(null); setCgDraftText(''); setCgCharacterIds([]); setCgIncludesPlayer(false); };

  return <section className="chat-screen vn-chat-screen">
    {props.topicMode === 'manual' && !props.participantsLocked && <div className="character-picker"><div className="participant-picker" aria-label="本次对话角色">{props.characters.length > 1 && <span className="participant-label">本次对话</span>}{props.characters.map((item) => <label key={item.id} className="participant-option"><input type="checkbox" checked={participantIds.includes(item.id)} onChange={() => toggleParticipant(item.id)} /><span>{item.name}</span></label>)}</div><select aria-label="主要聊天角色" value={props.selectedCharacterId} onChange={(event) => props.setSelectedCharacterId(event.target.value)}><option value="">当前地点无人</option>{participantCharacters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>}
    <div ref={stageRef} className={`vn-stage ${sceneBackgroundUrl ? 'has-background' : 'default-background'}`} style={{ '--vn-accent': accentColor, ...(sceneBackgroundUrl ? { backgroundImage: `linear-gradient(180deg, #0002, #0003), url("${sceneBackgroundUrl}")` } : {}) } as CSSProperties}>
      <div className="vn-portrait-area" aria-label={`${activeSpeakerName}的立绘`}>
        {portraitUrl ? <img className="vn-portrait" style={activePortrait?.transform ? { transform: `translate(${activePortrait.transform.offsetX}px, ${activePortrait.transform.offsetY}px) scale(${activePortrait.transform.scale})` } : undefined} src={portraitUrl} alt={`${activeSpeakerName}的立绘`} /> : <div className="vn-portrait-empty" aria-label="暂无立绘" />}
      </div>
      <div className="vn-dialogue-box" style={{ height: `${dialogueBoxHeight}px` }}>
        <div className="vn-dialogue-resize-handle" role="separator" tabIndex={0} aria-label="调整对话框高度" aria-orientation="horizontal" aria-valuemin={80} aria-valuemax={dialogueMaxHeight} aria-valuenow={dialogueBoxHeight} onKeyDown={(event) => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setDialogueBoxHeight((height) => Math.min(dialogueMaxHeight, Math.max(80, height + (event.key === 'ArrowUp' ? 10 : -10)))); } }} onPointerDown={beginDialogueResize} onPointerMove={moveDialogueResize} onPointerUp={endDialogueResize} onPointerCancel={endDialogueResize} />
        <div className="vn-dialogue-log messages" ref={messagesRef}>{olderMessageCount > 0 && <button className="history-toggle" onClick={() => setShowOlderMessages((value) => !value)}>{showOlderMessages ? '只看最近消息' : `查看更早的 ${olderMessageCount} 条消息`}</button>}{props.messages.length === 0 && !props.busy && <p className="empty">选择角色后输入第一句话。</p>}{visibleMessages.map((message, index) => { const messageIndex = olderMessageCount + index; const lines = splitDialogueMessage(message, characterName, props.playerLabel, speakerLabelsById); const isLatestCollapsible = latestRole === 'assistant' && messageIndex === latestAssistantIndex && lines.length > 1; const displayedLines = isLatestCollapsible ? lines.slice(0, Math.max(1, effectiveRevealedLineCount)) : lines; const editable = isEditableChatMessage(message); const menuOpen = messageMenuIndex === messageIndex; const editing = editingMessageIndex === messageIndex; const cgEditing = cgDraftIndex === messageIndex; return <div className={`vn-message-group ${message.role}`} key={message.id ?? `${message.role}-${messageIndex}`} onPointerDown={(event) => beginMessagePress(event, messageIndex)} onPointerUp={clearMessagePress} onPointerCancel={clearMessagePress} onPointerLeave={clearMessagePress} onContextMenu={(event) => { event.preventDefault(); openMessageMenu(messageIndex); }}>{displayedLines.map((line, lineIndex) => <div className={`vn-line ${line.kind} ${message.role}`} key={`${message.role}-${messageIndex}-${lineIndex}`}><span className="vn-speaker">{line.kind === 'dialogue' ? line.speaker : ''}</span><span className="vn-line-text">{line.text}</span></div>)}{message.voice && <TerminalVoiceAudio asset={message.voice.asset} durationMs={message.voice.durationMs} />}{message.cg && <><ChatCgImage attachment={message.cg} /><div className="chat-cg-actions"><button type="button" className="secondary" onClick={() => void props.onDownloadCg(messageIndex)}>下载 CG</button><button type="button" className="danger" onClick={() => void props.onDeleteCg(messageIndex)}>删除 CG</button></div></>}{editable && menuOpen && !editing && !cgEditing && <div className="message-action-menu" role="menu">{message.role === 'assistant' && <button type="button" onClick={() => startCgDraft(messageIndex)} disabled={props.imageBusy || !props.imageConfigured}>{message.cg ? '重新生成 CG' : '制作 CG'}</button>}{message.role === 'assistant' && message.kind !== 'narration' && <button type="button" onClick={() => { void props.onGenerateVoice(messageIndex); cancelMessageMenu(); }} disabled={props.ttsBusy || !props.voiceAvailableCharacterIds.includes(messageVoiceSpeakerId(message))} title={props.voiceAvailableCharacterIds.includes(messageVoiceSpeakerId(message)) ? undefined : '请先设置语音 API'}>{props.voiceAvailableCharacterIds.includes(messageVoiceSpeakerId(message)) ? (message.voice ? '重新生成语音' : '生成语音') : '前往设置语音 API'}</button>}<button type="button" onClick={() => startMessageEdit(messageIndex)} disabled={props.ttsBusy || props.imageBusy}>编辑</button><button type="button" className="danger" disabled={props.ttsBusy || props.imageBusy} onClick={() => { if (window.confirm('删除这条台词？只会删除聊天记录，不会回滚已执行的状态变化。')) { void props.onDeleteMessage(messageIndex); cancelMessageMenu(); } }}>删除</button><button type="button" className="secondary" onClick={cancelMessageMenu}>取消</button></div>}{cgEditing && <div className="message-edit-panel cg-draft-panel"><label>画面描述<textarea aria-label="CG 画面描述" value={cgDraftText} onChange={(event) => setCgDraftText(event.target.value)} autoFocus /></label><fieldset><legend>入镜角色</legend>{Object.values(props.worldCharacters).map((character) => <label className="checkbox-line" key={character.id}><input type="checkbox" checked={cgCharacterIds.includes(character.id)} onChange={(event) => toggleCgCharacter(character.id, event.target.checked)} />{character.name}</label>)}</fieldset><label className="checkbox-line"><input type="checkbox" checked={cgIncludesPlayer} onChange={(event) => setCgIncludesPlayer(event.target.checked)} />包含用户 / 当前面具身份（需要双参考图锁脸）</label><p className="io-scope">这一步只编辑本地草稿，不调用 API。角色台词与旁白仍分开显示，最终画面描述可同时引用二者。</p><div className="button-row"><button type="button" onClick={() => { if (cgDraftIndex !== null) void props.onGenerateCg(cgDraftIndex, cgDraftText, cgCharacterIds, cgIncludesPlayer); cancelMessageMenu(); }} disabled={!cgDraftText.trim() || !cgCharacterIds.length || props.imageBusy}>{props.imageBusy ? '正在生成…' : message.cg ? '确认重新生成' : '确认生成'}</button><button type="button" className="secondary" onClick={cancelMessageMenu}>取消</button></div></div>}{editing && <div className="message-edit-panel"><textarea aria-label="编辑台词" value={editingMessageText} onChange={(event) => setEditingMessageText(event.target.value)} autoFocus /><div className="button-row"><button type="button" onClick={() => { void props.onEditMessage(messageIndex, editingMessageText); cancelMessageMenu(); }} disabled={!editingMessageText.trim()}>保存</button><button type="button" className="secondary" onClick={cancelMessageMenu}>取消</button></div></div>}</div>; })}{!props.busy && latestRole === 'assistant' && latestAssistantLines.length > effectiveRevealedLineCount ? <button className="vn-next-line" onClick={() => { followLatestRef.current = true; setRevealedAssistantKey(latestAssistantKey); setRevealedLineCount(Math.min(latestAssistantLines.length, effectiveRevealedLineCount + 1)); }}>下一段 · {effectiveRevealedLineCount}/{latestAssistantLines.length}</button> : replyProgress && <div className="vn-generation-progress" role="status" aria-live="polite"><span>{replyProgress === 'first-line' ? '正在生成第一段' : '后续内容生成中'}</span><span className="vn-generation-dots" aria-hidden="true"><i /><i /><i /></span></div>}</div>
      </div>
    </div>
    {props.topicMode === 'topics' && <div className="topic-tree-panel" aria-label="话题树">
      <div className="list-heading"><strong>可以聊聊</strong>{props.topicLoading && <span className="request-status requesting">正在生成话题树…</span>}</div>
      {!props.topicLoading && !props.topicTree && <p className="empty">话题树不可用，将在准备好后解锁手动对话。</p>}
      {!props.topicLoading && props.topicTree && <div className="topic-choice-list">{topicEntries.map(({ topic, visibility, label }) => <button key={topic.id} className="topic-choice" disabled={visibility === 'locked' || props.busy} onClick={() => props.onTopicSelect(topic)}><span>{label}</span>{visibility === 'used' && <small>再聊一次</small>}{topic.terminal && <small>推进</small>}</button>)}</div>}
    </div>}
    {props.topicMode === 'manual' && props.topicRetryAvailable && <div className="topic-retry-panel" aria-label="重试话题树"><span>话题树生成失败，但手动对话仍可继续。</span><button className="secondary" onClick={props.onRetryTopicTree} disabled={props.busy || props.topicLoading}>重试生成话题树</button></div>}
    {props.topicMode === 'ended' && <div className="topic-tree-panel"><p className="empty">本次面对面场景已经结束。</p></div>}
    {props.departure?.status === 'pending' && <div className="departure-panel" role="alert"><strong>{props.departure.kind === 'character_request' ? '对方似乎准备离开了。' : '你提出了告别。'}</strong>{props.departure.reason && <p>{props.departure.reason}</p>}<div className="button-row"><button onClick={() => props.onResolveDeparture('stayed')} disabled={props.busy}>挽留，继续聊聊</button><button className="secondary" onClick={() => props.onResolveDeparture('left')} disabled={props.busy}>就到这里吧</button></div></div>}
    {props.topicMode === 'manual' && <div className="interaction-tools" aria-label="聊天操作工具">
      {props.canFarewell && <>
        <button type="button" className="interaction-icon chat-icon-button" aria-label="打开送礼" aria-pressed={activeChatPanel === 'gift'} title="送礼" onClick={() => toggleChatPanel('gift')}><Gift aria-hidden="true" /></button>
        <button type="button" className="interaction-icon chat-icon-button" aria-label="打开收藏" aria-pressed={activeChatPanel === 'collection'} title="出示收藏" onClick={() => toggleChatPanel('collection')}><BookOpen aria-hidden="true" /></button>
      </>}
      {props.canRegenerate && latestRole === 'assistant' && <button type="button" className="interaction-icon chat-icon-button" aria-label="打开重新生成" aria-pressed={activeChatPanel === 'regenerate'} title="重新生成" onClick={() => toggleChatPanel('regenerate')}><RefreshCw aria-hidden="true" /></button>}
      {(props.interrupted || props.pendingOps) && <button type="button" className="interaction-icon chat-icon-button" aria-label="打开恢复处理" aria-pressed={activeChatPanel === 'recovery'} title="恢复处理" onClick={() => toggleChatPanel('recovery')}><AlertTriangle aria-hidden="true" /></button>}
      {activeChatPanel === 'gift' && <div className="interaction-popover gift-panel" aria-label="送礼">
        <div className="list-heading"><strong>带来的礼物</strong><button className="secondary" onClick={() => setActiveChatPanel(null)}>收起</button></div>
        {props.giftItems.length ? <div className="gift-row">{props.giftTargets.length > 1 && <select aria-label="送给谁" value={selectedGiftTargetId} onChange={(event) => setSelectedGiftTargetId(event.target.value)}>{props.giftTargets.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select>}<select aria-label="选择礼物" value={selectedGiftId} onChange={(event) => setSelectedGiftId(event.target.value)}>{props.giftItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary" onClick={() => { if (selectedGiftId && selectedGiftTargetId) { props.onOfferGift(selectedGiftId, selectedGiftTargetId); setActiveChatPanel(null); } }} disabled={props.busy || !selectedGiftId || !selectedGiftTargetId}>送出</button></div> : <p className="empty">暂无可赠送物品。</p>}
        {props.giftHistory.length > 0 && <div className="gift-history"><strong>最近反应</strong>{props.giftHistory.map((entry) => <span key={entry.id}>第 {entry.day} 天 · {props.world.characters[entry.charId]?.name ?? entry.charId} · {props.world.items[entry.itemId]?.name ?? entry.itemId}：{entry.status === 'pending' ? <><span>等待角色回应</span><button className="secondary" onClick={() => props.onRetryGift(entry.id)} disabled={props.busy}>重试回应</button></> : <>{giftReactionLabel(entry.reaction)}{entry.accepted === false ? ' · 未接受' : ''}</>}</span>)}</div>}
      </div>}
      {activeChatPanel === 'collection' && <div className="interaction-popover collection-show-panel" aria-label="出示收藏">
        <div className="list-heading"><strong>出示收藏</strong><button className="secondary" onClick={() => setActiveChatPanel(null)}>收起</button></div>
        {props.collectionEntries.length ? <div className="gift-row"><select aria-label="选择收藏" value={selectedCollectionId} onChange={(event) => setSelectedCollectionId(event.target.value)}><option value="">选择一条收藏</option>{props.collectionEntries.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select><button className="secondary" onClick={() => { if (selectedCollectionId) { props.onShowCollection(selectedCollectionId); setActiveChatPanel(null); } }} disabled={props.busy || !selectedCollectionId}>出示</button></div> : <p className="empty">暂无可出示的收藏。</p>}
      </div>}
      {activeChatPanel === 'regenerate' && <div className="interaction-popover regenerate-panel" aria-label="重新生成回复">
        <div className="list-heading"><strong>对这条回复不满意？</strong><button className="secondary" onClick={() => setActiveChatPanel(null)}>收起</button></div>
        <span className="io-scope">只会替换叙述文字，不会重复应用状态变化</span>
        <textarea value={props.regenerateInput} onChange={(event) => props.setRegenerateInput(event.target.value)} placeholder="告诉角色换一种说法……" aria-label="重新生成要求" />
        <button className="secondary" onClick={() => void props.onRegenerate()} disabled={props.busy}>重新生成</button>
      </div>}
      {activeChatPanel === 'recovery' && <div className="interaction-popover ops-recovery" aria-label="恢复处理">
        {props.interrupted && <div role="alert"><strong>上次回复已中断</strong><p>页面离开后台后请求无法确认完成，已保留草稿和已收到正文。不会自动重试或重复应用状态变化。</p><div className="button-row"><button onClick={() => { setActiveChatPanel(null); void props.onRetryInterrupted(); }} disabled={props.busy}>手动重试</button></div></div>}
        {props.pendingOps && <div role="alert"><strong>本回合未产生状态变更</strong><p>{props.pendingOps.streamError ? '回复流中断，已保留收到的正文。你可以重试提取或手动补录。' : '正文已保留，但 ops 无法解析。你可以重试提取或手动补录。'}</p><textarea aria-label="手动补录 ops JSON" spellCheck={false} value={props.manualOps} onChange={(event) => props.setManualOps(event.target.value)} /><div className="button-row"><button className="secondary" disabled={props.busy} onClick={() => void props.onRetryOps()}>重试提取</button><button disabled={props.busy} onClick={() => void props.onApplyManualOps()}>应用手动 ops</button></div></div>}
      </div>}
    </div>}
    {props.topicMode === 'manual' && <div className="composer"><textarea value={props.input} onChange={(event) => props.setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void props.onAppend(); } }} placeholder="说点什么……" /><div className="composer-actions"><button type="button" className="chat-icon-button secondary" aria-label="发送消息" title="发送消息" onClick={() => void props.onAppend()} disabled={props.busy || !props.input.trim()}><Send aria-hidden="true" /></button><button type="button" className="chat-icon-button" aria-label="生成回复" title="生成回复" onClick={() => void props.onGenerate()} disabled={props.busy || !canGenerate}><Sparkles aria-hidden="true" /></button>{props.canFarewell && <button type="button" className="chat-icon-button secondary" aria-label="告别" title="告别" onClick={props.onPlayerFarewell} disabled={props.busy || props.departure?.status === 'pending' || props.departure?.status === 'left'}><LogOut aria-hidden="true" /></button>}</div></div>}
  </section>;
}

function ProviderSettingsMigrationView(props: { providers: ProviderConfig[]; ttsConfigs: TtsConfig[]; imageConfig: ImageConfig; onExport: (selection: ProviderSettingsSelection) => Promise<void>; onImport: (pack: ProviderSettingsPackage, selection: ProviderSettingsSelection) => Promise<void>; onExportGlobalBackup: (includeSecrets: boolean) => Promise<void>; onImportGlobalBackup: (file?: File) => Promise<void>; globalBackupPreview: ImportedGlobalBackup | null; onRestoreGlobalBackup: (backup: ImportedGlobalBackup, selection?: GlobalBackupRestoreSelection) => Promise<void> }) {
  const [providerIds, setProviderIds] = useState(() => props.providers.map((item) => item.id));
  const [ttsIds, setTtsIds] = useState(() => props.ttsConfigs.map((item) => item.id));
  const [includeBindings, setIncludeBindings] = useState(true);
  const [includeSecrets, setIncludeSecrets] = useState(false);
  const [preview, setPreview] = useState<ProviderSettingsPackage | null>(null);
  const [importError, setImportError] = useState('');
  const [restoreSelection, setRestoreSelection] = useState<GlobalBackupRestoreSelection>({ world: true, content: true, providers: true, assets: true, preferences: true });
  const availableProviders = preview?.providers ?? props.providers;
  const availableTtsConfigs = preview?.ttsConfigs ?? props.ttsConfigs;
  const toggle = (ids: string[], id: string, checked: boolean, setIds: (ids: string[]) => void) => setIds(checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id));
  const selection = { providerIds, ttsIds, includeBindings, includeSecrets };
  return <div className="library-subpage-content"><section className="library-legacy-content"><div className="section-heading"><div><span className="eyebrow">仅本地</span><h2>Provider 设置迁移</h2></div></div><div className="provider-card"><h3>全局备份</h3><p className="io-scope">一键备份当前世界、快照、聊天、资料、Provider 配置、界面偏好和本地资产。默认不包含 API key。</p><div className="button-row"><button onClick={() => void props.onExportGlobalBackup(false)}>导出全局备份</button><button className="secondary" onClick={() => { if (window.confirm('完整备份会把 API key 写入文件，请勿分享。确定继续吗？')) void props.onExportGlobalBackup(true); }}>导出完整备份（含 API key）</button><label className="file-button">导入全局备份<input type="file" accept=".zip" onChange={(event) => void props.onImportGlobalBackup(event.target.files?.[0])} /></label></div>{props.globalBackupPreview && <div className="fold-body"><p>备份预览：{props.globalBackupPreview.data.providers.length} 个普通 Provider、{props.globalBackupPreview.data.ttsConfigs.length} 个语音 Provider、{props.globalBackupPreview.data.imageConfigs.length} 份图像设置、{props.globalBackupPreview.data.imageVisualConfigs.length + props.globalBackupPreview.data.imageUserVisualConfigs.length} 份视觉配置、{props.globalBackupPreview.assets.size} 个资产{props.globalBackupPreview.hasSecrets ? '，包含 API key' : ''}。</p>{([['world','世界存档与快照'],['content','资料、聊天与本地索引'],['providers','Provider 与绑定'],['assets','图片、音频等资产'],['preferences','界面偏好']] as const).map(([key, label]) => <label className="checkbox-line" key={key}><input type="checkbox" checked={restoreSelection[key]} onChange={(event) => setRestoreSelection((current) => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}<button onClick={() => void props.onRestoreGlobalBackup(props.globalBackupPreview!, restoreSelection)}>确认恢复所选内容</button></div>}</div><div className="provider-card"><p className="io-scope">迁移非敏感配置、默认项、路由绑定和图像生成选项。默认不导出 API key 或鉴权 headers；导入同 ID 配置时保留本机已有密钥。</p><h3>普通 Provider</h3>{availableProviders.length ? availableProviders.map((item) => <label className="checkbox-line" key={item.id}><input type="checkbox" checked={providerIds.includes(item.id)} onChange={(event) => toggle(providerIds, item.id, event.target.checked, setProviderIds)} />{item.name} · {item.model}</label>) : <p className="empty">没有普通 Provider 配置。</p>}<h3>语音 Provider</h3>{availableTtsConfigs.length ? availableTtsConfigs.map((item) => <label className="checkbox-line" key={item.id}><input type="checkbox" checked={ttsIds.includes(item.id)} onChange={(event) => toggle(ttsIds, item.id, event.target.checked, setTtsIds)} />{item.name} · {item.model || '未设置模型'}</label>) : <p className="empty">没有语音 Provider 配置。</p>}<label className="checkbox-line"><input type="checkbox" checked={includeBindings} onChange={(event) => setIncludeBindings(event.target.checked)} />包含任务路由和当前世界角色绑定</label><div className="button-row"><button onClick={() => { if (includeSecrets && !window.confirm('导出文件将包含 API key 和鉴权 headers。请确认文件只保存在你自己的设备上。')) return; void props.onExport(selection); }} disabled={!providerIds.length && !ttsIds.length && !props.imageConfig}>导出所选设置</button><label className="file-button">选择迁移包<input type="file" accept=".json,application/json" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const pack = await importProviderSettingsPackage(file); setPreview(pack); setImportError(''); setProviderIds(pack.providers.map((item) => item.id)); setTtsIds(pack.ttsConfigs.map((item) => item.id)); setIncludeBindings(true); setIncludeSecrets(Boolean(pack.providers.some((item) => item.apiKey) || pack.ttsConfigs.some((item) => item.apiKey))); } catch (error) { setPreview(null); setImportError(errorMessage(error, '迁移包无法读取。')); } }} /></label><label className="checkbox-line"><input type="checkbox" checked={includeSecrets} onChange={(event) => setIncludeSecrets(event.target.checked)} />包含 API key 和鉴权 headers（仅用于个人迁移）</label>{includeSecrets && <p className="io-scope" role="alert">API key 将写入导出的 JSON 文件。请勿分享此文件；导出前会再次确认。</p>}</div>{importError && <p className="io-scope" role="alert">{importError}</p>}</div>{preview && <div className="provider-card"><div className="list-heading"><div><h3>导入预览</h3><p className="io-scope">导出时间：{new Date(preview.exportedAt).toLocaleString()}</p></div></div><p>普通 Provider：{preview.providers.length} 个 · 语音 Provider：{preview.ttsConfigs.length} 个 · 任务路由：{preview.bindings.length} 条 · 角色绑定：{preview.characterBindings.length} 条 · 图像选项：{preview.imageConfig ? '包含' : '无'}</p><div className="button-row"><button onClick={() => void props.onImport(preview, selection)} disabled={!providerIds.length && !ttsIds.length && !preview.imageConfig}>导入所选设置</button><button className="secondary" onClick={() => setPreview(null)}>取消预览</button></div></div>}</section></div>;
}

function ImageSettingsView(props: { config: ImageConfig; providers: ProviderConfig[]; setProvider: (provider: ProviderConfig) => void; busy: boolean; onSave: (config: ImageConfig) => Promise<void>; onTest: (config: ImageConfig) => Promise<void>; onNewProvider: () => void; onOpenProvider: () => void; save: SaveFile; personas: Persona[]; imageVisualConfigs: ImageVisualConfig[]; imageUserVisualConfigs: ImageUserVisualConfig[]; visualCharacterId: string; setVisualCharacterId: (value: string) => void; imagePrompt: string; setImagePrompt: (value: string) => void; imageTarget: 'avatar' | 'portrait'; setImageTarget: (value: 'avatar' | 'portrait') => void; onSaveImageVisualConfig: (characterId: string, appearancePrompt: string) => Promise<void>; onSetCharacterFaceLock: (characterId: string, enabled: boolean) => Promise<void>; onImportCharacterFaceReference: (characterId: string, source?: File | string) => Promise<void>; onRemoveCharacterFaceReference: (characterId: string) => Promise<void>; onSaveUserImageVisualConfig: (appearancePrompt: string) => Promise<void>; onSetUserFaceLock: (enabled: boolean) => Promise<void>; onImportUserFaceReference: (source?: File | string) => Promise<void>; onRemoveUserFaceReference: () => Promise<void>; onGenerateCharacterImage: (characterId: string, target: 'avatar' | 'portrait', scenePrompt: string) => Promise<void>; onDownloadGenerated?: () => Promise<void>; onDeleteGenerated?: () => Promise<void> }) {
  const compatibleProviders = props.providers.filter((item) => item.kind === 'openai-compatible');
  const [draft, setDraft] = useState(props.config);
  useEffect(() => { setDraft(props.config); }, [props.config]);
  const selectedProvider = compatibleProviders.find((item) => item.id === draft.providerId);
  const update = (values: Partial<ImageConfig>) => setDraft((current) => ({ ...current, ...values }));
  const worldCharacters = Object.values(props.save.world.characters);
  const selectedCharacter = worldCharacters.find((item) => item.id === props.visualCharacterId) ?? worldCharacters[0];
  const selectedVisual = props.imageVisualConfigs.find((item) => item.saveId === props.save.meta.id && item.characterId === selectedCharacter?.id);
  const [appearanceDraft, setAppearanceDraft] = useState(selectedVisual?.appearancePrompt ?? '');
  useEffect(() => { setAppearanceDraft(selectedVisual?.appearancePrompt ?? ''); }, [selectedVisual?.appearancePrompt, selectedCharacter?.id]);
  const userIdentity = currentImageIdentity(props.save.world.player.personaId);
  const userVisual = props.imageUserVisualConfigs.find((item) => item.id === imageUserConfigId(props.save.meta.id, userIdentity));
  const activePersona = props.personas.find((item) => item.id === props.save.world.player.personaId);
  const [userAppearanceDraft, setUserAppearanceDraft] = useState(userVisual?.appearancePrompt ?? '');
  useEffect(() => { setUserAppearanceDraft(userVisual?.appearancePrompt ?? ''); }, [userVisual?.appearancePrompt, userIdentity.id]);
  return <div className="library-subpage-content"><section className="library-legacy-content">
    <div className="section-heading"><div><span className="eyebrow">显式调用</span><h2>图像生成</h2></div><span className={`request-status ${draft.lastStatus === 'error' ? 'error' : ''}`}>{props.busy ? '请求中…' : draft.lastStatus === 'success' ? '最近成功' : draft.lastStatus === 'error' ? '最近失败' : '尚未调用'}</span></div>
    <div className="provider-card">
      <p className="io-scope">这里管理 OpenAI-compatible 图像生成。保存、查看和切换配置均为纯本地操作；只有点击“连接测试”或后续“生成图像”时才会调用一次 Provider。</p>
      <label>图像 Provider<select aria-label="图像 Provider" value={draft.providerId ?? ''} onChange={(event) => update({ providerId: event.target.value || undefined })}><option value="">未配置</option>{compatibleProviders.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model || '未设置模型'}</option>)}</select></label>
      {props.providers.length > compatibleProviders.length && <p className="io-scope">Anthropic、Gemini、Generic 与 Mock 配置不会出现在这里；首版图像接口固定为 OpenAI-compatible。</p>}
      <div className="button-row"><button className="secondary" onClick={() => { if (selectedProvider) props.setProvider(selectedProvider); else props.onNewProvider(); props.onOpenProvider(); }}>{selectedProvider ? '编辑当前 Provider' : '新建 Provider'}</button></div>
      <label>默认尺寸<input value={draft.size} onChange={(event) => update({ size: event.target.value })} placeholder="1024x1024" /></label>
      <label>质量（可选）<input value={draft.quality ?? ''} onChange={(event) => update({ quality: event.target.value || undefined })} placeholder="例如 high、standard" /></label>
      <label>Provider style 参数（可选）<input value={draft.style ?? ''} onChange={(event) => update({ style: event.target.value || undefined })} placeholder="例如 vivid、natural" /></label>
      <label>全局画风提示词<textarea value={draft.stylePrompt} onChange={(event) => update({ stylePrompt: event.target.value })} placeholder="例如：日系动画、柔和光线、细腻背景、统一角色比例。" /></label>
      <label>响应格式<select value={draft.responseFormat} onChange={(event) => update({ responseFormat: event.target.value as ImageConfig['responseFormat'] })}><option value="b64_json">b64_json（推荐，收到后转存二进制）</option><option value="url">url</option></select></label>
      <label>参考图能力<select value={draft.referenceMode} onChange={(event) => update({ referenceMode: event.target.value as ImageConfig['referenceMode'] })}><option value="none">关闭 · 仅提示词生成</option><option value="openai-edits">OpenAI-compatible images/edits</option></select></label>
      {draft.referenceMode === 'openai-edits' ? <><label>自定义 edits 端点（可选）<input value={draft.editEndpoint ?? ''} onChange={(event) => update({ editEndpoint: event.target.value || undefined })} placeholder="留空时由 Provider 基础 URL 推导 /images/edits" /></label><p className="io-scope">启用后，只有存在锁脸参考图时才会使用 multipart edits 请求；没有参考图时仍使用 generations。</p></> : <p className="io-scope">当前 Provider 不会接收锁脸参考图；后续会明确降级为固定外貌提示词。</p>}
      {draft.referenceMode === 'openai-edits' && <label className="checkbox-line"><input type="checkbox" checked={draft.multiReferenceEnabled} onChange={(event) => update({ multiReferenceEnabled: event.target.checked })} />声明 Provider 支持多张参考图（双人锁脸 CG 必须开启）</label>}
      <div className="stat-list"><span>调用 {draft.requestCount} 次</span><span>失败 {draft.failureCount} 次</span>{draft.lastCalledAt && <span>最近调用 {new Date(draft.lastCalledAt).toLocaleString()}</span>}</div>
      {draft.lastError && <p className="io-scope" role="alert">最近错误：{draft.lastError}</p>}
      <div className="button-row"><button onClick={() => void props.onSave(draft)} disabled={props.busy}>保存设置</button><button className="secondary" onClick={() => void props.onTest(draft)} disabled={props.busy || !selectedProvider}>连接测试</button></div>
    </div>
    <div className="provider-card">
      <div className="list-heading"><div><span className="eyebrow">当前世界</span><h3>角色图像</h3></div><span className="io-scope">提示词预览与生成均不自动调用 API</span></div>
      {worldCharacters.length ? <>
        <label>角色<select aria-label="图像角色" value={selectedCharacter?.id ?? ''} onChange={(event) => props.setVisualCharacterId(event.target.value)}>{worldCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
        <label>角色外貌提示词<textarea value={appearanceDraft} onChange={(event) => setAppearanceDraft(event.target.value)} placeholder="例如：短黑发、琥珀色眼睛、左眉有一颗小痣。" /></label>
        <div className="button-row"><button className="secondary" onClick={() => selectedCharacter && void props.onSaveImageVisualConfig(selectedCharacter.id, appearanceDraft)}>保存外貌提示词</button></div>
        <label className="checkbox-line"><input type="checkbox" checked={selectedVisual?.lockFaceEnabled ?? false} disabled={!selectedVisual?.referenceImage} onChange={(event) => selectedCharacter && void props.onSetCharacterFaceLock(selectedCharacter.id, event.target.checked)} />启用角色锁脸参考图</label>
        <p className="io-scope">{selectedVisual?.referenceImage?.kind === 'stored' ? `已保存本地参考图：${selectedVisual.referenceImage.assetId}` : selectedVisual?.referenceImage?.kind === 'url' ? `已保存外链参考图：${selectedVisual.referenceImage.url}` : '尚未配置角色锁脸参考图。'} {selectedVisual?.lockFaceEnabled && selectedVisual.referenceImage?.kind === 'url' ? '外链不会下载或发送给 Provider，生成时仅使用固定外貌提示词。' : selectedVisual?.lockFaceEnabled && draft.referenceMode !== 'openai-edits' ? '当前 Provider 未启用 edits，生成时只使用固定外貌提示词，不会发送参考图。' : selectedVisual?.lockFaceEnabled ? '生成时会将该本地参考图发送到你配置的 edits 端点。' : ''}</p>
        <div className="button-row"><label className="file-button">{selectedVisual?.referenceImage ? '替换角色参考图' : '上传角色参考图'}<input type="file" accept="image/*" onChange={(event) => selectedCharacter && void props.onImportCharacterFaceReference(selectedCharacter.id, event.target.files?.[0])} /></label>{selectedVisual?.referenceImage && <button className="danger" onClick={() => selectedCharacter && void props.onRemoveCharacterFaceReference(selectedCharacter.id)}>移除参考图</button>}</div>
        {selectedCharacter && <ImageUrlInput label="保存角色锁脸外链" onApply={(url) => props.onImportCharacterFaceReference(selectedCharacter.id, url)} />}
        <label>生成目标<select value={props.imageTarget} onChange={(event) => props.setImageTarget(event.target.value as 'avatar' | 'portrait')}><option value="avatar">头像</option><option value="portrait">立绘</option></select></label>
        <label>场景 / 姿态要求<textarea value={props.imagePrompt} onChange={(event) => props.setImagePrompt(event.target.value)} placeholder="例如：站在雨后的海边车站，回头看向镜头。" /></label>
        <label>最终 Prompt 预览<textarea readOnly value={selectedCharacter ? (() => { try { return buildCharacterImagePrompt({ scenePrompt: props.imagePrompt, stylePrompt: draft.stylePrompt, appearancePrompt: appearanceDraft }); } catch { return '请先填写场景 / 姿态要求。'; } })() : ''} /></label>
        <div className="button-row"><button onClick={() => selectedCharacter && void props.onGenerateCharacterImage(selectedCharacter.id, props.imageTarget, props.imagePrompt)} disabled={props.busy || !selectedProvider || !selectedCharacter || !props.imagePrompt.trim()}>{props.busy ? '正在生成…' : `生成${props.imageTarget === 'avatar' ? '头像构图' : '立绘构图'}`}</button></div>
        {draft.lastGenerated && <div className="standalone-image-result"><p>最近生成结果：{draft.lastGenerated.label}。它是独立图片，不会自动替换角色头像或立绘。</p><ChatCgImage attachment={{ asset: draft.lastGenerated.asset, prompt: draft.lastGenerated.prompt, requestId: draft.lastGenerated.asset.assetId, characterIds: selectedCharacter ? [selectedCharacter.id] : [], includesPlayer: false, generatedAt: draft.lastGenerated.generatedAt }} /><div className="button-row"><button className="secondary" onClick={() => void props.onDownloadGenerated?.()}>下载图片</button><button className="danger" onClick={() => void props.onDeleteGenerated?.()}>删除图片</button></div></div>}
      </> : <p className="empty">当前世界还没有正式角色，请先在终端的角色卡中加入角色。</p>}
    </div>
    <div className="provider-card">
      <div className="list-heading"><div><span className="eyebrow">当前世界</span><h3>用户锁脸</h3></div><span className="io-scope">仅保存为后续图像生成参考</span></div>
      <p className="io-scope">当前身份：{activePersona ? `${activePersona.name} · 面具身份` : `${props.save.world.player.name} · 玩家身份`}。切换面具身份后会使用独立配置。</p>
      <label>固定外貌描述<textarea value={userAppearanceDraft} onChange={(event) => setUserAppearanceDraft(event.target.value)} placeholder="例如：长卷发、深棕色眼睛、圆框眼镜。" /></label>
      <div className="button-row"><button className="secondary" onClick={() => void props.onSaveUserImageVisualConfig(userAppearanceDraft)}>保存用户外貌描述</button></div>
      <label className="checkbox-line"><input type="checkbox" checked={userVisual?.lockFaceEnabled ?? false} disabled={!userVisual?.referenceImage} onChange={(event) => void props.onSetUserFaceLock(event.target.checked)} />启用用户锁脸参考图</label>
      <p className="io-scope">{userVisual?.referenceImage?.kind === 'stored' ? `已保存本地参考图：${userVisual.referenceImage.assetId}` : userVisual?.referenceImage?.kind === 'url' ? `已保存外链参考图：${userVisual.referenceImage.url}` : '尚未配置用户锁脸参考图。'} {userVisual?.lockFaceEnabled && userVisual.referenceImage?.kind === 'url' ? '外链不会下载或发送给 Provider；互动 CG 仍需上传本地参考图。' : userVisual?.lockFaceEnabled && draft.referenceMode !== 'openai-edits' ? '当前 Provider 未启用 edits；未来涉及用户的生成只会使用固定外貌描述。' : '本切片不会自动生成或替换玩家头像。'}</p>
      <div className="button-row"><label className="file-button">{userVisual?.referenceImage ? '替换用户参考图' : '上传用户参考图'}<input type="file" accept="image/*" onChange={(event) => void props.onImportUserFaceReference(event.target.files?.[0])} /></label>{userVisual?.referenceImage && <button className="danger" onClick={() => void props.onRemoveUserFaceReference()}>移除参考图</button>}</div>
      <ImageUrlInput label="保存用户锁脸外链" onApply={(url) => props.onImportUserFaceReference(url)} />
    </div>
  </section></div>;
}

function LocalNotificationSettingsPanel() {
  const [settings, setSettings] = useState<LocalNotificationSettings>(() => readLocalNotificationSettings());
  const [permission, setPermission] = useState(() => readMobileCapabilities().notificationPermission);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const enable = async () => {
    setBusy(true); setStatus('');
    try {
      const nextPermission = await requestLocalNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setStatus(nextPermission === 'denied' ? '通知权限已被拒绝；如需启用，请在浏览器或系统设置中修改权限。' : '当前环境不支持本地通知，或不是 HTTPS 安全上下文。');
        return;
      }
      const next = { ...settings, enabled: true };
      writeLocalNotificationSettings(next); setSettings(next); setStatus('完成通知已启用。只有回复在页面后台完成时才会提醒。');
    } catch {
      setStatus('通知启用失败；请检查浏览器权限、HTTPS 和 PWA 安装状态。');
    } finally { setBusy(false); }
  };
  const disable = () => {
    const next = { ...settings, enabled: false };
    writeLocalNotificationSettings(next); setSettings(next); setStatus('完成通知已关闭。');
  };
  const test = async () => {
    setBusy(true); setStatus('');
    const result = await showGenerationCompleteNotification({ settings, force: true });
    setStatus(result === 'shown' ? '测试通知已发送。' : result === 'not-granted' ? '浏览器尚未授予通知权限。' : result === 'unsupported' ? '当前环境不支持本地通知。' : '测试通知发送失败。');
    setBusy(false);
  };
  return <><h3>本地完成通知</h3><p className="io-scope">仅在你显式生成的面对面回复或终端回复于页面后台完成时提醒。通知只显示通用文案，不包含角色名、台词、prompt 或 API 信息；不会远程推送、定时唤醒或后台生成。</p><div className="stat-list"><span>开关：{settings.enabled ? '已启用' : '已关闭'}</span><span>权限：{permission === 'granted' ? '已授权' : permission === 'denied' ? '已拒绝' : permission === 'default' ? '尚未请求' : '不支持'}</span></div><div className="button-row"><button type="button" className="secondary" disabled={busy || settings.enabled} onClick={() => void enable()}>{busy ? '处理中…' : '启用完成通知'}</button><button type="button" className="secondary" disabled={busy || !settings.enabled} onClick={() => void test()}>发送测试通知</button><button type="button" className="secondary" disabled={busy || !settings.enabled} onClick={disable}>关闭通知</button></div>{status && <p className="io-scope" role="status">{status}</p>}</>;
}

function SettingsView(props: {
  appName: string;
  desktopIcons: DesktopIconOverrides;
  onImportDesktopIcon: (launcherId: string, entryId: string, file?: File) => Promise<void>;
  onSetDesktopIconUrl: (launcherId: string, entryId: string, url: string) => Promise<void>;
  onRemoveDesktopIcon: (launcherId: string, entryId: string) => Promise<void>;
  themeAppearance: ThemeAppearanceConfig;
  onThemeAppearanceChange: (config: ThemeAppearanceConfig) => void;
  customCssDraft: string;
  setCustomCssDraft: (value: string) => void;
  onSaveCustomCss: () => string[];
  onResetCustomCss: () => void;
  activePage: SettingsPage | null;
  onOpenPage: (page: SettingsPage) => void;
  onBack: () => void;
  provider: ProviderConfig;
  setProvider: (provider: ProviderConfig) => void;
  providers: ProviderConfig[];
  bindings: ProviderBinding[];
  defaultProviderId: string;
  headersDraft: string;
  setHeadersDraft: (value: string) => void;
  models: string[];
  embeddingConfig: EmbeddingConfig;
  setEmbeddingConfig: (config: EmbeddingConfig) => void;
  embeddingHeadersDraft: string;
  setEmbeddingHeadersDraft: (value: string) => void;
  embeddingBusy: boolean;
  onSaveEmbedding: () => Promise<void>;
  onTestEmbedding: () => Promise<void>;
  onRebuildEmbedding: () => Promise<void>;
  ttsConfigs: TtsConfig[];
  defaultTtsConfigId: string;
  ttsConfig: TtsConfig;
  setTtsConfig: (config: TtsConfig) => void;
  ttsHeadersDraft: string;
  setTtsHeadersDraft: (value: string) => void;
  onSelectTtsConfig: (id: string) => void;
  onNewTtsConfig: () => void;
  onDeleteTtsConfig: () => Promise<void>;
  onDefaultTtsChange: (id: string) => Promise<void>;
  ttsBusy: boolean;
  onSaveTts: () => Promise<void>;
  onTestTts: () => Promise<void>;
  imageConfig: ImageConfig;
  setImageConfig: (config: ImageConfig) => void;
  imageBusy: boolean;
  onSaveImage: (config?: ImageConfig) => Promise<void>;
  onTestImage: (config?: ImageConfig) => Promise<void>;
  onOpenProvider: () => void;
  save: SaveFile;
  imageVisualConfigs: ImageVisualConfig[];
  imageUserVisualConfigs: ImageUserVisualConfig[];
  visualCharacterId: string;
  setVisualCharacterId: (value: string) => void;
  imagePrompt: string;
  setImagePrompt: (value: string) => void;
  imageTarget: 'avatar' | 'portrait';
  setImageTarget: (value: 'avatar' | 'portrait') => void;
  onSaveImageVisualConfig: (characterId: string, appearancePrompt: string) => Promise<void>;
  onSetCharacterFaceLock: (characterId: string, enabled: boolean) => Promise<void>;
  onImportCharacterFaceReference: (characterId: string, source?: File | string) => Promise<void>;
  onRemoveCharacterFaceReference: (characterId: string) => Promise<void>;
  onSaveUserImageVisualConfig: (appearancePrompt: string) => Promise<void>;
  onSetUserFaceLock: (enabled: boolean) => Promise<void>;
  onImportUserFaceReference: (source?: File | string) => Promise<void>;
  onRemoveUserFaceReference: () => Promise<void>;
  onGenerateCharacterImage: (characterId: string, target: 'avatar' | 'portrait', scenePrompt: string) => Promise<void>;
  onDownloadGeneratedImage?: () => Promise<void>;
  onDeleteGeneratedImage?: () => Promise<void>;
  voiceCacheStats: VoiceCacheStats;
  onClearVoiceCache: () => Promise<void>;
  imageAssetStats: ImageAssetStats;
  onClearUnusedImageAssets: () => Promise<void>;
  onClearChatCgImages?: () => Promise<void>;
  musicAssetStats: MusicAssetStats;
  onClearMusicOfflineCaches: () => Promise<void>;
  onClearOrphanedMusicAssets: () => Promise<void>;
  storageEstimate: StorageEstimate;
  onPersistStorage: () => Promise<void>;
  assetIntegrityReport: AssetIntegrityReport | null;
  assetIntegrityBusy: boolean;
  onCheckAssetIntegrity: () => Promise<void>;
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
  onShowNumbersChange: (showNumbers: boolean) => void;
  onEnergyEnabledChange: (enabled: boolean) => void;
  onMorningStyleChange: (style: SaveFile['config']['morningStyle']) => void;
  personas: Persona[];
  personaId: string;
  personaEditingId: string;
  setPersonaEditingId: (value: string) => void;
  personaName: string;
  setPersonaName: (value: string) => void;
  personaDisplayName: string;
  setPersonaDisplayName: (value: string) => void;
  personaDescription: string;
  setPersonaDescription: (value: string) => void;
  onSavePersona: () => Promise<void>;
  onBindPersona: (id: string) => void;
  onDeletePersona: (id: string) => Promise<void>;
  statKey: string;
  setStatKey: (value: string) => void;
  statValue: string;
  setStatValue: (value: string) => void;
  onAddStat: () => void;
  mockFixtureId: MockFixtureId | '';
  setMockFixtureId: (value: MockFixtureId | '') => void;
  onLoadStage4Fixture: () => void;
  devToolSeed: string;
  setDevToolSeed: (value: string) => void;
  devToolDays: string;
  setDevToolDays: (value: string) => void;
  devToolReport: DevToolReport;
  onRunDevTool: (kind: 'seed' | 'days' | 'lead' | 'topic' | 'encounter') => void;
  onExportProviderSettings: (selection: ProviderSettingsSelection) => Promise<void>;
  onImportProviderSettings: (pack: ProviderSettingsPackage, selection: ProviderSettingsSelection) => Promise<void>;
  onExportGlobalBackup: (includeSecrets: boolean) => Promise<void>;
  onImportGlobalBackup: (file?: File) => Promise<void>;
  globalBackupPreview: ImportedGlobalBackup | null;
  onRestoreGlobalBackup: (backup: ImportedGlobalBackup) => Promise<void>;
  onExportThemePackage: () => Promise<void>;
  onImportThemePackage: (file?: File) => Promise<void>;
  themePackagePreview: ImportedThemePackage | null;
  onApplyThemePackage: (backup: ImportedThemePackage, saveAs?: boolean) => Promise<void>;
  onCancelThemePackage: () => void;
}) {
  const [settingsThemeMode, setSettingsThemeMode] = useState<ThemeMode>(() => typeof window === 'undefined' ? 'system' : readThemeMode(window.localStorage));
  const [settingsThemeTemplate, setSettingsThemeTemplate] = useState<ThemeTemplate>(() => typeof window === 'undefined' ? 'default' : readThemeTemplate(window.localStorage));
  const [desktopTitles, setDesktopTitles] = useState<DesktopTitleOverrides>(() => typeof window === 'undefined' ? {} : readDesktopTitleOverrides(window.localStorage));
  const [appearanceDraft, setAppearanceDraft] = useState<ThemeAppearanceConfig>(() => props.themeAppearance);
  const settingsResolvedTheme = resolveTheme(settingsThemeMode, typeof window !== 'undefined' && (window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
  const changeSettingsTheme = (mode: ThemeMode) => {
    setSettingsThemeMode(mode);
    try { window.localStorage.setItem(THEME_STORAGE_KEY, mode); window.dispatchEvent(new CustomEvent('tokimeki:theme-change')); } catch { /* local preference unavailable */ }
  };
  const changeSettingsThemeTemplate = (template: ThemeTemplate) => {
    setSettingsThemeTemplate(template);
    applyThemeTemplate(template);
    try { window.localStorage.setItem(THEME_TEMPLATE_STORAGE_KEY, template); window.dispatchEvent(new CustomEvent('tokimeki:theme-change')); } catch { /* local preference unavailable */ }
  };
  const applyAppearanceDraft = () => props.onThemeAppearanceChange(appearanceDraft);
  const resetAppearanceDraft = () => { const next = { ...DEFAULT_THEME_APPEARANCE }; setAppearanceDraft(next); props.onThemeAppearanceChange(next); };
  const setDesktopTitle = (launcherId: string, entryId: string, title: string) => {
    const next = parseDesktopTitleOverrides({ ...desktopTitles, [launcherId]: { ...desktopTitles[launcherId], [entryId]: title } });
    setDesktopTitles(next); writeDesktopTitleOverrides(window.localStorage, next); window.dispatchEvent(new CustomEvent('tokimeki:theme-change'));
  };
  const resetDesktopTitles = () => { setDesktopTitles({}); writeDesktopTitleOverrides(window.localStorage, {}); window.dispatchEvent(new CustomEvent('tokimeki:theme-change')); };
  const [desktopIconUrls, setDesktopIconUrls] = useState<Record<string, string>>({});
  const isSaved = props.providers.some((item) => item.id === props.provider.id);
  const energy = getEnergyState(props.save.world);
  const entries: readonly DesktopEntry[] = SETTINGS_PAGE_DEFINITIONS;
  const pageTitle = SETTINGS_PAGE_DEFINITIONS.find((entry) => entry.id === props.activePage)?.pageTitle ?? '设置';
  const mobileCapabilities = readMobileCapabilities();
  if (!props.activePage) return <DesktopLauncher launcherId="settings" title="设置" appName={props.appName} entries={entries} onOpen={(id) => props.onOpenPage(id as SettingsPage)} />;
  if (props.activePage === 'migration') return <SubpageShell title={pageTitle} pageId="migration" onBack={props.onBack}><ProviderSettingsMigrationView providers={props.providers} ttsConfigs={props.ttsConfigs} imageConfig={props.imageConfig} onExport={props.onExportProviderSettings} onImport={props.onImportProviderSettings} onExportGlobalBackup={props.onExportGlobalBackup} onImportGlobalBackup={props.onImportGlobalBackup} globalBackupPreview={props.globalBackupPreview} onRestoreGlobalBackup={props.onRestoreGlobalBackup} /></SubpageShell>;
  if (props.activePage === 'image') return <SubpageShell title={pageTitle} pageId="image" onBack={props.onBack}><ImageSettingsView config={props.imageConfig} providers={props.providers} setProvider={props.setProvider} busy={props.imageBusy} onSave={props.onSaveImage} onTest={props.onTestImage} onNewProvider={props.onNewProvider} onOpenProvider={props.onOpenProvider} save={props.save} personas={props.personas} imageVisualConfigs={props.imageVisualConfigs} imageUserVisualConfigs={props.imageUserVisualConfigs} visualCharacterId={props.visualCharacterId} setVisualCharacterId={props.setVisualCharacterId} imagePrompt={props.imagePrompt} setImagePrompt={props.setImagePrompt} imageTarget={props.imageTarget} setImageTarget={props.setImageTarget} onSaveImageVisualConfig={props.onSaveImageVisualConfig} onSetCharacterFaceLock={props.onSetCharacterFaceLock} onImportCharacterFaceReference={props.onImportCharacterFaceReference} onRemoveCharacterFaceReference={props.onRemoveCharacterFaceReference} onSaveUserImageVisualConfig={props.onSaveUserImageVisualConfig} onSetUserFaceLock={props.onSetUserFaceLock} onImportUserFaceReference={props.onImportUserFaceReference} onRemoveUserFaceReference={props.onRemoveUserFaceReference} onGenerateCharacterImage={props.onGenerateCharacterImage} onDownloadGenerated={props.onDownloadGeneratedImage} onDeleteGenerated={props.onDeleteGeneratedImage} /></SubpageShell>;
  return <SubpageShell title={pageTitle} pageId={props.activePage} onBack={props.onBack}>
    {props.activePage === 'display' && <section className="provider-card settings-display-shortcut" aria-label="主题与主题包"><div className="section-heading"><div><span className="eyebrow">显示设置</span><h2>主题与主题包</h2></div><span className="io-scope">所有操作均为本地操作，不调用 API</span></div><div className="button-row"><label>主题模式<select aria-label="显示页主题模式" value={settingsThemeMode} onChange={(event) => changeSettingsTheme(event.target.value as ThemeMode)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label><label>组件模板<select aria-label="显示页组件模板" value={settingsThemeTemplate} onChange={(event) => changeSettingsThemeTemplate(event.target.value as ThemeTemplate)}><option value="default">默认灰阶</option><option value="soft">柔和圆角</option><option value="compact">紧凑直角</option></select></label></div><p className="io-scope">下方“显示选项”区域仍保留完整的消息气泡、卡片、地图和自定义 CSS 编辑器。</p><div className="button-row"><button type="button" className="secondary" onClick={() => void props.onExportThemePackage()}>导出主题包</button><label className="file-button">导入主题包<input type="file" accept=".zip" onChange={(event) => void props.onImportThemePackage(event.target.files?.[0])} /></label></div>{props.themePackagePreview && <p className="io-scope" role="status">主题包已读取，请向下查看预览并选择覆盖、另存或取消。</p>}</section>}
    <details className="fold-card" open><summary>玩家身份 · 面具身份</summary><div className="fold-body"><div className="provider-card persona-card"><div className="list-heading"><div><span className="eyebrow">玩家身份</span><h3>面具身份</h3></div><span className="io-scope">每个世界绑定一个</span></div><div className="persona-fields"><input placeholder="身份名称，例如：旅人" value={props.personaName} onChange={(event) => props.setPersonaName(event.target.value)} /><input placeholder="对话框称呼，例如：小明" value={props.personaDisplayName} onChange={(event) => props.setPersonaDisplayName(event.target.value)} /><textarea placeholder="自我描述（会注入面对面提示词）" value={props.personaDescription} onChange={(event) => props.setPersonaDescription(event.target.value)} /></div><div className="button-row"><button onClick={() => void props.onSavePersona()}>{props.personaEditingId ? '更新面具' : '保存面具'}</button><button className="secondary" onClick={() => { props.setPersonaEditingId(''); props.setPersonaName(''); props.setPersonaDisplayName(''); props.setPersonaDescription(''); }}>新建面具</button></div>{props.personas.length ? <div className="persona-list">{props.personas.map((persona) => <div className="list-row" key={persona.id}><span>{persona.name}<small>对话框：{persona.displayName}{persona.description ? ` · ${persona.description}` : ''}</small></span><span className="button-row"><button className={props.personaId === persona.id ? '' : 'secondary'} onClick={() => props.onBindPersona(persona.id)}>{props.personaId === persona.id ? '当前绑定' : '绑定'}</button><button className="secondary" onClick={() => { props.setPersonaEditingId(persona.id); props.setPersonaName(persona.name); props.setPersonaDisplayName(persona.displayName); props.setPersonaDescription(persona.description); }}>编辑</button><button className="danger" onClick={() => void props.onDeletePersona(persona.id)}>删除</button></span></div>)}</div> : <p className="empty">还没有面具身份，聊天名牌默认使用玩家名字。</p>}</div></div></details>
    <details className="fold-card" open><summary>Provider 配置 {props.requestStatus === 'requesting' ? '· 请求中' : ''}</summary><div className="fold-body"><div className="section-heading"><div><span className="eyebrow">本地设置</span><h2>Provider</h2></div>{props.requestStatus === 'requesting' && <span className="request-status requesting">请求中…</span>}</div>
    <div className="provider-card">
      <div className="field-with-action"><select aria-label="Provider 配置" value={isSaved ? props.provider.id : ''} onChange={(event) => { const found = props.providers.find((item) => item.id === event.target.value); if (found) props.setProvider(found); }}><option value="">未保存的新配置</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.kind}</option>)}</select><button className="secondary" onClick={props.onNewProvider}>新建</button></div>
      <label>渠道<select value={props.provider.kind} onChange={(event) => props.setProvider({ ...props.provider, kind: event.target.value as ProviderConfig['kind'] })}><option value="openai-compatible">OpenAI 兼容</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="generic">Generic</option></select></label>
      <label>配置名称<input value={props.provider.name} onChange={(event) => props.setProvider({ ...props.provider, name: event.target.value })} /></label>
      <label>基础 URL 或完整请求端点<input placeholder="https://example.com/v1" value={props.provider.endpoint} onChange={(event) => props.setProvider({ ...props.provider, endpoint: event.target.value })} /></label>
      <label>API key（仅本地）<input type="password" value={props.provider.apiKey ?? ''} onChange={(event) => props.setProvider({ ...props.provider, apiKey: event.target.value })} /></label>
      <label>模型<input list="model-list" placeholder="可手动填写" value={props.provider.model} onChange={(event) => props.setProvider({ ...props.provider, model: event.target.value })} /></label>
      <datalist id="model-list">{props.models.map((model) => <option key={model} value={model} />)}</datalist>
      <label>温度 {props.provider.temperature.toFixed(2)}<input type="range" min="0" max="2" step="0.05" value={props.provider.temperature} onChange={(event) => props.setProvider({ ...props.provider, temperature: Number(event.target.value) })} /></label>
      {props.provider.kind === 'openai-compatible' && <label>话题树输出格式<select value={props.provider.outputMode ?? 'auto'} onChange={(event) => props.setProvider({ ...props.provider, outputMode: event.target.value as ProviderConfig['outputMode'] })}><option value="auto">优先 Structured Outputs</option><option value="json_object">JSON mode（兼容性更广）</option><option value="off">关闭结构化输出</option></select><small>仅影响 TopicTree；中转站不支持 JSON Schema 时改用 JSON mode。</small></label>}
      {props.provider.kind === 'generic' && <div className="generic-fields">
        <label>自定义 headers（JSON）<textarea spellCheck={false} value={props.headersDraft} onChange={(event) => props.setHeadersDraft(event.target.value)} /></label>
        <label>请求体模板<textarea spellCheck={false} placeholder={'{"model":{{model}},"messages":{{messages}},"stream":{{stream}}}'} value={props.provider.bodyTemplate ?? ''} onChange={(event) => props.setProvider({ ...props.provider, bodyTemplate: event.target.value || undefined })} /></label>
        <label>响应文本路径<input placeholder="$.choices[0].message.content" value={props.provider.responsePath ?? ''} onChange={(event) => props.setProvider({ ...props.provider, responsePath: event.target.value || undefined })} /></label>
        <label>流式分帧<select value={props.provider.streamFraming ?? 'sse'} onChange={(event) => props.setProvider({ ...props.provider, streamFraming: event.target.value as ProviderConfig['streamFraming'] })}><option value="sse">SSE</option><option value="ndjson">NDJSON</option><option value="json">普通 JSON</option></select></label>
      </div>}
      <div className="button-row"><button onClick={() => void props.onSaveProvider()}>保存配置</button><button className="secondary" onClick={() => void props.onDiscoverModels()}>拉取模型</button><button className="secondary" onClick={() => void props.onTestConnection()}>连接测试</button>{isSaved && <button className="danger" onClick={() => void props.onDeleteProvider()}>删除配置</button>}</div>
    </div>
    </div></details>
    <details className="fold-card" open><summary>向量记忆 API · {props.embeddingConfig.enabled ? '已启用' : '已关闭'}</summary><div className="fold-body"><div className="provider-card">
      <div className="list-heading"><div><span className="eyebrow">可选外部检索</span><h3>向量记忆 API</h3></div><span className={`request-status ${props.embeddingConfig.lastStatus === 'error' ? 'error' : ''}`}>{props.embeddingBusy ? '请求中…' : props.embeddingConfig.lastStatus === 'success' ? '最近成功' : props.embeddingConfig.lastStatus === 'error' ? '最近失败' : '尚未调用'}</span></div>
      <label className="checkbox-line"><input type="checkbox" checked={props.embeddingConfig.enabled} onChange={(event) => props.setEmbeddingConfig({ ...props.embeddingConfig, enabled: event.target.checked })} />启用外部 embedding 混合检索</label>
      <p className="io-scope">默认关闭。启用后，仅在生成面对面回复且存在可注入记忆时，把当前输入与缺失或已变更的记忆批量发送到此端点；查看和管理记忆不会调用 API。失败时自动回退本地关键词检索。</p>
      <label>Embedding 请求端点<input placeholder="https://example.com/v1/embeddings" value={props.embeddingConfig.endpoint} onChange={(event) => props.setEmbeddingConfig({ ...props.embeddingConfig, endpoint: event.target.value })} /></label>
      <label>API key（仅本地）<input type="password" value={props.embeddingConfig.apiKey ?? ''} onChange={(event) => props.setEmbeddingConfig({ ...props.embeddingConfig, apiKey: event.target.value || undefined })} /></label>
      <label>Embedding 模型<input placeholder="text-embedding-model" value={props.embeddingConfig.model} onChange={(event) => props.setEmbeddingConfig({ ...props.embeddingConfig, model: event.target.value })} /></label>
      <label>自定义 headers（JSON）<textarea spellCheck={false} value={props.embeddingHeadersDraft} onChange={(event) => props.setEmbeddingHeadersDraft(event.target.value)} /></label>
      <div className="stat-list"><span>调用 {props.embeddingConfig.requestCount} 次</span><span>失败 {props.embeddingConfig.failureCount} 次</span>{props.embeddingConfig.lastCalledAt && <span>最近调用 {new Date(props.embeddingConfig.lastCalledAt).toLocaleString()}</span>}</div>
      {props.embeddingConfig.lastError && <p className="io-scope" role="alert">最近错误：{props.embeddingConfig.lastError}</p>}
      <div className="button-row"><button onClick={() => void props.onSaveEmbedding()} disabled={props.embeddingBusy}>保存设置</button><button className="secondary" onClick={() => void props.onTestEmbedding()} disabled={props.embeddingBusy}>连接测试</button><button className="secondary" onClick={() => void props.onRebuildEmbedding()} disabled={props.embeddingBusy || !props.embeddingConfig.enabled}>重建当前世界索引</button></div>
    </div></div></details>
    <details className="fold-card" open><summary>语音生成 · {props.ttsConfig.enabled ? '已启用' : '已关闭'}</summary><div className="fold-body"><div className="provider-card">
      <div className="list-heading"><div><span className="eyebrow">可选外部语音</span><h3>语音 API</h3></div><span className={`request-status ${props.ttsConfig.lastStatus === 'error' ? 'error' : ''}`}>{props.ttsBusy ? '请求中…' : props.ttsConfig.lastStatus === 'success' ? '最近成功' : props.ttsConfig.lastStatus === 'error' ? '最近失败' : '尚未调用'}</span></div>
      <div className="field-with-action"><select aria-label="语音 API 配置" value={props.ttsConfigs.some((item) => item.id === props.ttsConfig.id) ? props.ttsConfig.id : ''} onChange={(event) => props.onSelectTtsConfig(event.target.value)}><option value="">未保存的新配置</option>{props.ttsConfigs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="secondary" onClick={props.onNewTtsConfig}>新建</button></div>
      <label>配置名称<input value={props.ttsConfig.name} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, name: event.target.value })} /></label>
      <label className="checkbox-line"><input type="checkbox" checked={props.ttsConfig.enabled} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, enabled: event.target.checked })} />启用语音生成</label>
      <p className="io-scope">默认关闭。消息 App 的用户侧语音合成发送入口已移除，已有语音仍可播放；这里只在你显式执行连接测试时调用 API，配置和 API key 只保存在当前浏览器。</p>
      <label>Speech 请求端点<input placeholder="https://example.com/v1/audio/speech" value={props.ttsConfig.endpoint} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, endpoint: event.target.value })} /></label>
      <label>API key（仅本地）<input type="password" value={props.ttsConfig.apiKey ?? ''} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, apiKey: event.target.value || undefined })} /></label>
      <label>语音模型<input placeholder="gpt-4o-mini-tts" value={props.ttsConfig.model} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, model: event.target.value })} /></label>
      <label>voice<input placeholder="alloy" value={props.ttsConfig.voice} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, voice: event.target.value })} /></label>
      <label>格式<select value={props.ttsConfig.format} onChange={(event) => props.setTtsConfig({ ...props.ttsConfig, format: event.target.value as TtsConfig['format'] })}><option value="mp3">mp3</option><option value="opus">opus</option><option value="aac">aac</option><option value="flac">flac</option><option value="wav">wav</option><option value="pcm">pcm</option></select></label>
      <label>自定义 headers（JSON）<textarea spellCheck={false} value={props.ttsHeadersDraft} onChange={(event) => props.setTtsHeadersDraft(event.target.value)} /></label>
      <div className="stat-list"><span>调用 {props.ttsConfig.requestCount} 次</span><span>失败 {props.ttsConfig.failureCount} 次</span>{props.ttsConfig.pendingRequest && <span>保留待重试语音</span>}</div>
      {props.ttsConfig.lastError && <p className="io-scope" role="alert">最近错误：{props.ttsConfig.lastError}</p>}
      <label>全局默认语音配置<select aria-label="默认语音配置" value={props.defaultTtsConfigId} disabled={props.ttsConfigs.length === 0} onChange={(event) => void props.onDefaultTtsChange(event.target.value)}><option value="">未设置</option>{props.ttsConfigs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="button-row"><button onClick={() => void props.onSaveTts()} disabled={props.ttsBusy}>保存设置</button><button className="secondary" onClick={() => void props.onTestTts()} disabled={props.ttsBusy}>连接测试</button>{props.ttsConfigs.some((item) => item.id === props.ttsConfig.id) && <button className="danger" onClick={() => void props.onDeleteTtsConfig()} disabled={props.ttsBusy}>删除配置</button>}</div>
    </div></div></details>
    <details className="fold-card" open><summary>任务路由</summary><div className="fold-body"><div className="provider-card routing-card">
      <h3>任务路由</h3>
      <label>默认 Provider<select aria-label="默认 Provider" value={props.defaultProviderId} disabled={props.providers.length === 0} onChange={(event) => void props.onDefaultProviderChange(event.target.value)}><option value="">未设置</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <p className="io-scope">图像生成已移到独立“图像”入口；这里继续管理其他文本任务。</p>
      <div className="routing-list">{ROUTING_TASK_IDS.map((taskId) => <label key={taskId}><span>{TASK_LABELS[taskId]}<small>{taskId}</small></span><select aria-label={`${TASK_LABELS[taskId]} Provider`} value={props.bindings.find((binding) => binding.taskId === taskId)?.providerId ?? ''} disabled={props.providers.length === 0} onChange={(event) => void props.onBindingChange(taskId, event.target.value)}><option value="">使用默认 Provider</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>)}</div>
    </div></div></details>
    <details className="fold-card settings-rule-page" open><summary>游戏规则</summary><div className="fold-body"><div className="provider-card">
      <h3>独立主题包</h3>
      <p className="io-scope">主题包只包含主题外观、自定义 CSS、桌面入口标题/图标和相关本地图标；不包含世界存档、聊天记录、Provider 配置或 API key。导入前会显示冲突，外链图标只保留 URL，不自动下载。</p>
      <div className="button-row"><button type="button" className="secondary" onClick={() => void props.onExportThemePackage()}>导出主题包</button><label className="file-button">导入主题包<input type="file" accept=".zip" onChange={(event) => void props.onImportThemePackage(event.target.files?.[0])} /></label></div>
      {props.themePackagePreview && <div className="provider-card"><div className="list-heading"><h4>主题包导入预览</h4><button type="button" className="secondary" onClick={props.onCancelThemePackage}>取消</button></div><p>模板：{props.themePackagePreview.theme.template} · 自定义 CSS：{props.themePackagePreview.theme.customCss.length} 字符 · 标题覆盖：{Object.values(props.themePackagePreview.theme.desktopTitles).reduce((sum, entries) => sum + Object.keys(entries).length, 0)} 项 · 本地图标：{props.themePackagePreview.assets.size} 个 · 外链图标：{Object.values(props.themePackagePreview.theme.desktopIcons).flatMap((entries) => Object.values(entries)).filter((ref) => ref.kind === 'url').length} 个</p><p className="io-scope">应用会覆盖当前主题偏好，但不会改动世界、聊天或 Provider。资产 ID 冲突会自动生成本地新 ID。</p><div className="button-row"><button type="button" onClick={() => void props.onApplyThemePackage(props.themePackagePreview!)}>覆盖当前主题</button><button type="button" className="secondary" onClick={() => void props.onApplyThemePackage(props.themePackagePreview!, true)}>另存为本地主题</button></div></div>}
      <h3>生活资源</h3>
      <label className="checkbox-line"><input type="checkbox" checked={energy?.enabled ?? false} disabled={!energy} onChange={(event) => props.onEnergyEnabledChange(event.target.checked)} />启用体力消耗</label>
      <p className="io-scope">体力作为通用 stat 保存。关闭后行动不扣体力，当前数值仍保留；重新开启后继续使用。</p>
      <h3>自定义 stats</h3>
      <p className="io-scope">给玩家增加通用数字状态，例如 money、trust 或 custom-reputation。AI 可通过已注册的 stat op 修改它，不需要改代码；这里仅设置初始值。</p>
      <div className="field-with-action"><input placeholder="stat 名称" value={props.statKey} onChange={(event) => props.setStatKey(event.target.value)} /><input type="number" placeholder="初始值" value={props.statValue} onChange={(event) => props.setStatValue(event.target.value)} /></div>
      <button className="secondary" onClick={props.onAddStat}>保存玩家 stat</button>
      <div className="stat-list">{Object.entries(props.save.world.player.stats).map(([key, value]) => <span key={key}>{key}: {value}</span>)}</div>
    </div></div></details>
    <details className="fold-card" open><summary>显示选项</summary><div className="fold-body"><div className="provider-card">
      <h3>主题</h3>
      <label>主题模式<select aria-label="主题模式" value={settingsThemeMode} onChange={(event) => changeSettingsTheme(event.target.value as ThemeMode)}><option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option></select></label>
      <p className="io-scope">当前显示：{settingsResolvedTheme === 'dark' ? '深色' : '浅色'}。主题偏好只保存在本机浏览器，并会包含在全局备份的界面偏好中。</p>
      <label>组件模板<select aria-label="组件模板" value={settingsThemeTemplate} onChange={(event) => changeSettingsThemeTemplate(event.target.value as ThemeTemplate)}><option value="default">默认灰阶</option><option value="soft">柔和圆角</option><option value="compact">紧凑直角</option></select></label>
      <p className="io-scope">模板会统一调整消息气泡、地图卡片和终端消息的圆角与间距，不改变内容或布局结构。</p>
      <h3>消息 App 外观</h3>
      <div className="theme-appearance-grid">
        <label>玩家气泡背景<input value={appearanceDraft.playerBubbleBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, playerBubbleBg: event.target.value })} /></label>
        <label>玩家气泡文字<input value={appearanceDraft.playerBubbleFg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, playerBubbleFg: event.target.value })} /></label>
        <label>角色气泡背景<input value={appearanceDraft.characterBubbleBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, characterBubbleBg: event.target.value })} /></label>
        <label>角色气泡文字<input value={appearanceDraft.characterBubbleFg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, characterBubbleFg: event.target.value })} /></label>
        <label>气泡圆角（px）<input type="number" min="0" max="32" value={appearanceDraft.messageRadius} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, messageRadius: Number(event.target.value) })} /></label>
        <label>气泡内边距（px）<input type="number" min="4" max="28" value={appearanceDraft.messagePadding} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, messagePadding: Number(event.target.value) })} /></label>
        <label>终端背景<input value={appearanceDraft.terminalBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, terminalBg: event.target.value })} /></label>
        <label>卡片背景<input value={appearanceDraft.cardBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, cardBg: event.target.value })} /></label>
        <label>卡片边框<input value={appearanceDraft.cardBorder} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, cardBorder: event.target.value })} /></label>
        <label>卡片圆角（px）<input type="number" min="0" max="32" value={appearanceDraft.cardRadius} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, cardRadius: Number(event.target.value) })} /></label>
        <label>卡片阴影<input value={appearanceDraft.cardShadow} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, cardShadow: event.target.value })} /></label>
        <label>列表分隔线<input value={appearanceDraft.listDivider} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, listDivider: event.target.value })} /></label>
        <label>输入区背景<input value={appearanceDraft.terminalInputBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, terminalInputBg: event.target.value })} /></label>
        <label>按钮背景<input value={appearanceDraft.buttonBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, buttonBg: event.target.value })} /></label>
        <label>选中背景<input value={appearanceDraft.selectedBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, selectedBg: event.target.value })} /></label>
        <label>列表间距（px）<input type="number" min="0" max="32" value={appearanceDraft.listGap} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, listGap: Number(event.target.value) })} /></label>
        <label>地图卡片背景<input value={appearanceDraft.mapCardBg} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, mapCardBg: event.target.value })} /></label>
        <label>地图卡片边框<input value={appearanceDraft.mapCardBorder} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, mapCardBorder: event.target.value })} /></label>
        <label>地图卡片圆角（px）<input type="number" min="0" max="32" value={appearanceDraft.mapCardRadius} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, mapCardRadius: Number(event.target.value) })} /></label>
        <label>地图卡片阴影<input value={appearanceDraft.mapCardShadow} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, mapCardShadow: event.target.value })} /></label>
        <label>地图面板间距（px）<input type="number" min="0" max="32" value={appearanceDraft.mapGap} onChange={(event) => setAppearanceDraft({ ...appearanceDraft, mapGap: Number(event.target.value) })} /></label>
      </div>
      <div className="theme-appearance-preview"><div className="message user">玩家消息预览</div><div className="message assistant">角色消息预览</div><div className="list-card">终端 / 地图卡片预览</div></div>
      <div className="button-row"><button type="button" onClick={applyAppearanceDraft}>应用外观</button><button type="button" className="secondary" onClick={resetAppearanceDraft}>恢复外观默认</button></div>
      <h3>自定义 CSS</h3>
      <textarea aria-label="自定义 CSS" spellCheck={false} value={props.customCssDraft} onChange={(event) => props.setCustomCssDraft(event.target.value)} placeholder="例如：.message { border-radius: 16px; }" />
      <div className="button-row"><button type="button" onClick={() => { const issues = props.onSaveCustomCss(); if (issues.length) window.alert(issues.join('\n')); }}>应用自定义 CSS</button><button type="button" className="secondary" onClick={props.onResetCustomCss}>恢复默认</button></div>
      <p className="io-scope">只允许本地 CSS；禁止 @import、外链 url、脚本表达式和行为属性。不会执行 JavaScript，也不会请求网络。</p>
      <h3>桌面入口标题</h3>
      <p className="io-scope">标题覆盖只影响桌面图标；输入为空时恢复内置标题。底部主导航保持固定。</p>
      <div className="desktop-title-editor"><strong>设置桌面</strong>{SETTINGS_PAGE_DEFINITIONS.map((entry) => <label key={`settings-${entry.id}`}>{entry.label}<input value={desktopTitles.settings?.[entry.id] ?? ''} placeholder={entry.label} maxLength={40} onChange={(event) => setDesktopTitle('settings', entry.id, event.target.value)} /></label>)}<strong>终端桌面</strong>{[...LIBRARY_PAGE_DEFINITIONS, { id: 'event-packages', label: '事件包' }].map((entry) => <label key={`terminal-${entry.id}`}>{entry.label}<input value={desktopTitles.terminal?.[entry.id] ?? ''} placeholder={entry.label} maxLength={40} onChange={(event) => setDesktopTitle('terminal', entry.id, event.target.value)} /></label>)}</div>
      <button type="button" className="secondary" onClick={resetDesktopTitles}>恢复全部入口默认标题</button>
      <h3>桌面入口图标</h3>
      <p className="io-scope">支持本地 PNG、JPEG、WebP 或 https 外链。本地图片保存到 Assets IndexedDB；外链只保存 URL，不自动下载。</p>
      <div className="desktop-icon-editor">{[...SETTINGS_PAGE_DEFINITIONS.map((entry) => ({ ...entry, launcherId: 'settings' })), ...[...LIBRARY_PAGE_DEFINITIONS, { id: 'event-packages', label: '事件包' }].map((entry) => ({ ...entry, launcherId: 'terminal' }))].map((entry) => { const ref = props.desktopIcons[entry.launcherId]?.[entry.id]; const key = `${entry.launcherId}:${entry.id}`; return <div className="desktop-icon-editor-row" key={key}><strong>{entry.label}</strong><span className="io-scope">{ref?.kind === 'stored' ? `本地：${ref.assetId}` : ref?.kind === 'url' ? `外链：${ref.url}` : '使用内置图标'}</span><label className="file-button">上传<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void props.onImportDesktopIcon(entry.launcherId, entry.id, event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><input placeholder="https://…" value={desktopIconUrls[key] ?? ''} onChange={(event) => setDesktopIconUrls((current) => ({ ...current, [key]: event.target.value }))} /><button type="button" className="secondary" onClick={() => { void props.onSetDesktopIconUrl(entry.launcherId, entry.id, desktopIconUrls[key] ?? ''); }}>保存外链</button>{ref && <button type="button" className="danger" onClick={() => void props.onRemoveDesktopIcon(entry.launcherId, entry.id)}>恢复默认图标</button>}</div>; })}</div>
      <h3>生活资源</h3>
      <label className="checkbox-line"><input type="checkbox" checked={energy?.enabled ?? false} disabled={!energy} onChange={(event) => props.onEnergyEnabledChange(event.target.checked)} />启用体力消耗</label>
      <p className="io-scope">体力作为通用 stat 保存。关闭后行动不扣体力，当前数值仍保留；重新开启后继续使用。</p>
      <h3>结算显示</h3>
      <label className="checkbox-line"><input type="checkbox" checked={props.save.config.showNumbers} onChange={(event) => props.onShowNumbersChange(event.target.checked)} />显示关系数值明细</label>
      <p className="io-scope">默认关闭。关闭时关系变化只显示散文；开启后才显示各关系轴的原始变化量。</p>
      <h3>晨报呈现</h3>
      <label>世界动态入口<select aria-label="晨报呈现" value={props.save.config.morningStyle} onChange={(event) => props.onMorningStyleChange(event.target.value as SaveFile['config']['morningStyle'])}><option value="newspaper">报纸</option><option value="notice_board">委托板</option><option value="terminal">终端推送</option><option value="tavern">酒馆流言</option></select></label>
      <p className="io-scope">只改变晨报的界面文案，不改变世界事实、条目内容或 API 调用。</p>
    </div></div></details>
    <details className="fold-card settings-privacy-page" open><summary>数据与隐私</summary><div className="fold-body"><div className="provider-card">
      <h3>数据存放</h3>
      <p className="io-scope">世界存档、聊天、内容包和 API key 只保存在当前浏览器。世界存档导出不包含 Provider 配置或 API key。</p>
      <h3>浏览器存储</h3>
      <div className="stat-list"><span>已用 {formatStorageBytes(props.storageEstimate.usage)}</span><span>配额 {formatStorageBytes(props.storageEstimate.quota)}</span>{storageUsagePercent(props.storageEstimate) !== undefined && <span>占用 {storageUsagePercent(props.storageEstimate)!.toFixed(1)}%</span>}<span>持久化：{props.storageEstimate.persisted === undefined ? '未知' : props.storageEstimate.persisted ? '已标记' : '未标记'}</span></div>
      <p className="io-scope">占用和配额由浏览器提供，包含本应用的 IndexedDB 与其他站点数据，数值仅供参考。持久化申请不会上传数据，也不会调用 Provider。</p>
      <button type="button" className="secondary" onClick={() => void props.onPersistStorage()}>请求持久化存储</button>
      <h3>资产引用完整性</h3>
      <p className="io-scope">检查当前世界、角色库、快照、面对面聊天、贴图库和锁脸配置中的本地资产引用。检查只读取 IndexedDB，不修改或删除任何数据。</p>
      <button type="button" className="secondary" disabled={props.assetIntegrityBusy} onClick={() => void props.onCheckAssetIntegrity()}>{props.assetIntegrityBusy ? '检查中…' : '运行本地完整性检查'}</button>
      {props.assetIntegrityReport && <div className="asset-integrity-report"><div className="stat-list"><span>{props.assetIntegrityReport.referenceCount} 处引用</span><span>{props.assetIntegrityReport.referencedAssetCount} 个被引用资产</span><span>{props.assetIntegrityReport.storedAssetCount} 个本地资产</span><span>{props.assetIntegrityReport.missing.length} 个失效引用</span><span>{props.assetIntegrityReport.orphaned.length} 个孤立资产</span></div>{props.assetIntegrityReport.missing.length === 0 && props.assetIntegrityReport.orphaned.length === 0 ? <p className="io-scope">引用与本地二进制一致。</p> : <>{props.assetIntegrityReport.missing.length > 0 && <details><summary>缺失或空资产</summary><div className="integrity-issue-list">{props.assetIntegrityReport.missing.map((issue) => <div key={issue.assetId}><strong>{issue.assetId}</strong><small>{issue.empty ? '本地记录为零字节' : 'Assets IndexedDB 中不存在'} · {issue.sources.join('；')}</small></div>)}</div></details>}{props.assetIntegrityReport.orphaned.length > 0 && <details><summary>无引用资产</summary><div className="integrity-issue-list">{props.assetIntegrityReport.orphaned.map((asset) => <div key={asset.assetId}><strong>{asset.assetId}</strong><small>{formatByteSize(asset.size)} · {asset.mimeType}{asset.category ? ` · ${asset.category}` : ''}</small></div>)}</div></details>}</>}</div>}
      <h3>网络请求</h3>
      <p className="io-scope">查看设置、记忆和已有内容不会调用 API。只有用户触发生成、连接测试、模型列表、向量测试或索引重建时，才会请求对应的显式配置端点。</p>
      <h3>移动端与 PWA 能力</h3>
      <div className="stat-list"><span>平台：{mobileCapabilities.platformFamily === 'ios' ? 'iOS / iPadOS' : mobileCapabilities.platformFamily === 'android' ? 'Android' : '其他 / 无法确定'}</span><span>运行方式：{mobileCapabilities.displayMode === 'standalone' ? '主屏幕 / standalone' : '浏览器标签页'}</span><span>通知：{notificationCapabilityLabel(mobileCapabilities)}</span><span>Service Worker：{serviceWorkerCapabilityLabel(mobileCapabilities)}</span><span>Media Session：{mobileCapabilities.mediaSessionApi ? 'API 可用' : '不可用'}</span><span>持久化存储：{mobileCapabilities.storagePersistApi ? '可申请' : '不可申请'}</span></div>
      <details><summary>后台相关 API 诊断</summary><div className="stat-list"><span>Push：{mobileCapabilities.pushManagerApi ? 'API 可见' : '不可用'}</span><span>Background Sync：{mobileCapabilities.backgroundSyncApi ? 'API 可见' : '不可用'}</span><span>Periodic Sync：{mobileCapabilities.periodicSyncApi ? 'API 可见' : '不可用'}</span><span>Wake Lock：{mobileCapabilities.wakeLockApi ? 'API 可见' : '不可用'}</span><span>安全上下文：{mobileCapabilities.secureContext ? '是' : '否'}</span></div></details>
      <p className="io-scope">“API 可用”只表示当前浏览器暴露了接口，不代表后台请求、通知、锁屏播放或定时任务一定持续运行。系统仍可能冻结页面、终止 Service Worker 或回收进程；Tokimeki 继续以落盘恢复和手动重试作为可靠降级。</p>
      <h3>Provider 后台代理评估</h3>
      <p className="io-scope">{providerProxyAssessmentLabel(mobileCapabilities.serviceWorkerApi)}。Service Worker 仍受 CORS 和系统生命周期限制；Tokimeki 不会把 API key 或完整 prompt 复制进后台任务，也不会自动重放可能产生重复计费和重复 ops 的生成请求。</p>
      <details><summary>查看不启用原因</summary><ul>{PROVIDER_PROXY_ASSESSMENT.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></details>
      <LocalNotificationSettingsPanel />
      <h3>图片资产</h3>
      <div className="stat-list"><span>{props.imageAssetStats.count} 个图片</span><span>{formatByteSize(props.imageAssetStats.totalBytes)}</span><span>{props.imageAssetStats.referenceCount} 处角色视觉 / 锁脸引用</span></div>
      <p className="io-scope">安全清理只删除完整引用扫描确认无人使用的图片，并移除已缺失的锁脸引用。头像、立绘、地图、贴图、快照和锁脸仍在使用的图片不会删除。</p>
      <button type="button" className="danger" onClick={() => void props.onClearUnusedImageAssets()}>清理无引用图片</button>
      <button type="button" className="danger" onClick={() => void props.onClearChatCgImages?.()}>清理聊天 CG（保留文字）</button>
      <h3>语音缓存</h3>
      <div className="stat-list"><span>{props.voiceCacheStats.count} 个音频</span><span>{formatByteSize(props.voiceCacheStats.totalBytes)}</span><span>{props.voiceCacheStats.referenceCount} 处消息引用</span></div>
      <p className="io-scope">清理只移除消息中的语音引用并保留文字；被头像、贴图等其他功能共用的资产不会删除。</p>
      <button type="button" className="danger" onClick={() => void props.onClearVoiceCache()} disabled={props.voiceCacheStats.count === 0}>清理语音缓存</button>
      <h3>音乐资产</h3>
      <div className="stat-list"><span>{props.musicAssetStats.count} 个本地音频</span><span>{formatByteSize(props.musicAssetStats.totalBytes)}</span><span>{props.musicAssetStats.importedCount} 个本地导入</span><span>{props.musicAssetStats.offlineCacheCount} 个外链缓存</span><span>{props.musicAssetStats.referenceCount} 处曲目引用</span><span>{props.musicAssetStats.orphanedCount} 个无引用</span></div>
      <p className="io-scope">移除离线缓存会保留曲目和原 URL；本地导入是用户原始内容，不会被批量缓存清理删除。无引用清理只删除没有任何音乐曲目引用的二进制。</p>
      <button type="button" className="danger" onClick={() => void props.onClearMusicOfflineCaches()} disabled={props.musicAssetStats.offlineCacheCount === 0}>清理外链离线缓存</button>
      <button type="button" className="danger" onClick={() => void props.onClearOrphanedMusicAssets()} disabled={props.musicAssetStats.orphanedCount === 0}>清理无引用音乐资产</button>
    </div></div></details>
    <details className="advanced" open><summary>高级与调试</summary><p className="io-scope">生成回复后打开下方“Ops diff”标签，可查看解析阶段、被拒绝操作、clamp 警告和状态前后变化。</p><DebugView debug={props.debug} tab={props.debugTab} setTab={props.setDebugTab} /></details>
    <details className="advanced" open><summary>Mock provider 验收工具</summary><div className="provider-card mock-tools"><p className="io-scope">仅开发验收使用，不进入普通 Provider 列表；先在资料页创建角色并进入聊天，选择 fixture 后点击“生成回复”即可零 API 重现。</p><label>fixture<select aria-label="Mock fixture" value={props.mockFixtureId} onChange={(event) => props.setMockFixtureId(event.target.value as MockFixtureId | '')}><option value="">关闭 Mock</option>{MOCK_FIXTURE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}</select></label>{props.mockFixtureId && <div className="fixture-help"><strong>预期结果</strong><p>{MOCK_FIXTURE_DESCRIPTIONS[props.mockFixtureId]}</p></div>}<div className="fixture-list">{MOCK_FIXTURE_IDS.map((id) => <div key={id}><strong>{id}</strong><span>{MOCK_FIXTURE_DESCRIPTIONS[id]}</span></div>)}</div><div className="fixture-help"><strong>阶段 4 相遇测试</strong><p>载入独立测试世界后，第 3 天中午前往西码头，会遇见两位正式角色和一位半正式 NPC。</p><button className="secondary" onClick={props.onLoadStage4Fixture}>载入阶段 4 测试存档</button></div></div></details>
    <details className="advanced" open><summary>播种器与无头调参台</summary><div className="provider-card mock-tools"><p className="io-scope">纯本地开发工具：所有模拟都运行在当前存档的克隆上，不写回正式世界、不调用 API。播种器用于生成可重复的基准场景；调参台用于比较固定 seed 下的多日结果。</p><div className="field-with-action"><label>Seed<input type="number" value={props.devToolSeed} onChange={(event) => props.setDevToolSeed(event.target.value)} /></label><label>天数<input type="number" min="1" value={props.devToolDays} onChange={(event) => props.setDevToolDays(event.target.value)} /></label></div><div className="button-row"><button onClick={() => props.onRunDevTool('seed')}>生成测试场景</button><button className="secondary" onClick={() => props.onRunDevTool('days')}>推进多日</button><button className="secondary" onClick={() => props.onRunDevTool('lead')}>Lead 忽略率</button><button className="secondary" onClick={() => props.onRunDevTool('topic')}>话题消耗</button><button className="secondary" onClick={() => props.onRunDevTool('encounter')}>相遇分布</button></div>{props.devToolReport && <div className="fixture-help"><div className="list-heading"><strong>{props.devToolReport.title}</strong><button className="secondary" onClick={() => props.onRunDevTool('seed')}>生成基准场景</button></div><pre className="debug-output">{props.devToolReport.body}</pre></div>}</div></details>
  </SubpageShell>;
}

function PresetBundleView(props: { presetBundles: PresetBundle[]; selectedPresetBundleId: string; setSelectedPresetBundleId: (value: string) => void; presetBundleName: string; setPresetBundleName: (value: string) => void; onCreatePresetBundle: () => Promise<void>; onRenamePresetBundle: () => Promise<void>; onDeletePresetBundle: (id: string) => Promise<void>; onSetPresetEntryEnabled: (bundleId: string, entryId: string, enabled: boolean) => Promise<void>; onMovePresetEntry: (bundleId: string, entryId: string, direction: -1 | 1) => Promise<void>; onExportPresetBundle: () => Promise<void>; onImportPresetBundle: (file?: File) => Promise<void>; onEditPreset: (entry: Preset) => void; onDeletePreset: (id: string) => Promise<void>; onExportPreset: (entry: Preset) => void }) {
  const bundles = Array.isArray(props.presetBundles) ? props.presetBundles.filter((bundle): bundle is PresetBundle => Boolean(bundle && typeof bundle === 'object')) : [];
  const selected = bundles.find((bundle) => bundle.id === props.selectedPresetBundleId);
  const selectedEntries = selected && Array.isArray(selected.entries)
    ? selected.entries.filter((entry): entry is Preset => Boolean(entry && typeof entry === 'object'))
    : [];
  return <details className="fold-card"><summary>预设包</summary><div className="fold-body"><div className="list-card">
    <div className="list-heading"><h3>预设包</h3><div className="button-row"><button className="secondary" disabled={!selected} onClick={() => void props.onExportPresetBundle()}>导出当前预设包</button><label className="file-button">导入预设包<input type="file" accept=".zip" onChange={(event) => void props.onImportPresetBundle(event.target.files?.[0])} /></label></div></div>
    <div className="field-with-action"><input placeholder="预设包名称" value={props.presetBundleName} onChange={(event) => props.setPresetBundleName(event.target.value)} /><button onClick={() => void (selected ? props.onRenamePresetBundle() : props.onCreatePresetBundle())}>{selected ? '更新包名称' : '新建预设包'}</button></div>
    <label>当前预设包<select value={props.selectedPresetBundleId} onChange={(event) => { const id = event.target.value; props.setSelectedPresetBundleId(id); props.setPresetBundleName(bundles.find((bundle) => bundle.id === id)?.name ?? ''); }}><option value="">不使用预设包</option>{bundles.map((bundle) => <option key={bundle.id} value={bundle.id}>{bundle.name}</option>)}</select></label>
    <p className="io-scope">启用条目会在下一次生成时按从上到下的顺序发送；最上方条目是核心预设，位于所有内置提示词之前。</p>
    {selected ? <div className="list-card preset-entry-list"><div className="list-heading"><strong>{selected.name}</strong><span className="button-row"><button onClick={() => props.setPresetBundleName(selected.name)}>编辑</button><button disabled={selected.id === BUILTIN_NARRATION_PRESET_BUNDLE_ID} onClick={() => void props.onDeletePresetBundle(selected.id)}>删除</button></span></div>{selectedEntries.length === 0 ? <p className="empty">暂无预设条目</p> : selectedEntries.map((entry, index) => <div className={`list-row preset-entry-row ${entry.enabled ? '' : 'disabled'}`} key={entry.id}><span><span className="preset-entry-title">{index === 0 && <strong>核心</strong>}{entry.name}</span><small>{entry.systemPrompt || '无提示词内容'}</small></span><span className="preset-entry-actions"><label className="checkbox-line"><input type="checkbox" checked={entry.enabled} onChange={(event) => void props.onSetPresetEntryEnabled(selected.id, entry.id, event.target.checked)} />启用</label><button className="secondary" aria-label={`上移${entry.name}`} disabled={index === 0} onClick={() => void props.onMovePresetEntry(selected.id, entry.id, -1)}>↑</button><button className="secondary" aria-label={`下移${entry.name}`} disabled={index === selectedEntries.length - 1} onClick={() => void props.onMovePresetEntry(selected.id, entry.id, 1)}>↓</button><button onClick={() => props.onEditPreset(entry)}>编辑</button><button disabled={selected.id === BUILTIN_NARRATION_PRESET_BUNDLE_ID} onClick={() => void props.onDeletePreset(entry.id)}>删除</button><button onClick={() => props.onExportPreset(entry)}>导出</button></span></div>)}</div> : <p className="empty">请选择或创建预设包</p>}
  </div></div></details>;
}

function MemoryLibraryView(props: {
  save: SaveFile;
  onArchiveMemory: (charId: string, memoryId: string) => void;
  onRestoreMemory: (charId: string, memoryId: string) => void;
  onDeleteMemory: (charId: string, memoryId: string) => void;
  onEditMemory: (charId: string, memoryId: string, patch: { text?: string; type?: string; importance?: string }) => void;
  onToggleInjection: (charId: string, memoryId: string, inject: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ text: '', type: 'interaction', importance: 'normal' });
  const characters = Object.values(props.save.world.characters);
  const beginEdit = (charId: string, memory: { id: string; text: string; type?: string; importance?: string }) => {
    setEditing(`${charId}:${memory.id}`);
    setDraft({ text: memory.text, type: memory.type ?? 'interaction', importance: memory.importance ?? 'normal' });
  };
  return <section className="memory-library-section"><div className="section-heading"><div><span className="eyebrow">长期上下文</span><h2>记忆库</h2><p className="io-scope">记忆管理只影响未来 Prompt；归档不会改写历史对话或已经发生的世界事实。</p></div></div><div className="list-card memory-library-card"><div className="memory-controls"><input aria-label="搜索记忆" placeholder="按关键词搜索记忆" value={query} onChange={(event) => setQuery(event.target.value)} /><label className="checkbox-line"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />显示已归档</label></div>{characters.length === 0 ? <p className="empty">当前世界还没有角色。</p> : characters.map((character) => { const allMemories = props.save.world.relations[character.id]?.memories ?? []; const memories = allMemories.filter((memory) => (showArchived ? memory.archived === true : memory.archived !== true) && (!query.trim() || memory.text.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))); return <details className="memory-character" key={character.id}><summary>{character.name} · {memories.length} 条{showArchived ? '已归档' : '可用'}记忆</summary><div className="memory-list">{memories.length === 0 ? <p className="empty">没有匹配的记忆。</p> : memories.map((memory) => { const key = `${character.id}:${memory.id}`; return <div className="memory-entry" key={memory.id}>{editing === key ? <div className="memory-editor"><textarea aria-label="记忆内容" value={draft.text} onChange={(event) => setDraft((current) => ({ ...current, text: event.target.value }))} /><div className="button-row"><label>类型<select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option value="interaction">互动</option><option value="promise">约定</option><option value="preference">偏好</option><option value="event">事件</option><option value="observation">观察</option><option value="other">其他</option></select></label><label>重要性<select value={draft.importance} onChange={(event) => setDraft((current) => ({ ...current, importance: event.target.value }))}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="critical">关键</option></select></label></div><div className="button-row"><button onClick={() => { props.onEditMemory(character.id, memory.id, draft); setEditing(null); }}>保存</button><button className="secondary" onClick={() => setEditing(null)}>取消</button></div></div> : <><div className="list-heading"><span>{memory.text}<small>第 {memory.day} 天{memory.nodeId ? ` · 地点 ${memory.nodeId}` : ''} · {memory.type ?? 'interaction'} · {memory.importance ?? 'normal'} · 来源：{memory.source?.kind ?? 'legacy'}</small></span><div className="button-row"><button onClick={() => beginEdit(character.id, memory)}>编辑</button>{memory.archived ? <button onClick={() => props.onRestoreMemory(character.id, memory.id)}>恢复</button> : <button className="secondary" onClick={() => props.onArchiveMemory(character.id, memory.id)}>归档</button>}{memory.archived && <button className="danger" onClick={() => props.onDeleteMemory(character.id, memory.id)}>永久删除</button>}</div></div><label className="checkbox-line"><input type="checkbox" checked={memory.inject !== false} onChange={(event) => props.onToggleInjection(character.id, memory.id, event.target.checked)} />允许注入 Prompt</label></>}</div>; })}</div></details>; })}</div></section>;
}

function CollectionLibraryView(props: { save: SaveFile; onUpdate: (id: string, title: string, description: string) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const beginEdit = (entry: CollectionEntry) => { setEditing(entry.id); setTitle(entry.title); setDescription(entry.description); };
  const entries = props.save.world.collection;
  return <details className="fold-card collection-library-section"><summary>收藏</summary><div className="fold-body"><p className="io-scope">收藏条目由实际获得的物品生成；可编辑展示文字，不改变物品、库存或获得事实。</p><div className="list-card collection-library-card">{entries.length === 0 ? <p className="empty">暂无收藏。获得物品后会自动记录在这里。</p> : entries.map((entry) => <div className="collection-entry" key={entry.id}>{editing === entry.id ? <div className="collection-editor"><input aria-label="收藏标题" value={title} onChange={(event) => setTitle(event.target.value)} /><textarea aria-label="收藏描述" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="button-row"><button onClick={() => { props.onUpdate(entry.id, title, description); setEditing(null); }}>保存</button><button className="secondary" onClick={() => setEditing(null)}>取消</button></div></div> : <><div className="list-heading"><div><strong>{entry.title}</strong><small>第 {entry.day} 天{entry.nodeId ? ` · 地点 ${entry.nodeId}` : ''}{entry.sourceCharId ? ` · 来自 ${props.save.world.characters[entry.sourceCharId]?.name ?? entry.sourceCharId}` : ''}</small></div><div className="button-row"><button onClick={() => beginEdit(entry)}>编辑</button><button className="danger" onClick={() => props.onDelete(entry.id)}>删除</button></div></div>{entry.description && <p>{entry.description}</p>}{entry.tags.length > 0 && <div className="tag-row">{entry.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}</div>}</>}</div>)}</div></div></details>;
}

function StorySceneLibraryView(props: { save: SaveFile; storyScenePresets: StoryScenePreset[]; onSavePreset: (source: StoryScenePreset, name: string) => Promise<void>; onUpdatePreset: (preset: StoryScenePreset) => Promise<void>; onDeletePreset: (id: string) => Promise<void>; onCreateDraft: (input: StorySceneDraftInput) => void; onEditDraft: (sceneId: string, input: StorySceneDraftInput) => void; onDeleteDraft: (sceneId: string) => void; onConfirmDraft: (sceneId: string) => void; onAdvanceStage: (sceneId: string) => void; onSetStatus: (sceneId: string, status: 'completed' | 'cancelled') => void; onReadStage: (sceneId: string, stageId: string) => void; onSelectStage: (sceneId: string, stageId: string) => void }) {
  const scenes = props.save.world.storyScenes ?? [];
  const presets = props.storyScenePresets;
  const characters = Object.values(props.save.world.characters);
  const nodes = Object.values(props.save.world.map.nodes);
  const [intent, setIntent] = useState('');
  const [outline, setOutline] = useState('');
  const [sceneId, setSceneId] = useState('');
  const [participantIds, setParticipantIds] = useState<string[]>(characters.slice(0, 2).map((character) => character.id));
  const [nodeId, setNodeId] = useState(props.save.world.player.nodeId);
  const [startDay, setStartDay] = useState(String(props.save.world.clock.day));
  const [startSlotId, setStartSlotId] = useState(props.save.world.clock.slotId);
  const [presetId, setPresetId] = useState(presets[0]?.id ?? '');
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0];
  const toggleParticipant = (id: string, checked: boolean) => setParticipantIds((current) => checked ? [...current, id] : current.filter((entry) => entry !== id));
  const submit = () => {
    try {
      const generated = generateStorySceneDraftInput({ id: sceneId.trim() || slug(intent), intent, detailedOutline: outline, participantIds, participantNames: participantIds.map((id) => props.save.world.characters[id]?.name ?? id), nodeId, nodeName: props.save.world.map.nodes[nodeId]?.name ?? nodeId, startDay: Number(startDay), startSlotId, preset: selectedPreset });
      props.onCreateDraft(generated);
    } catch (error) { window.alert(error instanceof Error ? error.message : 'StoryScene 草案生成失败。'); }
  };
  return <details className="fold-card story-scene-library"><summary>多人群像剧情</summary><div className="fold-body"><StoryScenePresetManager presets={presets} onSave={props.onSavePreset} onUpdate={props.onUpdatePreset} onDelete={props.onDeletePreset} /><div className="list-card"><p className="io-scope">StoryScene 是独立的多人群像剧情模式；以下表单只生成本地可编辑草案，不调用 API，也不会直接推进世界事实。</p><div className="story-scene-create-form"><div className="field-with-action"><label>剧情意图<input value={intent} onChange={(event) => setIntent(event.target.value)} placeholder="例如：寻找失踪的信件" /></label><label>草案 ID<input value={sceneId} onChange={(event) => setSceneId(event.target.value)} placeholder="留空则按意图生成" /></label></div><label>详细大纲（可选）<textarea value={outline} onChange={(event) => setOutline(event.target.value)} placeholder="留空则使用本地预设生成三幕静态内容" /></label><div className="field-with-action"><label>地点<select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>{nodes.map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label><label>开始日期<input type="number" min={props.save.world.clock.day} value={startDay} onChange={(event) => setStartDay(event.target.value)} /></label><label>开始时段<select value={startSlotId} onChange={(event) => setStartSlotId(event.target.value)}>{props.save.config.calendar.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label><label>本地预设<select value={presetId} onChange={(event) => setPresetId(event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label></div><div><span className="field-label">参与者</span><div className="checkbox-grid">{characters.map((character) => <label className="checkbox-line" key={character.id}><input type="checkbox" checked={participantIds.includes(character.id)} onChange={(event) => toggleParticipant(character.id, event.target.checked)} />{character.name}</label>)}</div></div><button type="button" onClick={submit} disabled={!intent.trim() || participantIds.length === 0 || !nodeId}>生成本地草案</button></div></div>{scenes.length === 0 ? <p className="empty">暂无群像剧情。创建并确认 StoryScene 后，会在这里恢复阅读。</p> : scenes.map((scene) => scene.status === 'draft' ? <StorySceneDraftRow key={scene.id} scene={scene} save={props.save} onEdit={props.onEditDraft} onDelete={props.onDeleteDraft} onConfirm={props.onConfirmDraft} /> : <StorySceneReader key={scene.id} scene={scene} onAdvanceStage={() => props.onAdvanceStage(scene.id)} onSetStatus={(status) => props.onSetStatus(scene.id, status)} onReadStage={(stageId) => props.onReadStage(scene.id, stageId)} onSelectStage={(stageId) => props.onSelectStage(scene.id, stageId)} />)}</div></details>;
}

function StoryScenePresetManager(props: { presets: StoryScenePreset[]; onSave: (source: StoryScenePreset, name: string) => Promise<void>; onUpdate: (preset: StoryScenePreset) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState(props.presets[0]?.id ?? '');
  const [editing, setEditing] = useState<StoryScenePreset | null>(null);
  const [copyName, setCopyName] = useState('');
  const selected = props.presets.find((preset) => preset.id === selectedId) ?? props.presets[0];
  const beginEdit = (preset: StoryScenePreset) => setEditing(structuredClone(preset));
  const updateStage = (index: number, patch: Partial<StoryScenePreset['stages'][number]>) => {
    if (!editing) return;
    setEditing({ ...editing, stages: editing.stages.map((stage, stageIndex) => stageIndex === index ? { ...stage, ...patch } : stage) });
  };
  return <details className="fold-card story-scene-presets"><summary>剧情预设</summary><div className="fold-body"><div className="list-card"><p className="io-scope">内置预设只读；复制后可编辑并保存在浏览器本地。</p><label>当前预设<select value={selected?.id ?? ''} onChange={(event) => setSelectedId(event.target.value)}>{props.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}{preset.builtin ? ' · 内置' : ' · 我的'}</option>)}</select></label><div className="button-row"><input placeholder="复制后的预设名称" value={copyName} onChange={(event) => setCopyName(event.target.value)} /><button type="button" disabled={!selected || !copyName.trim()} onClick={() => { if (selected) void props.onSave(selected, copyName.trim()); setCopyName(''); }}>{'复制为本地预设'}</button>{selected && !selected.builtin && <><button type="button" onClick={() => beginEdit(selected)}>编辑</button><button type="button" className="danger" onClick={() => void props.onDelete(selected.id)}>删除</button></>}</div>{editing && <div className="story-scene-preset-editor"><label>名称<input value={editing.name} onChange={(event) => setEditing({ ...editing, name: event.target.value })} /></label><label>标题模板<input value={editing.titleTemplate} onChange={(event) => setEditing({ ...editing, titleTemplate: event.target.value })} /></label><label>大纲模板<textarea value={editing.outlineTemplate} onChange={(event) => setEditing({ ...editing, outlineTemplate: event.target.value })} /></label><div className="story-scene-preset-stages"><strong>阶段模板</strong>{editing.stages.map((stage, index) => <div className="story-scene-preset-stage" key={stage.id}><label>阶段标题<input value={stage.title} onChange={(event) => updateStage(index, { title: event.target.value })} /></label><label>内容模板<textarea value={stage.contentTemplate} onChange={(event) => updateStage(index, { contentTemplate: event.target.value })} /></label></div>)}</div><div className="button-row"><button type="button" onClick={() => { void props.onUpdate(editing); setEditing(null); }}>保存编辑</button><button type="button" className="secondary" onClick={() => setEditing(null)}>取消</button></div></div>}</div></div></details>;
}

function StorySceneDraftRow(props: { scene: SaveFile['world']['storyScenes'][number]; save: SaveFile; onEdit: (sceneId: string, input: StorySceneDraftInput) => void; onDelete: (sceneId: string) => void; onConfirm: (sceneId: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(props.scene.title);
  const [intent, setIntent] = useState(props.scene.intent);
  const [outline, setOutline] = useState(props.scene.outline);
  const [nodeId, setNodeId] = useState(props.scene.nodeId);
  const [startDay, setStartDay] = useState(String(props.scene.startDay));
  const [startSlotId, setStartSlotId] = useState(props.scene.startSlotId);
  const [participantIds, setParticipantIds] = useState<string[]>([...props.scene.participantIds]);
  const toggle = (id: string, checked: boolean) => setParticipantIds((current) => checked ? [...current, id] : current.filter((entry) => entry !== id));
  if (!editing) return <div className="story-scene-draft-row" key={props.scene.id}><div><strong>{props.scene.title}</strong><small>草案 · 尚未确认启动 · {props.scene.participantIds.length} 位参与者</small></div><div className="button-row"><button type="button" onClick={() => setEditing(true)}>编辑</button><button type="button" className="danger" onClick={() => props.onDelete(props.scene.id)}>删除</button><button type="button" onClick={() => props.onConfirm(props.scene.id)}>确认启动</button></div></div>;
  return <div className="story-scene-draft-editor"><div className="field-with-action"><label>标题<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>剧情意图<input value={intent} onChange={(event) => setIntent(event.target.value)} /></label></div><label>大纲<textarea value={outline} onChange={(event) => setOutline(event.target.value)} /></label><div className="field-with-action"><label>地点<select value={nodeId} onChange={(event) => setNodeId(event.target.value)}>{Object.values(props.save.world.map.nodes).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label><label>开始日期<input type="number" min={props.save.world.clock.day} value={startDay} onChange={(event) => setStartDay(event.target.value)} /></label><label>开始时段<select value={startSlotId} onChange={(event) => setStartSlotId(event.target.value)}>{props.save.config.calendar.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.label}</option>)}</select></label></div><div className="checkbox-grid">{Object.values(props.save.world.characters).map((character) => <label className="checkbox-line" key={character.id}><input type="checkbox" checked={participantIds.includes(character.id)} onChange={(event) => toggle(character.id, event.target.checked)} />{character.name}</label>)}</div><div className="button-row"><button type="button" onClick={() => { props.onEdit(props.scene.id, { id: props.scene.id, title, intent, outline, participantIds, nodeId, startDay: Number(startDay), startSlotId, stages: props.scene.stages, currentStageId: props.scene.currentStageId, source: props.scene.source }); setEditing(false); }}>保存编辑</button><button type="button" className="secondary" onClick={() => setEditing(false)}>取消</button></div></div>;
}

function ContactAvatar({ name, avatar }: { name: string; avatar?: AssetRef }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined;
    if (avatar?.kind === 'url') { setSrc(avatar.url); return () => undefined; }
    if (avatar?.kind === 'stored') {
      void loadAsset(avatar.assetId).then((asset) => {
        if (!asset) return;
        objectUrl = URL.createObjectURL(asset.blob);
        setSrc(objectUrl);
      });
    } else setSrc(undefined);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [avatar]);
  return src ? <img className="contact-avatar" src={src} alt="" /> : <span className="contact-avatar contact-avatar-fallback" aria-hidden="true">{Array.from(name.trim())[0] ?? '?'}</span>;
}

function ContactsView(props: { save: SaveFile; onRequestFriend: (characterId: string, direction: ContactDirection) => void; onResolveFriend: (requestId: string, action: 'accept' | 'reject' | 'revoke') => void; onOpenMessage: (characterId: string) => void; onPromoteNpc: (characterId: string, draft: NpcPromotionDraft) => Promise<boolean>; onExpandNpcPromotionDraft: (characterId: string, draft: NpcPromotionDraft) => Promise<NpcPromotionDraft | undefined> }) {
  const candidates = listContactCandidates(props.save.world, props.save.world.clock.day, props.save.world.clock.slotId, props.save.config.calendar.daysPerWeek);
  const [preferences, setPreferences] = useState(readContactGroupPreferences);
  const [collapsed, setCollapsed] = useState(readContactGroupCollapsed);
  const [newGroupName, setNewGroupName] = useState('');
  const [promotionId, setPromotionId] = useState<string | null>(null);
  const [promotionDraft, setPromotionDraft] = useState<NpcPromotionDraft | null>(null);
  const [promotionBusy, setPromotionBusy] = useState(false);
  useEffect(() => { writeContactGroupPreferences(preferences); }, [preferences]);
  useEffect(() => { writeContactGroupCollapsed(collapsed); }, [collapsed]);
  const pendingIncoming = candidates.filter((candidate) => candidate.request?.direction === 'incoming' && candidate.request.status === 'pending');
  const accepted = candidates.filter((candidate) => candidate.request?.status === 'accepted');
  const available = candidates.filter((candidate) => !candidate.request);
  const history = candidates.filter((candidate) => candidate.request && ['rejected', 'revoked'].includes(candidate.request.status));
  const locationText = (candidate: (typeof candidates)[number]) => candidate.location ? `${candidate.location.nodeName} · ${candidate.location.activity}` : '当前没有公开地点';
  const toggleGroup = (id: string) => setCollapsed((current) => ({ ...current, [id]: !current[id] }));
  const openPromotion = (candidateId: string) => {
    const npc = props.save.world.npcs[candidateId];
    if (!npc) return;
    setPromotionId(candidateId);
    setPromotionDraft(createNpcPromotionDraft(npc));
  };
  const updatePromotionDraft = (field: keyof NpcPromotionDraft, value: string) => setPromotionDraft((current) => current ? { ...current, [field]: value } : current);
  const card = (candidate: (typeof candidates)[number], groupId: string) => <article className="contact-card" key={candidate.id} data-character-id={candidate.id}><ContactAvatar name={candidate.name} avatar={candidate.avatar} /><div className="contact-card-main"><div className="contact-name-line"><strong>{candidate.name}</strong><span className="contact-summary">{candidate.summary}</span></div><small>{candidate.tier === 'formal' ? '正式角色' : '半正式角色 / NPC'} · {locationText(candidate)}</small></div><div className="contact-card-actions">{candidate.tier === 'semi' && <button type="button" onClick={() => openPromotion(candidate.id)}>转正</button>}{!candidate.request && <><button type="button" onClick={() => props.onRequestFriend(candidate.id, 'outgoing')}>我加TA</button><button type="button" className="secondary" onClick={() => props.onRequestFriend(candidate.id, 'incoming')}>TA加我</button></>}{candidate.request?.status === 'pending' && candidate.request.direction === 'incoming' && <><button type="button" onClick={() => props.onResolveFriend(candidate.request!.id, 'accept')}>接受</button><button type="button" className="secondary" onClick={() => props.onResolveFriend(candidate.request!.id, 'reject')}>拒绝</button></>}{candidate.request?.status === 'accepted' && <><select aria-label={`移动${candidate.name}到分组`} value={preferences.assignments[candidate.id] ?? ''} onChange={(event) => setPreferences((current) => ({ ...current, assignments: { ...current.assignments, ...(event.target.value ? { [candidate.id]: event.target.value } : Object.fromEntries(Object.entries(current.assignments).filter(([id]) => id !== candidate.id))) } }))}><option value="">好友</option>{preferences.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><button type="button" className="terminal-small-icon-button secondary" aria-label={`给${candidate.name}发消息`} title="发消息" onClick={() => props.onOpenMessage(candidate.id)}><MessageCircle aria-hidden="true" /></button></>}</div></article>;
  const section = (id: string, title: string, items: typeof candidates, empty: string, customGroup?: ContactCustomGroup) => <section className={`contacts-section ${collapsed[id] ? 'collapsed' : ''}`}><div className="contact-group-heading"><button type="button" className="contact-group-toggle" aria-expanded={!collapsed[id]} onClick={() => toggleGroup(id)}><span aria-hidden="true">{collapsed[id] ? '▸' : '▾'}</span><strong>{title}</strong><small>{items.length}</small></button>{customGroup && <span className="contact-group-actions"><button type="button" aria-label={`重命名${title}`} onClick={() => { const nextName = window.prompt('分组名称', title)?.trim(); if (nextName) setPreferences((current) => ({ ...current, groups: current.groups.map((group) => group.id === id ? { ...group, name: nextName.slice(0, 24) } : group) })); }}>编辑</button><button type="button" className="danger" aria-label={`删除${title}`} onClick={() => { if (!window.confirm(`删除分组“${title}”？成员将回到好友。`)) return; setPreferences((current) => ({ groups: current.groups.filter((group) => group.id !== id), assignments: Object.fromEntries(Object.entries(current.assignments).filter(([, groupId]) => groupId !== id)) })); }}>删除</button></span>}</div>{!collapsed[id] && (items.length ? items.map((candidate) => card(candidate, id)) : <p className="empty">{empty}</p>)}</section>;
  const assignedIds = new Set(Object.keys(preferences.assignments));
  const customSections = preferences.groups.map((group) => section(group.id, group.name, accepted.filter((candidate) => preferences.assignments[candidate.id] === group.id), '还没有分组联系人。', group));
  const promotionNpc = promotionId ? props.save.world.npcs[promotionId] : undefined;
  const schedule = promotionNpc ? summarizeNpcSchedule(promotionNpc, props.save.world.map.nodes, props.save.config.calendar) : [];
  return <div className="contacts-view" data-testid="terminal-contacts"><div className="contact-group-create"><input aria-label="新建联系人分组" placeholder="新分组名称" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} /><button type="button" onClick={() => { const name = newGroupName.trim(); if (!name) return; const group: ContactCustomGroup = { id: `custom-${Date.now()}`, name: name.slice(0, 24) }; setPreferences((current) => ({ groups: [...current.groups, group], assignments: current.assignments })); setNewGroupName(''); }}>新建分组</button></div>{section('new', '新朋友', available, '暂无新朋友。')}{section('pending', '待处理', pendingIncoming, '暂无待处理申请。')}{customSections}{section('friends', '好友', accepted.filter((candidate) => !assignedIds.has(candidate.id)), '还没有已通过的好友。')}{section('history', '历史申请', history, '暂无历史申请。')}{promotionNpc && promotionDraft && <div className="npc-promotion-panel" role="dialog" aria-label={`转正${promotionNpc.name}`}><div className="section-heading"><div><span className="eyebrow">角色转正草案</span><h3>{promotionNpc.name}</h3></div><button type="button" className="secondary" onClick={() => { setPromotionId(null); setPromotionDraft(null); }}>关闭</button></div><div className="npc-promotion-facts"><p><strong>稳定 ID：</strong>{promotionNpc.id}</p><p><strong>事实：</strong>{promotionNpc.facts.length ? promotionNpc.facts.join('；') : '暂无'}</p><p><strong>标签：</strong>{promotionNpc.tags.length ? promotionNpc.tags.join('、') : '暂无'}</p><p><strong>轻记忆：</strong>{promotionNpc.lightMemory.length ? promotionNpc.lightMemory.join('；') : '暂无'}</p><p><strong>头像：</strong>{promotionNpc.visuals?.avatar ? '已有头像' : '暂无头像'} · <strong>住所：</strong>{promotionNpc.homeNodeId ? props.save.world.map.nodes[promotionNpc.homeNodeId]?.name ?? promotionNpc.homeNodeId : '未设置'}</p><p><strong>日程：</strong>{schedule.length ? schedule.join('；') : '暂无固定日程'}</p></div><div className="npc-promotion-fields"><label>角色简介<textarea value={promotionDraft.description} onChange={(event) => updatePromotionDraft('description', event.target.value)} /></label><label>性格<textarea value={promotionDraft.personality} onChange={(event) => updatePromotionDraft('personality', event.target.value)} /></label><label>当前处境<textarea value={promotionDraft.scenario} onChange={(event) => updatePromotionDraft('scenario', event.target.value)} /></label><label>初次完整对话开场<textarea value={promotionDraft.firstMes} onChange={(event) => updatePromotionDraft('firstMes', event.target.value)} /></label><label>示例台词<textarea value={promotionDraft.exampleDialogue} onChange={(event) => updatePromotionDraft('exampleDialogue', event.target.value)} /></label></div><div className="button-row"><button type="button" disabled={promotionBusy || !promotionDraft.description.trim() || !promotionDraft.personality.trim()} onClick={() => { setPromotionBusy(true); void props.onExpandNpcPromotionDraft(promotionNpc.id, promotionDraft).then((expanded) => { if (expanded) setPromotionDraft(expanded); }).finally(() => setPromotionBusy(false)); }}>{promotionBusy ? '生成中…' : 'AI 扩写草稿'}</button><button type="button" disabled={promotionBusy || !promotionDraft.description.trim() || !promotionDraft.personality.trim()} onClick={() => { if (!window.confirm(`确认将${promotionNpc.name}转为正式角色？此操作不会推进时间或剧情。`)) return; void props.onPromoteNpc(promotionNpc.id, promotionDraft).then((ok) => { if (ok) { setPromotionId(null); setPromotionDraft(null); } }); }}>确认转正</button><button type="button" className="secondary" disabled={promotionBusy} onClick={() => { setPromotionId(null); setPromotionDraft(null); }}>取消</button></div></div>}</div>;
}

function TerminalAssetImage({ asset, alt = '贴图' }: { asset?: AssetRef; alt?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let objectUrl: string | undefined;
    if (asset?.kind === 'url') { setSrc(asset.url); return () => undefined; }
    if (asset?.kind === 'stored') void loadAsset(asset.assetId).then((stored) => { if (stored) { objectUrl = URL.createObjectURL(stored.blob); setSrc(objectUrl); } });
    else setSrc(undefined);
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset]);
  return src ? <img className="terminal-sticker" src={src} alt={alt} /> : <span className="terminal-sticker-missing">贴图不可用</span>;
}

function ChatCgImage({ attachment }: { attachment: ChatCgAttachment }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSrc(undefined);
    if (attachment.asset.kind === 'url') { setSrc(attachment.asset.url); return () => undefined; }
    void loadAsset(attachment.asset.assetId).then((stored) => {
      if (!stored || cancelled) return;
      objectUrl = URL.createObjectURL(stored.blob);
      setSrc(objectUrl);
    });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.asset]);
  return src
    ? <figure className="chat-cg-attachment"><img src={src} alt="聊天 CG" /><figcaption>{attachment.includesPlayer ? '用户与角色互动 CG' : '角色场景 CG'}</figcaption></figure>
    : <div className="chat-cg-missing">CG 图片不可用，文字记录仍保留。</div>;
}

function TerminalVoiceAudio({ asset, durationMs }: { asset?: AssetRef; durationMs?: number }) {
  const [src, setSrc] = useState<string>();
  const [stored, setStored] = useState<Awaited<ReturnType<typeof loadAsset>>>();
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setSrc(undefined);
    setStored(undefined);
    if (asset?.kind === 'stored') void loadAsset(asset.assetId).then((loaded) => { if (loaded && !cancelled) { objectUrl = URL.createObjectURL(loaded.blob); setStored(loaded); setSrc(objectUrl); } });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [asset]);
  const download = () => {
    if (!stored) return;
    const extension = stored.audioFormat || stored.mimeType.split('/')[1]?.replace('mpeg', 'mp3') || 'audio';
    const url = URL.createObjectURL(stored.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `tokimeki-voice.${extension}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return src ? <div className="terminal-voice"><audio controls preload="metadata" src={src} /><small>{durationMs ? `${(durationMs / 1000).toFixed(1)} 秒` : '语音消息'}</small><button type="button" className="terminal-small-icon-button secondary" aria-label="下载语音" title="下载语音" onClick={download}><Download aria-hidden="true" /></button></div> : <span className="terminal-sticker-missing">语音不可用</span>;
}

function TerminalMessagesView(props: {
  save: SaveFile;
  onOpenContacts: () => void;
  onSendText: (characterId: string, text: string, quoteMessageId?: string) => void;
  onSendStickerAsset: (characterId: string, asset: AssetRef, quoteMessageId?: string) => void;
  stickers: TerminalStickerRecord[];
  onImportStickerFile: (file?: File) => Promise<void>;
  onImportStickerUrl: (url: string) => Promise<void>;
  onDeleteSticker: (record: TerminalStickerRecord) => Promise<void>;
  onRejoin: (characterId: string, requirement: string) => void;
  onEditMessage: (characterId: string, messageId: string, text: string) => void;
  onDeleteMessage: (characterId: string, messageId: string) => void;
  onGenerateReply: (characterId: string) => Promise<void>;
  onGenerateVoice: (characterId: string, messageId: string, requestId?: string) => Promise<void>;
  onDownloadVoice: (characterId: string, messageId: string) => Promise<void>;
  voiceAvailable: (characterId: string) => boolean;
  voiceBusy: boolean;
  onSendPlayerTransfer: (characterId: string, currencyId: string, amount: number) => void;
  onResolveIncomingTransfer: (requestId: string, action: TransferAction) => void;
  onCreateTerminalAppointment: (characterId: string, input: TerminalAppointmentInput) => void;
  onSimulateIncomingAppointment: (characterId: string, input: TerminalAppointmentInput) => void;
  onResolveTerminalAppointment: (requestId: string, action: TerminalAppointmentAction) => void;
  onSimulateAppointmentAcceptance: (requestId: string) => void;
  onConfirmTerminalAppointment: (requestId: string) => void;
  terminalBusy: boolean;
}) {
  const candidates = listContactCandidates(props.save.world, props.save.world.clock.day, props.save.world.clock.slotId, props.save.config.calendar.daysPerWeek)
    .filter((candidate) => candidate.request?.status === 'accepted');
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const recentThreads = listTerminalMessageThreads(props.save.world, props.save.config.calendar.slots.map((slot) => slot.id))
    .filter((summary) => candidateIds.has(summary.characterId));
  const currencies = Object.values(props.save.world.economy.currencies);
  const [selectedId, setSelectedId] = useState(readTerminalSelectedContact);
  const [draft, setDraft] = useState(() => readTerminalDraft(readTerminalSelectedContact()));
  const [stickerUrl, setStickerUrl] = useState('');
  const [rejoinRequirement, setRejoinRequirement] = useState('');
  const [stickerMenuId, setStickerMenuId] = useState<string | null>(null);
  const stickerPressTimerRef = useRef<number | null>(null);
  const stickerLongPressRef = useRef(false);
  const [quoteId, setQuoteId] = useState<string>();
  const [activePanel, setActivePanel] = useState<'stickers' | 'more' | null>(null);
  const [moreTool, setMoreTool] = useState<'transfer' | 'appointment' | 'rejoin' | null>(null);
  const [currencyId, setCurrencyId] = useState(props.save.world.economy.defaultCurrencyId);
  const [transferAmount, setTransferAmount] = useState('');
  const [appointmentDay, setAppointmentDay] = useState(String(props.save.world.clock.day + 1));
  const [appointmentSlotId, setAppointmentSlotId] = useState(props.save.config.calendar.slots[0]?.id ?? '');
  const [appointmentNodeId, setAppointmentNodeId] = useState(props.save.world.player.nodeId);
  const [appointmentNote, setAppointmentNote] = useState('');
  const [messageMenuId, setMessageMenuId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const messagePressTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (selectedId && !candidateIds.has(selectedId)) {
      setSelectedId('');
      setDraft('');
      writeTerminalSelectedContact('');
    }
  }, [selectedId, candidates.map((candidate) => candidate.id).join('\u0001')]);
  useEffect(() => { if (!currencies.some((currency) => currency.id === currencyId)) setCurrencyId(currencies[0]?.id ?? ''); }, [currencies, currencyId]);
  useEffect(() => { if (!props.save.config.calendar.slots.some((slot) => slot.id === appointmentSlotId)) setAppointmentSlotId(props.save.config.calendar.slots[0]?.id ?? ''); }, [appointmentSlotId, props.save.config.calendar.slots]);
  useEffect(() => { if (!props.save.world.map.nodes[appointmentNodeId]) setAppointmentNodeId(props.save.world.player.nodeId); }, [appointmentNodeId, props.save.world.map.nodes, props.save.world.player.nodeId]);

  const openThread = (characterId: string) => {
    setSelectedId(characterId);
    setDraft(readTerminalDraft(characterId));
    writeTerminalSelectedContact(characterId);
    setQuoteId(undefined);
    setActivePanel(null);
  };
  const closeThread = () => {
    setSelectedId('');
    setDraft('');
    writeTerminalSelectedContact('');
    setQuoteId(undefined);
    setActivePanel(null);
  };
  const selected = candidates.find((candidate) => candidate.id === selectedId);
  const messages = selected ? listTerminalMessages(props.save.world, selected.id) : [];
  const transfers = selected ? listTerminalTransfers(props.save.world, selected.id) : [];
  const pendingIncoming = transfers.filter((request) => request.direction === 'incoming' && request.status === 'pending');
  const transferHistory = transfers.filter((request) => request.direction === 'outgoing' || request.status !== 'pending').slice().reverse();
  const appointmentRequests = selected ? listTerminalAppointmentRequests(props.save.world, selected.id).slice().reverse() : [];
  const appointmentInput = (): TerminalAppointmentInput => ({ day: Number(appointmentDay), slotId: appointmentSlotId, nodeId: appointmentNodeId, ...(appointmentNote.trim() ? { note: appointmentNote.trim() } : {}) });
  const currency = props.save.world.economy.currencies[currencyId];
  const balance = currency ? props.save.world.player.stats[currency.statKey] ?? 0 : 0;
  const sendText = () => {
    if (!selected || !draft.trim()) return;
    props.onSendText(selected.id, draft, quoteId);
    setDraft('');
    writeTerminalDraft(selected.id, '');
    setQuoteId(undefined);
  };
  const clearMessagePress = () => { if (messagePressTimerRef.current !== null) { window.clearTimeout(messagePressTimerRef.current); messagePressTimerRef.current = null; } };
  const openMessageMenu = (messageId: string) => { clearMessagePress(); setMessageMenuId(messageId); setEditingMessageId(null); };
  const beginMessagePress = (messageId: string) => { clearMessagePress(); messagePressTimerRef.current = window.setTimeout(() => openMessageMenu(messageId), 500); };
  const startMessageEdit = (message: (typeof messages)[number]) => { setEditingMessageId(message.id); setEditingMessageText(message.text ?? ''); setMessageMenuId(null); };
  const cancelMessageMenu = () => { setMessageMenuId(null); setEditingMessageId(null); setEditingMessageText(''); };
  useEffect(() => () => clearMessagePress(), []);
  useEffect(() => () => { if (stickerPressTimerRef.current !== null) window.clearTimeout(stickerPressTimerRef.current); }, []);
  const messagePreview = (message: (typeof recentThreads)[number]['lastMessage']) => {
    if (message.text?.trim()) return message.text.trim();
    if (message.type === 'sticker') return '[表情]';
    if (message.type === 'voice') return '[语音]';
    if (message.type === 'transfer') return '[转账]';
    return '[系统消息]';
  };
  const transferLabel = (request: (typeof transfers)[number]) => {
    const requestCurrency = props.save.world.economy.currencies[request.currencyId];
    const amount = requestCurrency ? formatCurrency(request.amount, requestCurrency) : `${request.amount} ${request.currencyId}`;
    const direction = request.direction === 'outgoing' ? `我转给${selected?.name ?? '对方'}` : `${selected?.name ?? '对方'}转给我`;
    const status = request.status === 'pending' ? '待收款' : request.status === 'accepted' ? '已完成' : '已拒绝';
    return `${direction} · ${amount} · ${status}`;
  };

  if (!selected) {
    return <div className="terminal-conversation-list" data-testid="terminal-message-list">
      {recentThreads.length ? recentThreads.map((summary) => {
        const candidate = candidates.find((item) => item.id === summary.characterId);
        if (!candidate) return null;
        return <button type="button" className="terminal-conversation-row" key={summary.characterId} onClick={() => openThread(summary.characterId)}>
          <ContactAvatar name={candidate.name} avatar={candidate.avatar} />
          <span className="terminal-conversation-copy"><strong>{candidate.name}</strong><small>{messagePreview(summary.lastMessage)}</small></span>
          <time>第 {summary.lastMessage.createdDay} 天</time>
        </button>;
      }) : <div className="terminal-messages-empty"><EmptyState>还没有最近聊天。可以先从联系人中选择好友并发送第一条消息。</EmptyState><button type="button" onClick={props.onOpenContacts}>前往联系人</button></div>}
    </div>;
  }

  return <div className="terminal-messages-view terminal-thread-view" data-testid="terminal-messages">
    <header className="terminal-thread-header">
      <button type="button" className="terminal-small-icon-button secondary" aria-label="返回最近聊天" title="返回" onClick={closeThread}><ArrowLeft aria-hidden="true" /></button>
      <div><strong>{selected.name}</strong></div>
      <button type="button" className="terminal-small-icon-button secondary" aria-label="打开更多功能" title="更多" aria-expanded={activePanel === 'more'} onClick={() => setActivePanel((current) => current === 'more' ? null : 'more')}><Plus aria-hidden="true" /></button>
    </header>
    <div className="terminal-thread" aria-live="polite">
      {messages.length === 0 ? <p className="empty">还没有消息，发出第一句吧。</p> : messages.map((message) => {
        const mine = message.senderId === TERMINAL_PLAYER_ID;
        const body = message.type === 'sticker'
          ? <TerminalAssetImage asset={message.asset} />
          : message.type === 'voice'
            ? <><TerminalVoiceAudio asset={message.asset} durationMs={message.durationMs} />{message.text && <p className="terminal-voice-transcript">{message.text}</p>}</>
            : message.type === 'text'
              ? <>{(message.asset || message.voiceRequestId) && <TerminalVoiceAudio asset={message.asset} durationMs={message.durationMs} />}<p>{message.text}</p></>
              : <p>{message.text ?? (message.type === 'transfer' ? '[转账]' : '[系统消息]')}</p>;
        return <div className={`terminal-message-row ${mine ? 'mine' : 'theirs'}`} key={message.id}
          onPointerDown={() => beginMessagePress(message.id)}
          onPointerUp={clearMessagePress}
          onPointerCancel={clearMessagePress}
          onPointerLeave={clearMessagePress}
          onContextMenu={(event) => { event.preventDefault(); openMessageMenu(message.id); }}>
          {!mine && <ContactAvatar name={selected.name} avatar={selected.avatar} />}
          <article className="terminal-message">
            {message.quoteMessageId && <button type="button" className="terminal-quote" onClick={() => setQuoteId(message.quoteMessageId)}>引用：{message.quotePreview}</button>}
            {body}
            <div className="terminal-message-actions" onPointerDown={(event) => event.stopPropagation()}>
              {messageMenuId === message.id && !editingMessageId && <div className="terminal-message-menu" role="menu">
                <button type="button" aria-label="引用这条消息" onClick={() => { setQuoteId(message.id); cancelMessageMenu(); }}><Reply aria-hidden="true" /><span>引用</span></button>
                {!mine && message.type === 'text' && message.text?.trim() && <button type="button" onClick={() => { void props.onGenerateVoice(selected.id, message.id, message.asset ? undefined : message.voiceRequestId); cancelMessageMenu(); }} disabled={props.voiceBusy || !props.voiceAvailable(selected.id)} title={props.voiceAvailable(selected.id) ? undefined : '请先设置语音 API'}>{props.voiceAvailable(selected.id) ? (message.voiceRequestId ? '重新生成语音' : '生成语音') : '前往设置语音 API'}</button>}
                {message.asset && (message.type === 'voice' || message.voiceRequestId) && <button type="button" onClick={() => { void props.onDownloadVoice(selected.id, message.id); cancelMessageMenu(); }}><Download aria-hidden="true" /><span>下载语音</span></button>}
                <button type="button" onClick={() => startMessageEdit(message)} disabled={props.voiceBusy}>编辑</button>
                <button type="button" className="danger" disabled={props.voiceBusy} onClick={() => { if (window.confirm('删除这条消息？')) { props.onDeleteMessage(selected.id, message.id); cancelMessageMenu(); } }}>删除</button>
                <button type="button" className="secondary" onClick={cancelMessageMenu}>取消</button>
              </div>}
              {editingMessageId === message.id && <div className="terminal-message-edit">
                <textarea aria-label="编辑消息" value={editingMessageText} onChange={(event) => setEditingMessageText(event.target.value)} autoFocus />
                <div className="button-row"><button type="button" onClick={() => { props.onEditMessage(selected.id, message.id, editingMessageText); cancelMessageMenu(); }} disabled={!editingMessageText.trim()}>保存</button><button type="button" className="secondary" onClick={cancelMessageMenu}>取消</button></div>
              </div>}
            </div>
          </article>
          {mine && <ContactAvatar name={props.save.world.player.name} />}
        </div>;
      })}
    </div>
    {quoteId && <div className="terminal-quote-draft">引用：{messages.find((message) => message.id === quoteId)?.text ?? messages.find((message) => message.id === quoteId)?.quotePreview ?? '表情'}<button type="button" className="secondary" onClick={() => setQuoteId(undefined)}>取消引用</button></div>}
    {activePanel === 'stickers' && <section className="terminal-inline-panel terminal-sticker-library" aria-label="表情包图库">
      <div className="terminal-sticker-import-row"><label className="file-button">导入图片<input type="file" accept="image/*" onChange={(event) => { void props.onImportStickerFile(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label><input aria-label="贴图外链" placeholder="图片外链 URL" value={stickerUrl} onChange={(event) => setStickerUrl(event.target.value)} /><button type="button" className="secondary" onClick={() => { void props.onImportStickerUrl(stickerUrl); setStickerUrl(''); }} disabled={!stickerUrl.trim()}>加入图库</button></div>
      {props.stickers.length === 0 ? <p className="empty">图库还是空的，请先导入图片。</p> : <div className="terminal-sticker-grid">{props.stickers.map((sticker) => <button type="button" className="terminal-sticker-entry" key={sticker.id} onClick={() => { if (stickerLongPressRef.current) { stickerLongPressRef.current = false; return; } props.onSendStickerAsset(selected.id, sticker.asset, quoteId); setQuoteId(undefined); setActivePanel(null); }} onPointerDown={() => { stickerLongPressRef.current = false; if (stickerPressTimerRef.current !== null) window.clearTimeout(stickerPressTimerRef.current); stickerPressTimerRef.current = window.setTimeout(() => { stickerLongPressRef.current = true; setStickerMenuId(sticker.id); }, 500); }} onPointerUp={() => { if (stickerPressTimerRef.current !== null) window.clearTimeout(stickerPressTimerRef.current); stickerPressTimerRef.current = null; }} onPointerCancel={() => { if (stickerPressTimerRef.current !== null) window.clearTimeout(stickerPressTimerRef.current); stickerPressTimerRef.current = null; }}><TerminalAssetImage asset={sticker.asset} alt={sticker.label ?? '表情包'} />{stickerMenuId === sticker.id && <span className="terminal-sticker-delete" onClick={(event) => { event.stopPropagation(); if (window.confirm('删除这个表情包？')) void props.onDeleteSticker(sticker); setStickerMenuId(null); stickerLongPressRef.current = false; }}>删除</span>}</button>)}</div>}
    </section>}
    {activePanel === 'more' && <section className="terminal-more-panel" aria-label="更多功能">
      <div className="terminal-more-actions" role="toolbar" aria-label="终端辅助功能">
        <button type="button" className={`terminal-small-icon-button ${moreTool === 'transfer' ? '' : 'secondary'}`} aria-label="转账" title="转账" aria-pressed={moreTool === 'transfer'} onClick={() => setMoreTool((current) => current === 'transfer' ? null : 'transfer')}><ReceiptText aria-hidden="true" /></button>
        <button type="button" className={`terminal-small-icon-button ${moreTool === 'appointment' ? '' : 'secondary'}`} aria-label="远程约定" title="远程约定" aria-pressed={moreTool === 'appointment'} onClick={() => setMoreTool((current) => current === 'appointment' ? null : 'appointment')}><CalendarDays aria-hidden="true" /></button>
        <button type="button" className={`terminal-small-icon-button ${moreTool === 'rejoin' ? '' : 'secondary'}`} aria-label="重回" title="重回" aria-pressed={moreTool === 'rejoin'} onClick={() => setMoreTool((current) => current === 'rejoin' ? null : 'rejoin')}><RotateCcw aria-hidden="true" /></button>
      </div>
      {moreTool === 'transfer' && <>
      <section className="terminal-transfer-panel" aria-label="转账">
        <div className="section-heading"><h3>转账</h3>{currency && <span>余额 {formatCurrency(balance, currency)}</span>}</div>
        <div className="terminal-transfer-form">
          <select aria-label="转账货币" value={currencyId} onChange={(event) => setCurrencyId(event.target.value)}>{currencies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
          <input aria-label="转账金额" inputMode="decimal" placeholder="金额" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} />
          <button type="button" onClick={() => { const amount = Number(transferAmount); if (window.confirm(`确认转给${selected.name} ${currency ? formatCurrency(amount, currency) : transferAmount}？`)) props.onSendPlayerTransfer(selected.id, currencyId, amount); }} disabled={!currency || !transferAmount.trim()}>转账</button>
        </div>
        {pendingIncoming.length > 0 && <div className="terminal-transfer-list"><h4>待收款</h4>{pendingIncoming.map((request) => <div className="terminal-transfer-row" key={request.id}><span>{transferLabel(request)}</span><div className="button-row"><button type="button" onClick={() => props.onResolveIncomingTransfer(request.id, 'accept')}>接受</button><button type="button" className="secondary" onClick={() => props.onResolveIncomingTransfer(request.id, 'reject')}>拒绝</button></div></div>)}</div>}
        {transferHistory.length > 0 && <div className="terminal-transfer-list"><h4>转账记录</h4>{transferHistory.map((request) => <div className="terminal-transfer-row" key={request.id}><span>{transferLabel(request)}</span><small>第 {request.updatedDay} 天</small></div>)}</div>}
      </section>
      </>}
      {moreTool === 'appointment' && <>
      <section className="terminal-appointment-panel" aria-label="远程约定">
        <div className="section-heading"><h3>远程约定</h3><span>先确认，再写入日历</span></div>
        <div className="terminal-appointment-form">
          <label>日期<input type="number" min={props.save.world.clock.day + 1} value={appointmentDay} onChange={(event) => setAppointmentDay(event.target.value)} /></label>
          <label>时段<select value={appointmentSlotId} onChange={(event) => setAppointmentSlotId(event.target.value)}>{props.save.config.calendar.slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}</select></label>
          <label>地点<select value={appointmentNodeId} onChange={(event) => setAppointmentNodeId(event.target.value)}>{Object.values(props.save.world.map.nodes).map((node) => <option key={node.id} value={node.id}>{node.name}</option>)}</select></label>
          <label>备注<input value={appointmentNote} maxLength={200} onChange={(event) => setAppointmentNote(event.target.value)} placeholder="可选" /></label>
          <div className="button-row"><button type="button" onClick={() => { props.onCreateTerminalAppointment(selected.id, appointmentInput()); setAppointmentNote(''); }}>发起约定</button><button type="button" className="secondary" onClick={() => props.onSimulateIncomingAppointment(selected.id, appointmentInput())}>模拟TA提议</button></div>
        </div>
        {appointmentRequests.length > 0 && <div className="terminal-appointment-list">{appointmentRequests.map((request) => { const appointmentId = `terminal-appointment-${request.id}`; const inCalendar = props.save.world.appointments.some((appointment) => appointment.id === appointmentId); const status = inCalendar ? '已加入日历' : request.status === 'pending' ? '待确认' : request.status === 'accepted' ? '已同意' : request.status === 'rejected' ? '已拒绝' : '已撤回'; return <div className="terminal-appointment-row" key={request.id}><span><strong>{request.direction === 'outgoing' ? '我发起' : 'TA发起'} · 第 {request.day} 天 · {props.save.config.calendar.slots.find((slot) => slot.id === request.slotId)?.name ?? request.slotId}</strong><small>{props.save.world.map.nodes[request.nodeId]?.name ?? request.nodeId}{request.note ? ` · ${request.note}` : ''} · {status}</small></span><div className="button-row">{request.status === 'pending' && request.direction === 'outgoing' && <><button type="button" onClick={() => props.onSimulateAppointmentAcceptance(request.id)}>模拟TA同意</button><button type="button" className="secondary" onClick={() => props.onResolveTerminalAppointment(request.id, 'revoke')}>撤回</button></>}{request.status === 'pending' && request.direction === 'incoming' && <><button type="button" onClick={() => props.onResolveTerminalAppointment(request.id, 'accept')}>接受</button><button type="button" className="secondary" onClick={() => props.onResolveTerminalAppointment(request.id, 'reject')}>拒绝</button></>}{request.status === 'accepted' && !inCalendar && <button type="button" onClick={() => props.onConfirmTerminalAppointment(request.id)}>加入日历</button>}</div></div>; })}</div>}
      </section>
      </>}
      {moreTool === 'rejoin' && <section className="terminal-rejoin-panel" aria-label="重回"><h3>重回</h3><textarea aria-label="重回要求" placeholder="可以留空，也可以写下希望如何重新联系" value={rejoinRequirement} onChange={(event) => setRejoinRequirement(event.target.value)} /><button type="button" onClick={() => { props.onRejoin(selected.id, rejoinRequirement); setRejoinRequirement(''); setActivePanel(null); setMoreTool(null); }}>发送重回请求</button></section>}
    </section>}
    <div className="terminal-composer">
      <button type="button" className="terminal-small-icon-button secondary" aria-label="打开表情包" title="表情" aria-expanded={activePanel === 'stickers'} onClick={() => setActivePanel((current) => current === 'stickers' ? null : 'stickers')}><Smile aria-hidden="true" /></button>
      <textarea aria-label="终端消息" placeholder="输入消息" rows={1} value={draft} onChange={(event) => { setDraft(event.target.value); writeTerminalDraft(selected.id, event.target.value); }} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendText(); } }} />
      <button type="button" className="terminal-small-icon-button" aria-label="发送消息" title="发送" onClick={sendText} disabled={!draft.trim()}><Send aria-hidden="true" /></button>
      <button type="button" className="terminal-small-icon-button secondary" aria-label="生成回复" title="生成回复" onClick={() => void props.onGenerateReply(selected.id)} disabled={props.terminalBusy || messages.every((message) => message.senderId !== TERMINAL_PLAYER_ID)}><Sparkles aria-hidden="true" /></button>
      <button type="button" className="terminal-small-icon-button secondary" aria-label="打开更多功能" title="更多" aria-expanded={activePanel === 'more'} onClick={() => setActivePanel((current) => current === 'more' ? null : 'more')}><Plus aria-hidden="true" /></button>
    </div>
  </div>;
}
function TerminalCallsView(props: { save: SaveFile; activeCall: TerminalCallSession | null; onStartCall: (characterId: string) => void; onSimulateIncomingCall: (characterId: string) => void; onAnswerCall: () => void; onSimulateCallAnswer: () => void; onEndCall: () => void }) {
  const candidates = listContactCandidates(props.save.world, props.save.world.clock.day, props.save.world.clock.slotId, props.save.config.calendar.daysPerWeek).filter((candidate) => candidate.request?.status === 'accepted');
  const records = listTerminalCalls(props.save.world).slice().reverse();
  const allCandidates = listContactCandidates(props.save.world, props.save.world.clock.day, props.save.world.clock.slotId, props.save.config.calendar.daysPerWeek);
  const activeCandidate = props.activeCall ? candidates.find((candidate) => candidate.id === props.activeCall!.characterId) : undefined;
  const [historyCollapsed, setHistoryCollapsed] = useState(() => readCallHistoryCollapsed());
  useEffect(() => { writeCallHistoryCollapsed(historyCollapsed); }, [historyCollapsed]);
  const statusLabel = (status: TerminalCallStatus) => status === 'completed' ? '已结束' : status === 'missed' ? '未接来电' : '已取消';
  const locationLabel = (candidate: (typeof candidates)[number]) => candidate.location ? `${candidate.location.nodeName} · ${candidate.location.activity}` : '暂无地点';
  const tierLabel = (candidate: (typeof candidates)[number]) => candidate.tier === 'formal' ? '正式角色' : '半正式角色 / NPC';
  const callAction = (label: string, icon: ReactNode, onClick: () => void, disabled = false, className = '') => <button type="button" className={`terminal-small-icon-button ${className}`.trim()} aria-label={label} title={label} onClick={onClick} disabled={disabled}>{icon}</button>;
  return <div className="terminal-calls-view" data-testid="terminal-calls">
    {props.activeCall && activeCandidate && <section className="terminal-call-active"><div className="terminal-call-person"><ContactAvatar name={activeCandidate.name} avatar={activeCandidate.avatar} /><div className="terminal-call-person-info"><div className="terminal-call-name-line"><strong>{activeCandidate.name}</strong><span>{props.activeCall.direction === 'incoming' ? props.activeCall.state === 'active' ? '通话中' : '来电' : props.activeCall.state === 'active' ? '通话中' : '呼叫中'}</span></div><small>{tierLabel(activeCandidate)} · {locationLabel(activeCandidate)}</small></div></div><div className="terminal-call-actions" role="toolbar" aria-label="当前通话操作">{props.activeCall.state === 'ringing' && props.activeCall.direction === 'incoming' && callAction('接听', <Check aria-hidden="true" />, props.onAnswerCall)}{props.activeCall.state === 'ringing' && props.activeCall.direction === 'outgoing' && callAction('模拟TA接听', <Check aria-hidden="true" />, props.onSimulateCallAnswer)}{props.activeCall.state === 'ringing' && props.activeCall.direction === 'incoming' ? callAction('拒绝', <X aria-hidden="true" />, props.onEndCall, false, 'secondary') : props.activeCall.state === 'active' ? callAction('结束通话', <PhoneOff aria-hidden="true" />, props.onEndCall, false, 'secondary') : callAction('取消', <PhoneOff aria-hidden="true" />, props.onEndCall, false, 'secondary')}</div></section>}
    <section className="terminal-call-contacts"><div className="section-heading"><h3>联系人</h3><span>{candidates.length}</span></div>{candidates.length ? candidates.map((candidate) => <article className="terminal-call-contact" key={candidate.id}><ContactAvatar name={candidate.name} avatar={candidate.avatar} /><div className="terminal-call-contact-main"><div className="terminal-call-name-line"><strong>{candidate.name}</strong><span className="terminal-call-summary">{candidate.summary}</span></div><small>{tierLabel(candidate)} · {locationLabel(candidate)}</small></div><div className="terminal-call-actions" role="toolbar" aria-label={`${candidate.name}通话操作`}>{callAction('呼叫', <Phone aria-hidden="true" />, () => props.onStartCall(candidate.id), Boolean(props.activeCall))}{callAction('让TA来电', <PhoneIncoming aria-hidden="true" />, () => props.onSimulateIncomingCall(candidate.id), Boolean(props.activeCall), 'secondary')}</div></article>) : <p className="empty">暂无已接受好友。</p>}</section>
    <section className="terminal-call-history"><button type="button" className="terminal-call-history-heading" aria-expanded={!historyCollapsed} onClick={() => setHistoryCollapsed((collapsed) => !collapsed)}><span><strong>通话记录</strong><small>{records.length} 条记录</small></span>{historyCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}</button>{!historyCollapsed && (records.length ? <div className="terminal-call-history-list">{records.map((record) => { const candidate = allCandidates.find((item) => item.id === record.characterId); return <div className="terminal-call-record" key={record.id}><ContactAvatar name={candidate?.name ?? record.characterId} avatar={candidate?.avatar} /><div className="terminal-call-record-main"><strong>{candidate?.name ?? record.characterId}</strong><small>{statusLabel(record.status)} · D{record.startedDay} · {record.startedSlotId}</small></div></div>; })}</div> : <p className="empty">暂无通话记录。</p>)}</section>
  </div>;
}

function EventPackageView(props: { save: SaveFile; onExport: () => Promise<void>; onImport: (file?: File) => Promise<void> }) {
  const eventCount = Object.keys(props.save.world.eventDefs ?? {}).length;
  return <div className="library-subpage-content"><section className="library-legacy-content"><div className="section-heading"><div><span className="eyebrow">本地资料</span><h2>事件包</h2></div></div><div className="list-card"><div className="list-heading"><div><h3>可复用事件定义</h3><p className="io-scope">事件包用于分享或备份触发规则，不是事件回顾。导入只安装定义，不会立即触发事件，也不会调用 API。</p></div><div className="package-help-heading-actions"><span className="io-scope">当前 {eventCount} 个事件</span><PackageHelpButton kind="event" /></div></div><div className="button-row"><button type="button" onClick={() => void props.onExport()} disabled={eventCount === 0}>导出当前事件包</button><label className="file-button">导入事件包<input type="file" accept=".zip" onChange={(event) => void props.onImport(event.target.files?.[0])} /></label></div>{eventCount === 0 ? <p className="empty">当前世界还没有事件定义。</p> : <div className="event-package-list">{Object.values(props.save.world.eventDefs).map((event) => <div className="list-row" key={event.id}><span><strong>{event.title}</strong><small>{event.id} · {event.trigger.nodeIds?.length ? `${event.trigger.nodeIds.length} 个地点` : '未限定地点'}{event.once ? ' · 一次性' : ''}</small></span></div>)}</div>}</div></section></div>;
}
function LibraryView(props: { appName: string; characters: CharacterCard[]; worldbooks: WorldbookEntry[]; providers: ProviderConfig[]; ttsConfigs: TtsConfig[]; characterBindings: CharacterProviderBinding[]; onCharacterProviderBindingChange: (characterId: string, kind: 'provider' | 'tts', providerId: string) => Promise<void>; presets: Preset[]; presetBundles: PresetBundle[]; selectedPresetBundleId: string; setSelectedPresetBundleId: (value: string) => void; presetBundleName: string; setPresetBundleName: (value: string) => void; onCreatePresetBundle: () => Promise<void>; onRenamePresetBundle: () => Promise<void>; onDeletePresetBundle: (id: string) => Promise<void>; onSetPresetEntryEnabled: (bundleId: string, entryId: string, enabled: boolean) => Promise<void>; onMovePresetEntry: (bundleId: string, entryId: string, direction: -1 | 1) => Promise<void>; save: SaveFile; name: string; setName: (value: string) => void; draftText: string; setDraftText: (value: string) => void; editing: { kind: ContentKind; id: string } | null; setEditing: (editing: { kind: ContentKind; id: string } | null) => void; addContent: (kind: ContentKind) => Promise<void>; onDelete: (kind: ContentKind, id: string) => Promise<void>; onExport: (kind: ContentKind, value: unknown, name: string) => void; onImport: (kind: ContentKind, file?: File) => Promise<void>; onImportText: (kind: TextImportKind, file?: File) => Promise<void>; onExportSave: () => Promise<void>; onImportSave: (file?: File) => Promise<void>; onExportPresetBundle: () => Promise<void>; onImportPresetBundle: (file?: File) => Promise<void>; includeChatsOnExport: boolean; setIncludeChatsOnExport: (value: boolean) => void; onClearChats: () => Promise<void>; itemName: string; setItemName: (value: string) => void; itemTags: string; setItemTags: (value: string) => void; itemDescription: string; setItemDescription: (value: string) => void; onAddItem: () => void; onAddCharacterToWorld: (id: string) => void; onExportCharacterPackage: (id: string, includeImages: boolean) => Promise<void>; onImportCharacterPackage: (file?: File, addToWorld?: boolean) => Promise<void>; onExportWorldPackage: (includeImages: boolean) => Promise<void>; onImportWorldPackage: (file?: File) => Promise<void>; onExportEventPackage: () => Promise<void>; onImportEventPackage: (file?: File) => Promise<void>; visualCharacterId: string; setVisualCharacterId: (value: string) => void; onImportCharacterVisual: (characterId: string, kind: 'avatar' | 'portrait', source?: File | string) => Promise<void>; onRemoveCharacterVisual: (characterId: string, kind: 'avatar' | 'portrait') => Promise<void>; onUpdateCharacterAccentColor: (characterId: string, color?: string) => void; onOpenImageSettings: () => void; onRequestFriend: (characterId: string, direction: ContactDirection) => void; onResolveFriend: (requestId: string, action: 'accept' | 'reject' | 'revoke') => void; onPromoteNpc: (characterId: string, draft: NpcPromotionDraft) => Promise<boolean>; onExpandNpcPromotionDraft: (characterId: string, draft: NpcPromotionDraft) => Promise<NpcPromotionDraft | undefined>; onSendTerminalText: (characterId: string, text: string, quoteMessageId?: string) => void; onSendTerminalStickerUrl: (characterId: string, url: string, quoteMessageId?: string) => void; onSendTerminalStickerFile: (characterId: string, file?: File, quoteMessageId?: string) => Promise<void>; onSendStickerAsset: (characterId: string, asset: AssetRef, quoteMessageId?: string) => void; stickers: TerminalStickerRecord[]; onImportStickerFile: (file?: File) => Promise<void>; onImportStickerUrl: (url: string) => Promise<void>; onDeleteSticker: (record: TerminalStickerRecord) => Promise<void>; onRejoin: (characterId: string, requirement: string) => void; onEditTerminalMessage: (characterId: string, messageId: string, text: string) => void; onDeleteTerminalMessage: (characterId: string, messageId: string) => void; onGenerateTerminalReply: (characterId: string) => Promise<void>; onSendVoice: (characterId: string, messageId: string, requestId?: string) => Promise<void>; onDownloadVoice: (characterId: string, messageId: string) => Promise<void>; isVoiceAvailable: (characterId: string) => boolean; ttsConfig: TtsConfig; ttsBusy: boolean; onSendPlayerTransfer: (characterId: string, currencyId: string, amount: number) => void; onResolveIncomingTransfer: (requestId: string, action: TransferAction) => void; onCreateTerminalAppointment: (characterId: string, input: TerminalAppointmentInput) => void; onSimulateIncomingAppointment: (characterId: string, input: TerminalAppointmentInput) => void; onResolveTerminalAppointment: (requestId: string, action: TerminalAppointmentAction) => void; onSimulateAppointmentAcceptance: (requestId: string) => void; onConfirmTerminalAppointment: (requestId: string) => void; terminalCall: TerminalCallSession | null; onStartCall: (characterId: string) => void; onSimulateIncomingCall: (characterId: string) => void; onAnswerCall: () => void; onSimulateCallAnswer: () => void; onEndCall: () => void; terminalBusy: boolean; musicPlayer: MusicPlayerController; selectedPresetId?: string; setSelectedPresetId?: (value: string) => void }) {
  const navigation = useContext(LibraryNavigationContext);
  const entries: readonly (DesktopEntry & { id: LibraryPage; pageTitle: string })[] = [...LIBRARY_PAGE_DEFINITIONS, { id: 'event-packages', label: '事件包', pageTitle: '事件包', icon: FileArchive, tone: 'gray' }];
  const pageTitle = entries.find((entry) => entry.id === navigation.activePage)?.pageTitle ?? '终端';
  if (!navigation.activePage) return <DesktopLauncher launcherId="terminal" title="终端" appName={props.appName} entries={entries} onOpen={(id) => navigation.onOpenPage(id as LibraryPage)} />;
  if (navigation.activePage === 'contacts') return <SubpageShell eyebrow="终端" title={pageTitle} pageId={navigation.activePage} onBack={navigation.onBack}><ContactsView save={props.save} onRequestFriend={props.onRequestFriend} onResolveFriend={props.onResolveFriend} onOpenMessage={(characterId) => { writeTerminalSelectedContact(characterId); navigation.onOpenPage('messages'); }} onPromoteNpc={props.onPromoteNpc} onExpandNpcPromotionDraft={props.onExpandNpcPromotionDraft} /></SubpageShell>;
  if (navigation.activePage === 'messages') return <SubpageShell eyebrow="终端" title={pageTitle} pageId={navigation.activePage} onBack={navigation.onBack}><TerminalMessagesView save={props.save} onOpenContacts={() => navigation.onOpenPage('contacts')} onSendText={props.onSendTerminalText} onSendStickerAsset={props.onSendStickerAsset} stickers={props.stickers} onImportStickerFile={props.onImportStickerFile} onImportStickerUrl={props.onImportStickerUrl} onDeleteSticker={props.onDeleteSticker} onRejoin={props.onRejoin} onEditMessage={props.onEditTerminalMessage} onDeleteMessage={props.onDeleteTerminalMessage} onGenerateReply={props.onGenerateTerminalReply} onGenerateVoice={props.onSendVoice} onDownloadVoice={props.onDownloadVoice} voiceAvailable={props.isVoiceAvailable} voiceBusy={props.ttsBusy} onSendPlayerTransfer={props.onSendPlayerTransfer} onResolveIncomingTransfer={props.onResolveIncomingTransfer} onCreateTerminalAppointment={props.onCreateTerminalAppointment} onSimulateIncomingAppointment={props.onSimulateIncomingAppointment} onResolveTerminalAppointment={props.onResolveTerminalAppointment} onSimulateAppointmentAcceptance={props.onSimulateAppointmentAcceptance} onConfirmTerminalAppointment={props.onConfirmTerminalAppointment} terminalBusy={props.terminalBusy} /></SubpageShell>;
  if (navigation.activePage === 'calls') return <SubpageShell eyebrow="终端" title={pageTitle} pageId={navigation.activePage} onBack={navigation.onBack}><TerminalCallsView save={props.save} activeCall={props.terminalCall} onStartCall={props.onStartCall} onSimulateIncomingCall={props.onSimulateIncomingCall} onAnswerCall={props.onAnswerCall} onSimulateCallAnswer={props.onSimulateCallAnswer} onEndCall={props.onEndCall} /></SubpageShell>;
  if (navigation.activePage === 'music') return <SubpageShell eyebrow="终端" title={pageTitle} pageId={navigation.activePage} onBack={navigation.onBack}><MusicApp player={props.musicPlayer} /></SubpageShell>;
  if (navigation.activePage === 'event-packages') return <SubpageShell eyebrow="终端" title="事件包" pageId="event-packages" onBack={navigation.onBack}><EventPackageView save={props.save} onExport={props.onExportEventPackage} onImport={props.onImportEventPackage} /></SubpageShell>;
  const worldCharacters = Object.values(props.save.world.characters);
  const selectedWorldCharacter = worldCharacters.find((character) => character.id === props.visualCharacterId) ?? worldCharacters[0];
  const selectedCharacterBinding = props.characterBindings.find((item) => item.saveId === props.save.meta.id && item.characterId === selectedWorldCharacter?.id);
  const missingCharacterProvider = selectedCharacterBinding?.providerId && !props.providers.some((item) => item.id === selectedCharacterBinding.providerId);
  const missingCharacterTtsProvider = selectedCharacterBinding?.ttsProviderId && !props.ttsConfigs.some((item) => item.id === selectedCharacterBinding.ttsProviderId);
  return <SubpageShell eyebrow="终端" title={pageTitle} pageId={navigation.activePage} onBack={navigation.onBack}><div className="library-subpage-content" data-page={navigation.activePage}><section className="library-legacy-content"><div className="section-heading"><div><span className="eyebrow">本地资料</span><h2>角色与资料</h2></div></div><div className="editor-card"><input placeholder="名称" value={props.name} onChange={(event) => props.setName(event.target.value)} /><textarea placeholder="描述或内容" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} /><div className="button-row"><button onClick={() => void props.addContent('character')}>保存角色卡</button><button onClick={() => void props.addContent('worldbook')}>保存世界书</button><button onClick={() => void props.addContent('preset')}>添加预设条目</button><label className="file-button">导入角色 TXT / DOCX<input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void props.onImportText('character', event.target.files?.[0])} /></label><label className="file-button">导入世界书 TXT / DOCX<input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void props.onImportText('worldbook', event.target.files?.[0])} /></label><label className="file-button">导入预设 TXT / DOCX<input type="file" accept=".txt,.docx,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void props.onImportText('preset', event.target.files?.[0])} /></label></div></div><ContentList title="角色卡" kind="character" items={props.characters.map((item) => ({ ...item, text: item.description }))} onEdit={(kind, item) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); }} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><div className="list-card character-package-card"><div className="list-heading"><div><h3>角色包</h3><p className="io-scope">角色包不包含当前世界住所和日程；图片可选择一并打包，API key 与 Provider 配置永不导出。</p></div></div>{worldCharacters.length ? <div className="character-package-export"><label className="checkbox-line"><input type="checkbox" defaultChecked aria-label="角色包包含本地图片" id="character-package-images" />含本地图片</label><button type="button" onClick={() => void props.onExportCharacterPackage(worldCharacters[0].id, Boolean((document.getElementById("character-package-images") as HTMLInputElement | null)?.checked))}>导出当前角色包</button></div> : <p className="empty">当前世界还没有正式角色可导出。</p>}<div className="button-row"><label className="file-button">导入到角色库<input type="file" accept=".zip" onChange={(event) => void props.onImportCharacterPackage(event.target.files?.[0], false)} /></label><label className="file-button">导入并加入当前世界<input type="file" accept=".zip" onChange={(event) => void props.onImportCharacterPackage(event.target.files?.[0], true)} /></label></div></div><div className="list-card world-package-card"><div className="list-heading"><div><h3>世界包</h3><p className="io-scope">仅包含可复用地图、角色、NPC、物品、事件定义和资料；不包含当前游玩进度。</p></div></div><div className="button-row"><label className="checkbox-line"><input type="checkbox" defaultChecked aria-label="世界包包含本地图片" id="world-package-images" />含本地图片</label><button type="button" onClick={() => void props.onExportWorldPackage(Boolean((document.getElementById("world-package-images") as HTMLInputElement | null)?.checked))}>导出当前世界包</button><label className="file-button">导入并合并世界包<input type="file" accept=".zip" onChange={(event) => void props.onImportWorldPackage(event.target.files?.[0])} /></label></div></div><div className="list-card event-package-card"><div className="list-heading"><div><h3>事件包</h3><p className="io-scope">只导入/导出事件定义；导入前会检查地图节点、角色、关系阶段和条件语法，不会自动排程或触发。</p></div></div><div className="button-row"><button type="button" onClick={() => void props.onExportEventPackage()} disabled={Object.keys(props.save.world.eventDefs ?? {}).length === 0}>导出当前事件包</button><label className="file-button">导入事件包<input type="file" accept=".zip" onChange={(event) => void props.onImportEventPackage(event.target.files?.[0])} /></label></div></div><div className="list-card character-visual-card"><div className="list-heading"><div><h3>当前世界角色形象</h3><p className="io-scope">角色卡保存文字；头像和立绘保存到当前世界角色实例。</p></div></div>{worldCharacters.length ? <><select aria-label="选择世界角色" value={selectedWorldCharacter?.id ?? ''} onChange={(event) => props.setVisualCharacterId(event.target.value)}>{worldCharacters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select><div className="visual-asset-summary"><span>头像：{selectedWorldCharacter?.visuals.avatar ? '已配置' : '未配置'}</span><span>立绘：{selectedWorldCharacter?.visuals.portraits.length ? '已配置' : '未配置'}</span></div><div className="character-provider-bindings">{(missingCharacterProvider || missingCharacterTtsProvider) && <p className="io-scope" role="alert">当前角色绑定的 Provider 配置不存在，已回退到默认配置，请重新选择。</p>}<label>角色普通 Provider<select aria-label="角色普通 Provider" value={selectedCharacterBinding?.providerId ?? ''} onChange={(event) => selectedWorldCharacter && void props.onCharacterProviderBindingChange(selectedWorldCharacter.id, 'provider', event.target.value)}><option value="">使用任务默认 Provider</option>{props.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>角色语音 Provider<select aria-label="角色语音 Provider" value={selectedCharacterBinding?.ttsProviderId ?? ''} onChange={(event) => selectedWorldCharacter && void props.onCharacterProviderBindingChange(selectedWorldCharacter.id, 'tts', event.target.value)}><option value="">使用全局默认语音</option>{props.ttsConfigs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="button-row"><button type="button" className="secondary" onClick={props.onOpenImageSettings}>前往图像生成</button><label className="file-button">上传头像<input type="file" accept="image/*" onChange={(event) => void props.onImportCharacterVisual(selectedWorldCharacter!.id, 'avatar', event.target.files?.[0])} /></label>{selectedWorldCharacter?.visuals.avatar && <button type="button" className="danger" onClick={() => void props.onRemoveCharacterVisual(selectedWorldCharacter!.id, 'avatar')}>移除头像</button>}<label className="file-button">替换立绘<input type="file" accept="image/*" onChange={(event) => void props.onImportCharacterVisual(selectedWorldCharacter!.id, 'portrait', event.target.files?.[0])} /></label>{selectedWorldCharacter?.visuals.portraits.length ? <button type="button" className="danger" onClick={() => void props.onRemoveCharacterVisual(selectedWorldCharacter!.id, 'portrait')}>移除立绘</button> : null}</div><div className="visual-url-editors"><ImageUrlInput label="保存头像外链" onApply={(url) => props.onImportCharacterVisual(selectedWorldCharacter!.id, 'avatar', url)} /><ImageUrlInput label="保存立绘外链" onApply={(url) => props.onImportCharacterVisual(selectedWorldCharacter!.id, 'portrait', url)} /></div></> : <p className="empty">当前世界还没有正式角色。请先在角色卡列表中点击“加入当前地点”。</p>}</div><ContentList title="世界书" kind="worldbook" items={props.worldbooks.map((item) => ({ ...item, text: item.content }))} onEdit={(kind, item) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); }} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><PresetBundleView presetBundles={props.presetBundles} selectedPresetBundleId={props.selectedPresetBundleId} setSelectedPresetBundleId={props.setSelectedPresetBundleId} setPresetBundleName={props.setPresetBundleName} presetBundleName={props.presetBundleName} onCreatePresetBundle={props.onCreatePresetBundle} onRenamePresetBundle={props.onRenamePresetBundle} onDeletePresetBundle={props.onDeletePresetBundle} onSetPresetEntryEnabled={props.onSetPresetEntryEnabled} onMovePresetEntry={props.onMovePresetEntry} onExportPresetBundle={props.onExportPresetBundle} onImportPresetBundle={props.onImportPresetBundle} onEditPreset={(entry) => { props.setEditing({ kind: 'preset', id: entry.id }); props.setName(entry.name); props.setDraftText(entry.systemPrompt); }} onDeletePreset={(id) => props.onDelete('preset', id)} onExportPreset={(entry) => props.onExport('preset', entry, entry.name)} /><details className="fold-card"><summary>物品栏</summary><div className="fold-body"><div className="list-card"><h3>物品栏</h3>{props.save.world.player.inventory.length === 0 ? <p className="empty">暂无物品</p> : props.save.world.player.inventory.map((entry) => <div className="list-row" key={`${entry.itemId}-${entry.gotDay}`}><span>{props.save.world.items[entry.itemId]?.name ?? entry.itemId}</span><span>x{entry.count}</span></div>)}</div></div></details><div className="io-card"><div><strong>世界存档</strong><p className="io-scope">包含资料和可选聊天；不包含 Provider 配置与 API key。</p><label className="checkbox-line"><input type="checkbox" checked={props.includeChatsOnExport} onChange={(event) => props.setIncludeChatsOnExport(event.target.checked)} />包含聊天记录</label></div><button onClick={() => void props.onExportSave()}>导出世界存档</button><label className="file-button">导入世界存档<input type="file" accept=".zip" onChange={(event) => void props.onImportSave(event.target.files?.[0])} /></label><button className="danger" onClick={() => void props.onClearChats()}>清除全部聊天</button></div></section></div></SubpageShell>;
  const edit = (kind: ContentKind, item: { id: string; name: string; text: string }) => { props.setEditing({ kind, id: item.id }); props.setName(item.name); props.setDraftText(item.text); };
  const inventory = props.save.world.player.inventory;
  const characterNames = new Map(props.characters.map((character) => [character.id, character.name]));
  // @ts-ignore Legacy unreachable markup is retained temporarily for migration compatibility.
  return <section><div className="section-heading"><div><span className="eyebrow">本地资料</span><h2>角色 / 世界书 / 预设</h2></div></div><div className="editor-card"><input placeholder="名称" value={props.name} onChange={(event) => props.setName(event.target.value)} /><textarea placeholder="描述或内容" value={props.draftText} onChange={(event) => props.setDraftText(event.target.value)} /><div className="button-row"><button onClick={() => void props.addContent('character')}>保存角色卡</button><button onClick={() => void props.addContent('worldbook')}>保存世界书</button><button onClick={() => void props.addContent('preset')}>保存预设</button></div></div><div className="list-card"><div className="list-heading"><h3>物品定义</h3></div><div className="editor-card"><input placeholder="物品名称" value={props.itemName} onChange={(event) => props.setItemName(event.target.value)} /><input placeholder="标签，用逗号分隔" value={props.itemTags} onChange={(event) => props.setItemTags(event.target.value)} /><textarea placeholder="物品描述" value={props.itemDescription} onChange={(event) => props.setItemDescription(event.target.value)} /><button onClick={props.onAddItem}>保存物品定义</button></div>{Object.values(props.save.world.items).map((item) => <div className="list-row" key={item.id}><span>{item.name}<small>{item.id} · {item.tags.join(', ')}</small></span></div>)}</div><div className="list-card"><div className="list-heading"><h3>物品栏（当前世界状态）</h3></div><p className="io-scope">这里显示内核实际持有的数量；每条记录都保留获得时的来源。</p>{inventory.length === 0 ? <p className="empty">暂无物品</p> : inventory.map((entry, index) => <div className="list-row" key={`${entry.itemId}-${entry.gotDay}-${index}`}><span>{props.save.world.items[entry.itemId]?.name ?? entry.itemId}<small>来源：{entry.fromCharId ? characterNames.get(entry.fromCharId) ?? entry.fromCharId : '世界/系统'} · 第 {entry.gotDay} 天{entry.gotNodeId ? ` · 地点 ${entry.gotNodeId}` : ''}</small></span><span>x{entry.count}</span></div>)}</div><div className="list-card memory-library-card"><div className="list-heading"><div><h3>记忆库</h3><p className="io-scope">这里的记忆会在未来对话中作为角色上下文使用；删除后不会改写历史对话。</p></div></div>{Object.values(props.save.world.characters).map((character) => { const memories = props.save.world.relations[character.id]?.memories ?? []; return <details className="memory-character" key={character.id}><summary>{character.name} · {memories.length} 条记忆</summary><div className="memory-list">{memories.length === 0 ? <p className="empty">暂无长期记忆。</p> : memories.map((memory) => <div className="list-row" key={memory.id}><span>{memory.text}<small>第 {memory.day} 天{memory.nodeId ? ` · 地点 ${memory.nodeId}` : ''}</small></span><button className="danger" onClick={() => void props.onDelete('memory', `${character.id}:${memory.id}`)}>删除</button></div>)}</div></details>; })}</div><ContentList title="角色卡" kind="character" items={props.characters.map((item) => ({ ...item, text: item.description }))} onEdit={edit} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} onAction={props.onAddCharacterToWorld} actionLabel="加入当前地点" /><ContentList title="世界书" kind="worldbook" items={props.worldbooks.map((item) => ({ ...item, text: item.content }))} onEdit={edit} onDelete={props.onDelete} onExport={props.onExport} onImport={props.onImport} /><div className="list-card"><div className="list-heading"><h3>预设选项</h3><div className="button-row"><button className="secondary" onClick={() => void props.onExportPresetBundle()} disabled={props.presets.length === 0}>导出全部预设</button><label className="file-button">导入预设包<input type="file" accept=".zip" onChange={(event) => void props.onImportPresetBundle(event.target.files?.[0])} /></label></div></div><label>当前文风/提示词预设<select value={props.selectedPresetId} onChange={(event) => props.setSelectedPresetId(event.target.value)}><option value="">不使用预设</option>{props.presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><p className="io-scope">预设包将多个文风/提示词预设作为独立选项保存；切换后下一次生成回复使用所选预设。</p>{props.presets.length === 0 ? <p className="empty">暂无内容</p> : props.presets.map((item) => <div className="list-row" key={item.id}><span>{item.name}</span><span className="button-row"><button onClick={() => props.onExport('preset', item, item.name)}>导出单项</button></span></div>)}</div><div className="io-card"><div><strong>世界存档</strong><p className="io-scope">包含角色卡、世界书、预设和可选聊天；不包含 Provider 配置与 API key。</p><label className="checkbox-line"><input type="checkbox" checked={props.includeChatsOnExport} onChange={(event) => props.setIncludeChatsOnExport(event.target.checked)} />包含聊天记录</label></div><button onClick={() => void props.onExportSave()}>导出世界存档</button><label className="file-button">导入世界存档<input type="file" accept=".zip" onChange={(event) => void props.onImportSave(event.target.files?.[0])} /></label><button className="danger" onClick={() => void props.onClearChats()}>清除全部聊天</button></div></section>;
}

function ContentList(props: { title: string; kind: ContentKind; items: Array<{ id: string; name: string; text: string }>; onEdit: (kind: ContentKind, item: { id: string; name: string; text: string }) => void; onDelete: (kind: ContentKind, id: string) => Promise<void>; onExport: (kind: ContentKind, value: unknown, name: string) => void; onImport: (kind: ContentKind, file?: File) => Promise<void>; onImportText?: (kind: TextImportKind, file?: File) => Promise<void>; onAction?: (id: string) => void; actionLabel?: string }) {
  return <details className="fold-card"><summary>{props.title}</summary><div className="fold-body"><div className="list-card"><div className="list-heading"><h3>{props.title}</h3><label className="file-button">导入<input type="file" accept=".json" onChange={(event) => void props.onImport(props.kind, event.target.files?.[0])} /></label></div>{props.items.length === 0 ? <p className="empty">暂无内容</p> : props.items.map((item) => <div className="list-row" key={item.id}><span>{item.name}</span><span className="button-row">{props.onAction && <button className="secondary" onClick={() => props.onAction?.(item.id)}>{props.actionLabel ?? '应用'}</button>}<button onClick={() => props.onEdit(props.kind, item)}>编辑</button><button onClick={() => props.onExport(props.kind, item, item.name)}>导出</button><button onClick={() => void props.onDelete(props.kind, item.id)}>删除</button></span></div>)}</div></div></details>;
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
