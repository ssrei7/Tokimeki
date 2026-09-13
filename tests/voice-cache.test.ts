import { describe, expect, it } from 'vitest';

import type { ChatRecord } from '../src/data/content';
import { summarizeVoiceCache, type StoredAsset } from '../src/data/db/assets';
import { collectStoredAssetIds, countVoiceAssetReferences, detachVoiceAssetsFromChat, detachVoiceAssetsFromSave } from '../src/data/voice-cache';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

const createdAt = '2026-09-14T00:00:00.000Z';

function makeChat(): ChatRecord {
  return {
    characterId: 'formal',
    updatedAt: createdAt,
    messages: [{
      id: 'chat-1', role: 'assistant', content: '你好', speakerId: 'formal',
      voice: { asset: { kind: 'stored', assetId: 'shared-voice' }, audioFormat: 'mp3', durationMs: 900, requestId: 'request-1', cacheFingerprint: 'fingerprint-1' },
    }],
  };
}

function makeSave() {
  const save = seedScenario(createCurrentSaveScenario({ id: 'voice-cache', title: 'Voice cache' }));
  save.world.terminal.messageThreads['terminal-thread-formal'] = [
    { id: 'terminal-1', threadId: 'terminal-thread-formal', senderId: 'formal', type: 'text', text: '你好', asset: { kind: 'stored', assetId: 'shared-voice' }, audioFormat: 'mp3', durationMs: 900, voiceRequestId: 'request-1', createdDay: 1, createdSlotId: 'morning' },
    { id: 'terminal-2', threadId: 'terminal-thread-formal', senderId: 'formal', type: 'sticker', asset: { kind: 'stored', assetId: 'shared-voice' }, createdDay: 1, createdSlotId: 'morning' },
  ];
  return save;
}

describe('voice cache references', () => {
  it('counts shared message references and summarizes local bytes', () => {
    const references = countVoiceAssetReferences([makeChat()], [makeSave()]);
    expect(references.get('shared-voice')).toBe(2);
    const assets: StoredAsset[] = [{ id: 'shared-voice', blob: new Blob([new Uint8Array([1, 2, 3])]), mimeType: 'audio/mpeg', category: 'voice', createdAt }];
    expect(summarizeVoiceCache(assets, references)).toEqual({ count: 1, totalBytes: 3, referenceCount: 2 });
  });

  it('removes audio references while retaining message text and unavailable metadata', () => {
    const assetIds = new Set(['shared-voice']);
    const chat = detachVoiceAssetsFromChat(makeChat(), assetIds);
    expect(chat.changed).toBe(true);
    expect(chat.record.messages[0]).toMatchObject({ content: '你好', voice: { audioFormat: 'mp3', requestId: 'request-1' } });
    expect(chat.record.messages[0].voice?.asset).toBeUndefined();

    const save = detachVoiceAssetsFromSave(makeSave(), assetIds);
    const [voiceMessage, stickerMessage] = save.save.world.terminal.messageThreads['terminal-thread-formal'];
    expect(voiceMessage).toMatchObject({ text: '你好', audioFormat: 'mp3', voiceRequestId: 'request-1' });
    expect(voiceMessage.asset).toBeUndefined();
    expect(stickerMessage.asset).toEqual({ kind: 'stored', assetId: 'shared-voice' });
    expect(collectStoredAssetIds(save.save).has('shared-voice')).toBe(true);
  });

  it('does not mutate records without a targeted voice reference', () => {
    const chat = makeChat();
    const save = makeSave();
    expect(detachVoiceAssetsFromChat(chat, new Set(['other']))).toEqual({ record: chat, changed: false });
    expect(detachVoiceAssetsFromSave(save, new Set(['other']))).toEqual({ save, changed: false });
  });
});
