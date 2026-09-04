import { describe, expect, it, vi } from 'vitest';
import { OpsStreamSplitter, parseReply } from '../src/core/ops';
import { MOCK_FIXTURES } from '../src/providers/mock/fixtures';

describe('ops reply parser', () => {
  it('strictly parses a valid fixture while preserving only narrative text', async () => {
    const raw = MOCK_FIXTURES.narrate_daily.perfect.chunks.join('');
    const parsed = await parseReply(raw);
    expect(parsed.stage).toBe('strict');
    expect(parsed.opsFailed).toBe(false);
    expect(parsed.text).toContain('他递给你一朵白色小花');
    expect(parsed.text).not.toContain('<ops>');
    expect(parsed.ops).toHaveLength(2);
  });

  it('repairs fences, single quotes, trailing commas, and newlines in strings', async () => {
    const raw = "正文\n```json\n<ops>\n[{'op':'add_memory','target':'seir','text':'第一行\n第二行',},]\n</ops>\n```";
    const parsed = await parseReply(raw);
    expect(parsed.stage).toBe('repaired');
    expect(parsed.text).toBe('正文');
    expect(parsed.ops).toEqual([{ op: 'add_memory', target: 'seir', text: '第一行\n第二行' }]);
  });

  it('does not corrupt apostrophes inside double-quoted strings while repairing commas', async () => {
    const parsed = await parseReply('正文\n<ops>\n[{"op":"add_memory","target":"seir","text":"it\'s the user\'s note",},]\n</ops>');
    expect(parsed.stage).toBe('repaired');
    expect(parsed.ops).toEqual([{ op: 'add_memory', target: 'seir', text: "it's the user's note" }]);
  });

  it('calls extract_ops at most once after local parsing fails', async () => {
    const raw = MOCK_FIXTURES.narrate_main.malformed.chunks.join('');
    const extract = vi.fn(async () => '[{"op":"set_flag","key":"recovered","value":true}]');
    const parsed = await parseReply(raw, extract);
    expect(extract).toHaveBeenCalledOnce();
    expect(extract).toHaveBeenCalledWith(raw);
    expect(parsed.stage).toBe('extracted');
    expect(parsed.ops).toEqual([{ op: 'set_flag', key: 'recovered', value: true }]);
  });

  it('keeps narrative and marks failure when all three levels fail', async () => {
    const raw = '仍要显示的正文\n<ops>\nnot-json\n</ops>';
    const parsed = await parseReply(raw, async () => 'still not json');
    expect(parsed.text).toBe('仍要显示的正文');
    expect(parsed.ops).toEqual([]);
    expect(parsed.opsFailed).toBe(true);
    expect(parsed.stage).toBe('failed');
    expect(parsed.warnings).toHaveLength(3);
  });

  it('accepts an empty ops fixture as a successful strict parse', async () => {
    const parsed = await parseReply(MOCK_FIXTURES.narrate_main['empty-ops'].chunks.join(''));
    expect(parsed.ops).toEqual([]);
    expect(parsed.opsFailed).toBe(false);
  });
});

describe('stream splitter', () => {
  it('streams narrative while hiding an ops marker split across chunks', () => {
    const splitter = new OpsStreamSplitter();
    const visible = [
      splitter.push('第一段正文\n<o'),
      splitter.push('ps>\n[{"op":"set_flag"}]'),
      splitter.push('\n</ops>'),
      splitter.finish().text,
    ].join('');
    expect(visible).toBe('第一段正文\n');
    expect(visible).not.toContain('<ops>');
  });

  it('flushes the held marker-sized tail when no ops block exists', () => {
    const splitter = new OpsStreamSplitter();
    const first = splitter.push('只有普通正文');
    const finished = splitter.finish();
    expect(first + finished.text).toBe('只有普通正文');
    expect(finished.raw).toBe('只有普通正文');
    expect(finished.foundOps).toBe(false);
  });
});
