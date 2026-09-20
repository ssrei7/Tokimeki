import Dexie, { type Table } from 'dexie';
import { CharacterCardSchema, ChatRecordSchema, ChatRecoveryRecordSchema, MemoryVectorRecordSchema, MusicStateSchema, PersonaSchema, PresetBundleSchema, PresetSchema, StoryScenePresetSchema, TerminalStickerRecordSchema, WorldbookEntrySchema, normalizeChatMessages, type CharacterCard, type ChatRecord, type ChatRecoveryRecord, type MemoryVectorRecord, type MusicState, type Persona, type Preset, type PresetBundle, type StoryScenePresetRecord, type TerminalStickerRecord, type WorldbookEntry } from '../content';
import { WorkshopBindingSchema, WorkshopLocalStateSchema, WorkshopPackageRecordSchema, workshopBindingId, type WorkshopBinding, type WorkshopLocalState, type WorkshopPackageRecord } from '../workshop';
import { analyzeWorkshopPackageDependencies, assertWorkshopPackageDependencies, listEnabledWorkshopPackageDependents, listWorkshopPackageDependents } from '../workshop-dependencies';

export class ContentDatabase extends Dexie {
  characters!: Table<CharacterCard, string>;
  personas!: Table<Persona, string>;
  worldbooks!: Table<WorldbookEntry, string>;
  presets!: Table<Preset, string>;
  presetBundles!: Table<PresetBundle, string>;
  storyScenePresets!: Table<StoryScenePresetRecord, string>;
  chats!: Table<ChatRecord, string>;
  chatRecovery!: Table<ChatRecoveryRecord, string>;
  memoryVectors!: Table<MemoryVectorRecord, string>;
  musicStates!: Table<MusicState, string>;
  terminalStickers!: Table<TerminalStickerRecord, string>;
  workshopPackages!: Table<WorkshopPackageRecord, string>;
  workshopBindings!: Table<WorkshopBinding, string>;
  workshopStates!: Table<WorkshopLocalState, string>;
  constructor(name = 'tokimeki-content') {
    super(name);
    this.version(1).stores({ characters: 'id', worldbooks: 'id', presets: 'id' });
    this.version(2).stores({ characters: 'id', worldbooks: 'id', presets: 'id', chats: 'characterId' });
    this.version(3).stores({ characters: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', chats: 'characterId' });
    this.version(4).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', chats: 'characterId' });
    this.version(5).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', chats: 'characterId' }).upgrade(async (transaction) => {
      await transaction.table('presets').toCollection().modify((preset: { enabled?: boolean }) => { if (typeof preset.enabled !== 'boolean') preset.enabled = true; });
      await transaction.table('presetBundles').toCollection().modify((bundle: { entries?: Array<{ enabled?: boolean }> }) => {
        for (const entry of bundle.entries ?? []) if (typeof entry.enabled !== 'boolean') entry.enabled = true;
      });
    });
    this.version(6).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId' });
    this.version(7).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId' });
    this.version(8).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId', memoryVectors: 'id, saveId, [saveId+characterId]' });
    this.version(9).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId', memoryVectors: 'id, saveId, [saveId+characterId]', musicStates: 'id' });
    this.version(10).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId', memoryVectors: 'id, saveId, [saveId+characterId]', musicStates: 'id', terminalStickers: 'id' });
    this.version(11).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId', memoryVectors: 'id, saveId, [saveId+characterId]', musicStates: 'id', terminalStickers: 'id', workshopPackages: 'id, updatedAt', workshopBindings: 'id, packageId, saveId, [saveId+packageId]' });
    this.version(12).stores({ characters: 'id', personas: 'id', worldbooks: 'id', presets: 'id', presetBundles: 'id', storyScenePresets: 'id', chats: 'characterId', chatRecovery: 'characterId', memoryVectors: 'id, saveId, [saveId+characterId]', musicStates: 'id', terminalStickers: 'id', workshopPackages: 'id, updatedAt', workshopBindings: 'id, packageId, saveId, [saveId+packageId]', workshopStates: 'id, packageId, saveId, [saveId+packageId]' });
  }
}

export const contentDb = new ContentDatabase();

export async function saveCharacter(card: CharacterCard): Promise<CharacterCard> { const parsed = CharacterCardSchema.parse(card); await contentDb.characters.put(parsed); return parsed; }
export async function deleteCharacter(id: string): Promise<void> { await contentDb.characters.delete(id); }
export async function savePersona(persona: Persona): Promise<Persona> { const parsed = PersonaSchema.parse(persona); await contentDb.personas.put(parsed); return parsed; }
export async function deletePersona(id: string): Promise<void> { await contentDb.personas.delete(id); }
export async function saveWorldbook(entry: WorldbookEntry): Promise<WorldbookEntry> { const parsed = WorldbookEntrySchema.parse(entry); await contentDb.worldbooks.put(parsed); return parsed; }
export async function deleteWorldbook(id: string): Promise<void> { await contentDb.worldbooks.delete(id); }
export async function savePreset(preset: Preset): Promise<Preset> { const parsed = PresetSchema.parse(preset); await contentDb.presets.put(parsed); return parsed; }
export async function deletePreset(id: string): Promise<void> { await contentDb.presets.delete(id); }
export async function savePresetBundle(bundle: PresetBundle): Promise<PresetBundle> { const parsed = PresetBundleSchema.parse(bundle); await contentDb.presetBundles.put(parsed); await Promise.all(parsed.entries.map((entry) => contentDb.presets.put(entry))); return parsed; }
export async function deletePresetBundle(id: string): Promise<void> { await contentDb.presetBundles.delete(id); }
export async function saveStoryScenePreset(preset: StoryScenePresetRecord): Promise<StoryScenePresetRecord> { const parsed = StoryScenePresetSchema.parse(preset); await contentDb.storyScenePresets.put(parsed); return parsed; }
export async function deleteStoryScenePreset(id: string): Promise<void> { await contentDb.storyScenePresets.delete(id); }
export async function saveChat(record: ChatRecord): Promise<ChatRecord> { const normalized = normalizeChatMessages(record.characterId, record.messages); const parsed = ChatRecordSchema.parse({ ...record, messages: normalized.messages }); await contentDb.chats.put(parsed); return parsed; }
export async function loadChat(characterId: string): Promise<ChatRecord | undefined> { const record = await contentDb.chats.get(characterId); if (!record) return undefined; const normalized = normalizeChatMessages(characterId, record.messages); if (!normalized.changed) return record; return saveChat({ ...record, messages: normalized.messages }); }
export async function clearChats(): Promise<void> { await Promise.all([contentDb.chats.clear(), contentDb.chatRecovery.clear()]); }
export async function saveChatRecovery(record: ChatRecoveryRecord): Promise<ChatRecoveryRecord> { const parsed = ChatRecoveryRecordSchema.parse(record); await contentDb.chatRecovery.put(parsed); return parsed; }
export async function loadChatRecovery(characterId: string): Promise<ChatRecoveryRecord | undefined> { return contentDb.chatRecovery.get(characterId); }
export async function clearChatRecovery(characterId: string): Promise<void> { await contentDb.chatRecovery.delete(characterId); }
export async function saveMemoryVectors(records: MemoryVectorRecord[]): Promise<MemoryVectorRecord[]> { const parsed = records.map((record) => MemoryVectorRecordSchema.parse(record)); await contentDb.memoryVectors.bulkPut(parsed); return parsed; }
export async function loadMemoryVectors(saveId: string, characterId: string): Promise<MemoryVectorRecord[]> { return contentDb.memoryVectors.where('[saveId+characterId]').equals([saveId, characterId]).toArray(); }
export async function clearMemoryVectors(saveId: string): Promise<void> { await contentDb.memoryVectors.where('saveId').equals(saveId).delete(); }
export async function saveMusicState(state: MusicState): Promise<MusicState> { const parsed = MusicStateSchema.parse(state); await contentDb.musicStates.put(parsed); return parsed; }
export async function loadMusicState(): Promise<MusicState | undefined> { const stored = await contentDb.musicStates.get('default'); if (!stored) return undefined; return MusicStateSchema.parse(stored); }
export async function listTerminalStickers(): Promise<TerminalStickerRecord[]> { return contentDb.terminalStickers.orderBy('createdAt').toArray(); }
export async function saveTerminalSticker(record: TerminalStickerRecord): Promise<TerminalStickerRecord> { const parsed = TerminalStickerRecordSchema.parse(record); await contentDb.terminalStickers.put(parsed); return parsed; }
export async function deleteTerminalSticker(id: string): Promise<void> { await contentDb.terminalStickers.delete(id); }
export async function listWorkshopPackages(): Promise<WorkshopPackageRecord[]> { return (await contentDb.workshopPackages.toArray()).map((record) => WorkshopPackageRecordSchema.parse(record)); }
export async function loadWorkshopPackage(id: string): Promise<WorkshopPackageRecord | undefined> { const record = await contentDb.workshopPackages.get(id); return record ? WorkshopPackageRecordSchema.parse(record) : undefined; }
export async function installWorkshopPackageRecord(record: WorkshopPackageRecord, binding: WorkshopBinding): Promise<WorkshopPackageRecord> {
  const parsedRecord = WorkshopPackageRecordSchema.parse(record);
  const parsedBinding = WorkshopBindingSchema.parse(binding);
  await contentDb.transaction('rw', contentDb.workshopPackages, contentDb.workshopBindings, async () => {
    const records = (await contentDb.workshopPackages.toArray()).map((item) => WorkshopPackageRecordSchema.parse(item));
    const bindings = (await contentDb.workshopBindings.toArray()).map((item) => WorkshopBindingSchema.parse(item));
    assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(parsedRecord.package, records, bindings, parsedBinding.enabled ? [parsedBinding.saveId] : []));
    await contentDb.workshopPackages.add(parsedRecord);
    await contentDb.workshopBindings.put(parsedBinding);
  });
  return parsedRecord;
}
export async function replaceWorkshopPackageRecord(record: WorkshopPackageRecord, expectedVersion: string): Promise<WorkshopPackageRecord> {
  const parsedRecord = WorkshopPackageRecordSchema.parse(record);
  await contentDb.transaction('rw', contentDb.workshopPackages, contentDb.workshopBindings, async () => {
    const current = await contentDb.workshopPackages.get(parsedRecord.id);
    if (!current) throw new Error(`工坊包不存在：${parsedRecord.id}`);
    const parsedCurrent = WorkshopPackageRecordSchema.parse(current);
    if (parsedCurrent.package.manifest.version !== expectedVersion) throw new Error(`工坊包已在其他页面更新为 ${parsedCurrent.package.manifest.version}，请刷新后重试。`);
    const records = (await contentDb.workshopPackages.toArray()).map((item) => WorkshopPackageRecordSchema.parse(item));
    const bindings = (await contentDb.workshopBindings.toArray()).map((item) => WorkshopBindingSchema.parse(item));
    const enabledSaveIds = bindings.filter((binding) => binding.packageId === parsedRecord.id && binding.enabled).map((binding) => binding.saveId);
    assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(parsedRecord.package, records, bindings, enabledSaveIds));
    await contentDb.workshopPackages.put(parsedRecord);
  });
  return parsedRecord;
}
export async function listWorkshopBindings(saveId?: string): Promise<WorkshopBinding[]> { const records = saveId ? await contentDb.workshopBindings.where('saveId').equals(saveId).toArray() : await contentDb.workshopBindings.toArray(); return records.map((record) => WorkshopBindingSchema.parse(record)); }
export async function setWorkshopBinding(saveId: string, packageId: string, enabled: boolean, timestamp: string): Promise<WorkshopBinding> {
  const id = workshopBindingId(saveId, packageId);
  let parsed: WorkshopBinding | undefined;
  await contentDb.transaction('rw', contentDb.workshopPackages, contentDb.workshopBindings, async () => {
    const record = await contentDb.workshopPackages.get(packageId);
    if (!record) throw new Error(`工坊包不存在：${packageId}`);
    const records = (await contentDb.workshopPackages.toArray()).map((item) => WorkshopPackageRecordSchema.parse(item));
    const bindings = (await contentDb.workshopBindings.toArray()).map((item) => WorkshopBindingSchema.parse(item));
    if (enabled) assertWorkshopPackageDependencies(analyzeWorkshopPackageDependencies(WorkshopPackageRecordSchema.parse(record).package, records, bindings, [saveId]));
    else {
      const dependents = listEnabledWorkshopPackageDependents(packageId, saveId, records, bindings);
      if (dependents.length) throw new Error(`当前世界仍有已启用包依赖它：${dependents.map((item) => item.id).join('、')}。请先停用这些包。`);
    }
    const current = await contentDb.workshopBindings.get(id);
    parsed = WorkshopBindingSchema.parse({ id, saveId, packageId, enabled, createdAt: current?.createdAt ?? timestamp, updatedAt: timestamp });
    await contentDb.workshopBindings.put(parsed);
  });
  if (!parsed) throw new Error(`更新工坊包绑定失败：${packageId}`);
  return parsed;
}
export async function deleteWorkshopPackage(id: string): Promise<WorkshopBinding[]> {
  let bindings: WorkshopBinding[] = [];
  await contentDb.transaction('rw', contentDb.workshopPackages, contentDb.workshopBindings, async () => {
    const records = (await contentDb.workshopPackages.toArray()).map((item) => WorkshopPackageRecordSchema.parse(item));
    const dependents = listWorkshopPackageDependents(id, records);
    if (dependents.length) throw new Error(`仍有已安装包依赖它：${dependents.map((item) => `${item.package.manifest.name}（${item.id}）`).join('、')}。请先卸载这些包。`);
    bindings = (await contentDb.workshopBindings.where('packageId').equals(id).toArray()).map((binding) => WorkshopBindingSchema.parse(binding));
    await contentDb.workshopPackages.delete(id);
    await contentDb.workshopBindings.where('packageId').equals(id).delete();
  });
  return bindings;
}
export async function loadWorkshopLocalState(saveId: string, packageId: string): Promise<WorkshopLocalState | undefined> {
  const record = await contentDb.workshopStates.get(workshopBindingId(saveId, packageId));
  return record ? WorkshopLocalStateSchema.parse(record) : undefined;
}
export async function saveWorkshopLocalState(saveId: string, packageId: string, values: WorkshopLocalState['values'], timestamp = new Date().toISOString()): Promise<WorkshopLocalState> {
  const parsed = WorkshopLocalStateSchema.parse({ id: workshopBindingId(saveId, packageId), saveId, packageId, values, updatedAt: timestamp });
  await contentDb.workshopStates.put(parsed);
  return parsed;
}
