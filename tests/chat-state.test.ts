import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { canGenerateReply, hasQueuedUserMessage, replyProgressIndicator } from '../src/ui/chat-state';
import { latestDialogueSpeakerId, splitDialogueMessage } from '../src/ui/dialogue';

describe('chat actions', () => {
  it('detects user messages waiting for a reply', () => {
    expect(hasQueuedUserMessage([{ role: 'user', content: 'one' }, { role: 'user', content: 'two' }])).toBe(true);
    expect(hasQueuedUserMessage([{ role: 'user', content: 'one' }, { role: 'assistant', content: 'reply' }])).toBe(false);
  });

  it('allows generation from text, queued messages, or an existing conversation', () => {
    expect(canGenerateReply([], '')).toBe(false);
    expect(canGenerateReply([], 'hello')).toBe(true);
    expect(canGenerateReply([{ role: 'user', content: 'hello' }], '')).toBe(true);
    expect(canGenerateReply([{ role: 'assistant', content: 'reply' }], '')).toBe(true);
  });

  it('distinguishes waiting for the first line from preparing later lines', () => {
    expect(replyProgressIndicator(false, 'idle', false)).toBeNull();
    expect(replyProgressIndicator(true, 'requesting', false)).toBe('first-line');
    expect(replyProgressIndicator(true, 'requesting', true)).toBe('first-line');
    expect(replyProgressIndicator(true, 'generating', true)).toBe('next-line');
    expect(replyProgressIndicator(true, 'success', true)).toBe('next-line');
    expect(replyProgressIndicator(true, 'error', true)).toBeNull();
  });

  it('uses icon actions with mutually exclusive panels and a stage-sized dialogue limit', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    expect(source).toContain("type ActiveChatPanel = 'gift' | 'collection' | 'regenerate' | 'recovery' | null;");
    expect(source).toContain('aria-label="发送消息" title="发送消息"');
    expect(source).toContain('aria-label="生成回复" title="生成回复"');
    expect(source).toContain('aria-label="告别" title="告别"');
    expect(source).not.toContain('🎁');
    expect(source).not.toContain('🗂️');
    expect(source).toContain('aria-valuemax={dialogueMaxHeight}');
    expect(css).toContain('.vn-dialogue-box { display: flex; flex: 0 0 auto; min-height: 80px;');
    expect(css).toContain('overflow-anchor: none;');
    expect(css).toContain('-webkit-overflow-scrolling: touch;');
    expect(css).not.toMatch(/\.vn-dialogue-box\s*\{[^}]*max-height:/s);
  });

  it('keeps the chat host as a single non-scrolling viewport and restores incomplete scenes to the choice menu', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/ui/theme/app.css', import.meta.url), 'utf8');
    const themeCss = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
    expect(source).toContain("session.mode === 'opening' || (session.mode === 'topics' && !restoredTopicTree) ? 'choice' : session.mode");
    expect(source).toContain('if (restoredMode !== session.mode) writeEncounterChatSession({ ...session, mode: restoredMode });');
    expect(source).toContain("setTopicMode('opening');");
    expect(source).toContain('void generateEncounterOpening(session);');
    expect(source).not.toContain('void generateTopicTree(formal.id');
    expect(source).toContain('半正式 NPC 轻互动中的所有 ops 均已拒绝');
    expect(source).toContain('encounter.candidates.map((candidate) => <label');
    expect(source).toContain('type="radio" name="encounter-primary"');
    expect(source).toContain("props.hasFormalPrimary && <button onClick={() => props.onChooseSceneMode('topics')}");
    expect(source).toContain("props.onChooseSceneMode('choice')");
    expect(source).toContain('formalSpeaker && <button type="button" onClick={() => startCgDraft');
    expect(source).toContain('const assistantChatMessage =');
    expect(source).not.toContain("content: narrative, kind: 'dialogue'");
    expect(css).toContain('.screen.chat-screen-host { display: flex; flex-direction: column; overflow: hidden; padding: 4px 8px var(--chat-bottom-nav-space); }');
    expect(css).toContain('.vn-chat-screen { gap: 4px; overflow: hidden; }');
    expect(themeCss).toContain('--chat-bottom-nav-space: calc(var(--bottom-nav-height) + var(--safe-area-bottom));');
  });
});

describe('dialogue line markers', () => {
  it('distinguishes speaker and narration while preserving plain legacy text', () => {
    expect(splitDialogueMessage({ role: 'assistant', content: '[说话人:凛] 你好。\n[旁白] 海风吹过。\n普通台词。' }, '塞伊尔')).toEqual([
      { kind: 'dialogue', speaker: '凛', text: '你好。' },
      { kind: 'narration', text: '海风吹过。' },
      { kind: 'narration', text: '普通台词。' },
    ]);
    expect(splitDialogueMessage({ role: 'user', content: '我点了点头。' }, '塞伊尔', '旅人')).toEqual([{ kind: 'dialogue', speaker: '旅人', text: '我点了点头。' }]);
  });

  it('renders structured dialogue metadata and resolves speaker ids locally', () => {
    expect(splitDialogueMessage({ role: 'assistant', content: '欢迎回来。', kind: 'dialogue', speakerId: 'char-rin' }, '塞伊尔', '旅人', { 'char-rin': '凛' })).toEqual([{ kind: 'dialogue', speaker: '凛', text: '欢迎回来。' }]);
    expect(splitDialogueMessage({ role: 'user', content: '我留下。', kind: 'dialogue', speakerId: 'player' }, '塞伊尔', '旅人', { player: '旅人' })).toEqual([{ kind: 'dialogue', speaker: '旅人', text: '我留下。' }]);
    expect(splitDialogueMessage({ role: 'assistant', content: '灯光在雨里晕开。', kind: 'narration', speakerId: 'char-rin' }, '塞伊尔', '旅人', { 'char-rin': '凛' })).toEqual([{ kind: 'narration', text: '灯光在雨里晕开。' }]);
  });

  it('does not let an explicit narration line inherit a dialogue speaker', () => {
    expect(splitDialogueMessage({ role: 'assistant', content: '[说话人:塞伊尔] 等候很久了吗？\n[旁白] 他的指尖轻轻动了一下。', kind: 'dialogue', speakerId: 'char-seir' }, '塞伊尔', '旅人', { 'char-seir': '塞伊尔' })).toEqual([
      { kind: 'dialogue', speaker: '塞伊尔', text: '等候很久了吗？' },
      { kind: 'narration', text: '他的指尖轻轻动了一下。' },
    ]);
  });

  it('tracks the latest explicit speaker for the active portrait', () => {
    expect(latestDialogueSpeakerId([
      { role: 'assistant', content: '[说话人:凛] 先说。' },
      { role: 'assistant', content: '[旁白] 海风吹过。' },
      { role: 'assistant', content: '[说话人:塞伊尔] 后说。' },
    ], 'char-rin', { 凛: 'char-rin', 塞伊尔: 'char-seir' })).toBe('char-seir');
    expect(latestDialogueSpeakerId([{ role: 'assistant', content: '只有旁白。' }], 'char-rin', { 凛: 'char-rin' })).toBe('char-rin');
  });
});
