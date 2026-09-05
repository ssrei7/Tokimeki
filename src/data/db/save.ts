import Dexie, { type Table } from 'dexie';
import { SaveFileSchema, type SaveFile } from '../schema/save';

export const DEFAULT_SNAPSHOT_LIMIT = 7;

export interface CurrentSaveRecord {
  id: 'current';
  save: SaveFile;
  updatedAt: string;
}

export interface SaveSnapshot {
  id: string;
  day: number;
  createdAt: string;
  save: SaveFile;
}

export class SaveDatabase extends Dexie {
  current!: Table<CurrentSaveRecord, string>;
  snapshots!: Table<SaveSnapshot, string>;

  constructor(name = 'tokimeki-save') {
    super(name);
    this.version(1).stores({ current: 'id', snapshots: 'id, day, createdAt' });
  }
}

export const saveDb = new SaveDatabase();

export async function loadCurrentSave(): Promise<SaveFile | undefined> {
  const record = await saveDb.current.get('current');
  return record ? SaveFileSchema.parse(record.save) : undefined;
}

export async function saveCurrentSave(save: SaveFile): Promise<void> {
  const parsed = SaveFileSchema.parse(save);
  await saveDb.current.put({ id: 'current', save: parsed, updatedAt: parsed.meta.updatedAt });
}

export async function saveDailySnapshot(save: SaveFile, day: number, createdAt: string, limit = DEFAULT_SNAPSHOT_LIMIT): Promise<void> {
  const parsed = SaveFileSchema.parse(save);
  await saveDb.snapshots.put({ id: `day-${day}`, day, createdAt, save: parsed });
  const snapshots = await saveDb.snapshots.orderBy('day').reverse().toArray();
  const stale = snapshots.slice(Math.max(0, limit));
  if (stale.length) await saveDb.snapshots.bulkDelete(stale.map((snapshot) => snapshot.id));
}

export async function listSnapshots(): Promise<SaveSnapshot[]> {
  return saveDb.snapshots.orderBy('day').reverse().toArray();
}

export async function loadSnapshot(id: string): Promise<SaveSnapshot | undefined> {
  const snapshot = await saveDb.snapshots.get(id);
  return snapshot ? { ...snapshot, save: SaveFileSchema.parse(snapshot.save) } : undefined;
}
