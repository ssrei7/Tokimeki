import type { ChatMessage } from '../data/content';

export type DialogueLine = {
  kind: 'dialogue' | 'narration';
  speaker?: string;
  text: string;
};

/** Finds the latest explicit speaker without guessing from unmarked narration. */
export function latestDialogueSpeakerId(messages: ChatMessage[], fallbackSpeakerId: string, speakerIdsByName: Record<string, string> = {}): string {
  for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
    const message = messages[messageIndex];
    if (message.role === 'system') continue;
    if (message.kind === 'dialogue' && message.speakerId) return message.speakerId;
    if (message.role === 'user') return message.speakerId ?? 'player';
    const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (let lineIndex = lines.length - 1; lineIndex >= 0; lineIndex -= 1) {
      const speaker = lines[lineIndex].match(/^\[(?:说话人|speaker)[:：]\s*([^\]]+)\]/i);
      if (speaker) return speakerIdsByName[speaker[1].trim()] ?? fallbackSpeakerId;
    }
  }
  return fallbackSpeakerId;
}

/** Parse optional, human-readable speaker markers while keeping legacy plain text compatible. */
export function splitDialogueMessage(message: ChatMessage, fallbackSpeaker: string, userSpeaker = '你', speakerLabels: Record<string, string> = {}): DialogueLine[] {
  const lines = message.content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (message.role === 'system') return lines.map<DialogueLine>((text) => ({ kind: 'narration', text }));
  const hasExplicitMarkers = message.role === 'assistant' && lines.some((line) => /^\[(?:旁白|narration)\]/i.test(line) || /^\[(?:说话人|speaker)[:：]/i.test(line));
  if (message.kind === 'narration') return lines.map<DialogueLine>((text) => ({ kind: 'narration', text }));
  if (message.kind === 'dialogue' && !hasExplicitMarkers) {
    const speaker = message.speakerId
      ? speakerLabels[message.speakerId] ?? (message.speakerId === 'player' ? userSpeaker : fallbackSpeaker)
      : (message.role === 'user' ? userSpeaker : fallbackSpeaker);
    return lines.map((text) => ({ kind: 'dialogue', speaker, text }));
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
