import type { CharacterCard, Preset, WorldbookEntry } from './content';

export type TextImportKind = 'character' | 'worldbook' | 'preset';

function fileStem(fileName: string): string {
  const stem = fileName.replace(/\\/g, '/').split('/').pop()?.replace(/\.[^.]+$/, '')?.trim();
  return stem || '导入内容';
}

export function importPlainText(kind: TextImportKind, fileName: string, text: string, updatedAt = new Date().toISOString()): CharacterCard | WorldbookEntry | Preset {
  const name = fileStem(fileName);
  const content = text.replace(/^\uFEFF/, '').trim();
  if (!content) throw new Error('TXT 文件内容为空。');
  if (kind === 'character') return { id: `character-${Date.now()}`, name, description: content, personality: '', updatedAt };
  if (kind === 'worldbook') return { id: `worldbook-${Date.now()}`, name, content, keys: [], enabled: true, priority: 50 };
  return { id: `preset-${Date.now()}`, name, systemPrompt: content, enabled: true, temperature: 0.7, maxOutputTokens: 1024, updatedAt };
}
