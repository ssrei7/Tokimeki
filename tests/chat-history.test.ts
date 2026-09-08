import { describe, expect, it } from 'vitest';
import { deleteChatMessage, isEditableChatMessage, updateChatMessage } from '../src/ui/chat-history';
import type { ChatMessage } from '../src/data/content';

const user = (content: string): ChatMessage => ({ role: 'user', content, kind: 'dialogue', speakerId: 'player' });

describe('chat history editing', () => {
  it('edits and deletes free-form player and character lines without changing other messages', () => {
    const messages: ChatMessage[] = [user('旧台词'), { role: 'assistant', content: '角色回应' }];
    const edited = updateChatMessage(messages, 0, '  新台词  ');
    expect(edited).toEqual([user('新台词'), messages[1]]);
    const editedReply = updateChatMessage(edited, 1, '新的角色回应');
    expect(editedReply[1]).toEqual({ role: 'assistant', content: '新的角色回应' });
    expect(deleteChatMessage(editedReply, 0)).toEqual([editedReply[1]]);
  });

  it('keeps generated gift and collection lines immutable', () => {
    const gift = user('（你送出了白色小花。）');
    const collection = user('（你向对方出示了收藏《旧车票》。）');
    expect(isEditableChatMessage(gift)).toBe(false);
    expect(isEditableChatMessage(collection)).toBe(false);
    expect(updateChatMessage([gift], 0, '篡改')).toEqual([gift]);
    expect(deleteChatMessage([collection], 0)).toEqual([collection]);
  });

  it('rejects empty edits and non-user messages', () => {
    const assistant: ChatMessage = { role: 'assistant', content: '角色回应' };
    const messages = [user('保留'), assistant];
    expect(updateChatMessage(messages, 0, '   ')).toBe(messages);
    expect(updateChatMessage(messages, 1, '修改')).toEqual([{ role: 'user', content: '保留', kind: 'dialogue', speakerId: 'player' }, { role: 'assistant', content: '修改' }]);
    const system: ChatMessage = { role: 'system', content: '系统提示' };
    expect(updateChatMessage([system], 0, '修改')).toBeInstanceOf(Array);
    expect(deleteChatMessage([system], 0)).toEqual([system]);
  });
});
