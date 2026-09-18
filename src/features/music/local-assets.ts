import type { MusicTrack } from '../../data/content';

export interface LocalMusicFileInfo {
  name: string;
  type: string;
  size: number;
}

const MUSIC_MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  wav: 'audio/wav',
  webm: 'audio/webm',
  flac: 'audio/flac',
};

export function resolveLocalMusicFile(file?: LocalMusicFileInfo): { ok: true; mimeType: string; fallbackTitle: string } | { ok: false; warning: string } {
  if (!file?.size) return { ok: false, warning: '请选择非空音频文件。' };
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeType = file.type.startsWith('audio/') ? file.type : MUSIC_MIME_BY_EXTENSION[extension];
  if (!mimeType) return { ok: false, warning: '请选择常见音频文件（MP3、M4A、AAC、OGG、WAV、WebM 或 FLAC）。' };
  return { ok: true, mimeType, fallbackTitle: file.name.replace(/\.[^.]+$/, '').trim() || '本地音频' };
}

export function isMusicAssetReferenced(tracks: readonly MusicTrack[], assetId: string): boolean {
  return tracks.some((track) => track.asset?.assetId === assetId);
}
