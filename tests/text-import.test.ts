import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { importPlainText, readDocxPlainText } from '../src/data/text-import';

describe('plain text content import', () => {
  it('maps TXT to a character description using the file name', () => {
    expect(importPlainText('character', '澪.txt', '\uFEFF 观察港口的人。 ', '2026-09-14T00:00:00.000Z')).toMatchObject({ name: '澪', description: '观察港口的人。', personality: '' });
  });

  it('maps TXT to worldbook content and preset prompt', () => {
    expect(importPlainText('worldbook', '港口.txt', '潮汐规则')).toMatchObject({ name: '港口', content: '潮汐规则', keys: [], enabled: true });
    expect(importPlainText('preset', '温柔.txt', '保持克制')).toMatchObject({ name: '温柔', systemPrompt: '保持克制', temperature: 0.7, maxOutputTokens: 1024 });
  });

  it('rejects empty text', () => {
    expect(() => importPlainText('character', 'empty.txt', ' \n\t ', '2026-09-14T00:00:00.000Z')).toThrow('内容为空');
  });

  it('extracts plain text from DOCX paragraphs and line breaks', async () => {
    const zip = new JSZip();
    zip.file('word/document.xml', '<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r><w:br/><w:t>换行</w:t></w:r></w:p></w:body></w:document>');
    await expect(readDocxPlainText(await zip.generateAsync({ type: 'uint8array' }))).resolves.toBe('第一段\n第二段\n换行');
  });
});
