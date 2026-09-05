import type { ChatMessage } from '../data/content';

export type DialogueLine = {
  kind: 'dialogue' | 'narration';
  speaker?: string;
  text: string;
};

/** Parse optional, human-readable speaker markers while keeping legacy plain text compatible. */
export function splitDialogueMessage(message: ChatMessage, fallbackSpeaker: string): DialogueLine[] {
  const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (message.role === 'system') return lines.map<DialogueLine>((text) => ({ kind: 'narration', text }));
  return lines.map<DialogueLine>((line) => {
    const narration = line.match(/^\[(?:旁白|narration)\]\s*(.*)$/i);
    if (narration) return { kind: 'narration', text: narration[1].trim() };
    const speaker = line.match(/^\[(?:说话人|speaker)[:：]\s*([^\]]+)\]\s*(.*)$/i);
    if (speaker) return { kind: 'dialogue', speaker: speaker[1].trim() || fallbackSpeaker, text: speaker[2].trim() };
    return { kind: 'dialogue', speaker: message.role === 'assistant' ? fallbackSpeaker : '你', text: line };
  }).filter((line) => line.text);
}
