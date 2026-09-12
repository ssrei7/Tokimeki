import Dexie, { type Table } from 'dexie';
import { CharacterCardSchema, ChatRecordSchema, ChatRecoveryRecordSchema, MemoryVectorRecordSchema, MusicStateSchema, PersonaSchema, PresetBundleSchema, PresetSchema, StoryScenePresetSchema, TerminalStickerRecordSchema, WorldbookEntrySchema, type CharacterCard, type ChatRecord, type ChatRecoveryRecord, type MemoryVectorRecord, type MusicState, type Persona, type Preset, type PresetBundle, type StoryScenePresetRecord, type TerminalStickerRecord, type WorldbookEntry } from '../content';

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
export async function saveChat(record: ChatRecord): Promise<ChatRecord> { const parsed = ChatRecordSchema.parse(record); await contentDb.chats.put(parsed); return parsed; }
export async function loadChat(characterId: string): Promise<ChatRecord | undefined> { return contentDb.chats.get(characterId); }
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
