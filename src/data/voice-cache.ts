import type { ChatRecord, VoiceAttachment } from './content';
import type { SaveFile } from './schema/save';

function increment(counts: Map<string, number>, id: string): void {
  counts.set(id, (counts.get(id) ?? 0) + 1);
}

export function countVoiceAssetReferences(chats: readonly ChatRecord[], saves: readonly SaveFile[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const record of chats) {
    for (const message of record.messages) {
      if (message.voice?.asset?.kind === 'stored') increment(counts, message.voice.asset.assetId);
    }
  }
  for (const save of saves) {
    for (const thread of Object.values(save.world.terminal.messageThreads)) {
      for (const message of thread) {
        if ((message.type === 'voice' || message.voiceRequestId) && message.asset?.kind === 'stored') increment(counts, message.asset.assetId);
      }
    }
  }
  return counts;
}

export function detachVoiceAssetsFromChat(record: ChatRecord, assetIds: ReadonlySet<string>): { record: ChatRecord; changed: boolean } {
  let changed = false;
  const messages = record.messages.map((message) => {
    const voice = message.voice;
    const asset = voice?.asset;
    if (asset?.kind !== 'stored' || !assetIds.has(asset.assetId)) return message;
    changed = true;
    const unavailable: VoiceAttachment = { ...voice!, asset: undefined };
    return { ...message, voice: unavailable };
  });
  return { record: changed ? { ...record, messages } : record, changed };
}

export function detachVoiceAssetsFromSave(save: SaveFile, assetIds: ReadonlySet<string>): { save: SaveFile; changed: boolean } {
  let changed = false;
  const messageThreads = Object.fromEntries(Object.entries(save.world.terminal.messageThreads).map(([threadId, thread]) => [threadId, thread.map((message) => {
    const asset = message.asset;
    if ((message.type !== 'voice' && !message.voiceRequestId) || asset?.kind !== 'stored' || !assetIds.has(asset.assetId)) return message;
    changed = true;
    const { asset: _asset, ...withoutAsset } = message;
    return withoutAsset;
  })]));
  if (!changed) return { save, changed: false };
  return { save: { ...save, world: { ...save.world, terminal: { ...save.world.terminal, messageThreads } } }, changed: true };
}

export function collectStoredAssetIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const seen = new Set<object>();
  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object') return;
    if (seen.has(candidate)) return;
    seen.add(candidate);
    if ('kind' in candidate && 'assetId' in candidate && candidate.kind === 'stored' && typeof candidate.assetId === 'string') {
      ids.add(candidate.assetId);
      return;
    }
    for (const child of Array.isArray(candidate) ? candidate : Object.values(candidate)) visit(child);
  };
  visit(value);
  return ids;
}
