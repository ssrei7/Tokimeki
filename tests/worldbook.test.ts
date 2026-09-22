import { parseWorldbookKeys } from '../src/data/content';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { createDefaultPromptBlocks } from '../src/core/prompt/default-blocks';
import { describe, expect, it } from 'vitest';

describe('worldbook keyword triggers', () => {
  it('parses comma-separated keywords and keeps unique non-empty values', () => {
    expect(parseWorldbookKeys(' 港口, 码头，港口, ,')).toEqual(['港口', '码头']);
    expect(parseWorldbookKeys('   ')).toEqual([]);
  });

  it('treats empty keys as constant and only injects matching keyword entries', () => {
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const baseFacts = { input: '', worldbooks: [
      { id: 'constant', name: '常驻', content: '常驻内容', keys: [], enabled: true, priority: 50 },
      { id: 'keyword', name: '港口', content: '港口内容', keys: ['港口', '码头'], enabled: true, priority: 50 },
      { id: 'other', name: '其他', content: '其他内容', keys: ['森林'], enabled: true, priority: 50 },
    ], history: [] };
    const constant = assembler.assemble(baseFacts, { budget: 4096, task: 'narrate_main' }).blocks.find((block) => block.id === 'worldbook_keyword');
    expect(constant?.text).toContain('常驻内容');
    expect(constant?.text).not.toContain('港口内容');
    const matched = assembler.assemble({ ...baseFacts, input: '去码头看看' }, { budget: 4096, task: 'narrate_main' }).blocks.find((block) => block.id === 'worldbook_keyword');
    expect(matched?.text).toContain('常驻内容');
    expect(matched?.text).toContain('港口内容');
    expect(matched?.text).not.toContain('其他内容');
  });
});
