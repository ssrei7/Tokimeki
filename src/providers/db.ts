import Dexie, { type Table } from 'dexie';
import type { CharacterProviderBinding, EmbeddingConfig, ImageConfig, ProviderBinding, ProviderConfig, ProviderSetting, TtsConfig } from './types';

/** Provider secrets stay in this local-only IndexedDB database and are never part of SaveFile exports. */
export class ProviderDatabase extends Dexie {
  providers!: Table<ProviderConfig, string>;
  bindings!: Table<ProviderBinding, string>;
  settings!: Table<ProviderSetting, string>;
  embeddingConfigs!: Table<EmbeddingConfig, string>;
  ttsConfigs!: Table<TtsConfig, string>;
  characterBindings!: Table<CharacterProviderBinding, string>;
  imageConfigs!: Table<ImageConfig, string>;

  constructor(name = 'tokimeki-providers') {
    super(name);
    this.version(1).stores({ providers: 'id', bindings: 'taskId' });
    this.version(2).stores({ providers: 'id', bindings: 'taskId', settings: 'key' });
    this.version(3).stores({ providers: 'id', bindings: 'taskId', settings: 'key', embeddingConfigs: 'id' });
    this.version(4).stores({ providers: 'id', bindings: 'taskId', settings: 'key', embeddingConfigs: 'id', ttsConfigs: 'id' });
    this.version(5).stores({ providers: 'id', bindings: 'taskId', settings: 'key', embeddingConfigs: 'id', ttsConfigs: 'id' }).upgrade(async (transaction) => {
      const legacy = await transaction.table('ttsConfigs').get('tts') as Record<string, unknown> | undefined;
      if (legacy && typeof legacy.name !== 'string') {
        await transaction.table('ttsConfigs').put({ ...legacy, name: '默认语音' });
      }
      const current = await transaction.table('settings').get('defaultTtsProviderId') as { key?: string; value?: string } | undefined;
      if (!current && legacy) {
        await transaction.table('settings').put({ key: 'defaultTtsProviderId', value: 'tts' });
      }
    });
    this.version(6).stores({ providers: 'id', bindings: 'taskId', settings: 'key', embeddingConfigs: 'id', ttsConfigs: 'id', characterBindings: 'id, saveId, [saveId+characterId]' });
    this.version(7).stores({ providers: 'id', bindings: 'taskId', settings: 'key', embeddingConfigs: 'id', ttsConfigs: 'id', characterBindings: 'id, saveId, [saveId+characterId]', imageConfigs: 'id' });
  }
}

export const providerDb = new ProviderDatabase();
