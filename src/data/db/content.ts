import Dexie, { type Table } from 'dexie';
import { CharacterCardSchema, PresetSchema, WorldbookEntrySchema, type CharacterCard, type Preset, type WorldbookEntry } from '../content';

export class ContentDatabase extends Dexie {
  characters!: Table<CharacterCard, string>;
  worldbooks!: Table<WorldbookEntry, string>;
  presets!: Table<Preset, string>;
  constructor(name = 'tokimeki-content') {
    super(name);
    this.version(1).stores({ characters: 'id', worldbooks: 'id', presets: 'id' });
  }
}

export const contentDb = new ContentDatabase();

export async function saveCharacter(card: CharacterCard): Promise<CharacterCard> { const parsed = CharacterCardSchema.parse(card); await contentDb.characters.put(parsed); return parsed; }
export async function deleteCharacter(id: string): Promise<void> { await contentDb.characters.delete(id); }
export async function saveWorldbook(entry: WorldbookEntry): Promise<WorldbookEntry> { const parsed = WorldbookEntrySchema.parse(entry); await contentDb.worldbooks.put(parsed); return parsed; }
export async function deleteWorldbook(id: string): Promise<void> { await contentDb.worldbooks.delete(id); }
export async function savePreset(preset: Preset): Promise<Preset> { const parsed = PresetSchema.parse(preset); await contentDb.presets.put(parsed); return parsed; }
export async function deletePreset(id: string): Promise<void> { await contentDb.presets.delete(id); }
