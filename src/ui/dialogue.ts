import type { ChatMessage } from '../data/content';

export type DialogueLine = {
  kind: 'dialogue' | 'narration';
  speaker?: string;
  text: string;
};

/** Parse optional, human-readable speaker markers while keeping legacy plain text compatible. */
export function splitDialogueMessage(message: ChatMessage, fallbackSpeaker: string, userSpeaker = '你', speakerLabels: Record<string, string> = {}): DialogueLine[] {
  const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (message.role === 'system') return lines.map<DialogueLine>((text) => ({ kind: 'narration', text }));
  if (message.kind) {
    const speaker = message.speakerId
      ? speakerLabels[message.speakerId] ?? (message.speakerId === 'player' ? userSpeaker : fallbackSpeaker)
      : (message.role === 'user' ? userSpeaker : fallbackSpeaker);
    return lines.map((text) => message.kind === 'dialogue' ? { kind: 'dialogue', speaker, text } : { kind: 'narration', text });
  }
  return lines.map<DialogueLine>((line) => {
    const narration = line.match(/^\[(?:旁白|narration)\]\s*(.*)$/i);
    if (narration) return { kind: 'narration', text: narration[1].trim() };
    const speaker = line.match(/^\[(?:说话人|speaker)[:：]\s*([^\]]+)\]\s*(.*)$/i);
    if (speaker) return { kind: 'dialogue', speaker: speaker[1].trim() || fallbackSpeaker, text: speaker[2].trim() };
    return message.role === 'assistant'
      ? { kind: 'narration', text: line }
      : { kind: 'dialogue', speaker: userSpeaker, text: line };
  }).filter((line) => line.text);
}
