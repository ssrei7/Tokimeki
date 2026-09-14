import { describe, expect, it } from 'vitest';
import { importPlainText } from '../src/data/text-import';

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
});
