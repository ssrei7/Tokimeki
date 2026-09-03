import Dexie, { type Table } from 'dexie';
import type { ProviderBinding, ProviderConfig } from './types';

/** Provider secrets stay in this local-only IndexedDB database and are never part of SaveFile exports. */
export class ProviderDatabase extends Dexie {
  providers!: Table<ProviderConfig, string>;
  bindings!: Table<ProviderBinding, string>;

  constructor(name = 'tokimeki-providers') {
    super(name);
    this.version(1).stores({ providers: 'id', bindings: 'taskId' });
  }
}

export const providerDb = new ProviderDatabase();
