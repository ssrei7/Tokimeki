import type { CharacterCard, Preset, WorldbookEntry } from './content';
import JSZip from 'jszip';

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

/** Extract only readable text from a DOCX document. Styles, images and metadata are ignored. */
export async function readDocxPlainText(input: Blob | ArrayBuffer | Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(input);
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('DOCX 文件缺少 word/document.xml。');
  const xml = await document.async('text');
  const text = xml
    .replace(/<w:tab\s*\/?>/gi, '\t')
    .replace(/<w:br\s*\/?>/gi, '\n')
    .replace(/<w:tr[^>]*>/gi, '\n')
    .replace(/<w:p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('DOCX 文件中没有可提取的正文。');
  return text;
}
