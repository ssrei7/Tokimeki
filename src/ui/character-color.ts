import type { FormalCharacter } from '../data/schema/save';

export const PLAYER_ACCENT_COLOR = '#315efb';

const DEFAULT_CHARACTER_COLORS = [
  '#b54708', '#175cd3', '#c11574', '#027a48', '#6938ef', '#c4320a', '#026aa2', '#a15c07',
] as const;

export function resolveCharacterAccentColors(characters: Record<string, FormalCharacter>): Record<string, string> {
  const resolved: Record<string, string> = {};
  const used = new Set(Object.values(characters).flatMap((character) => character.visuals.accentColor ? [character.visuals.accentColor.toLowerCase()] : []));
  for (const id of Object.keys(characters).sort()) {
    const explicit = characters[id].visuals.accentColor;
    if (explicit) { resolved[id] = explicit; continue; }
    const start = hashId(id) % DEFAULT_CHARACTER_COLORS.length;
    let color = DEFAULT_CHARACTER_COLORS[start];
    for (let offset = 0; offset < DEFAULT_CHARACTER_COLORS.length; offset += 1) {
      const candidate = DEFAULT_CHARACTER_COLORS[(start + offset) % DEFAULT_CHARACTER_COLORS.length];
      if (!used.has(candidate.toLowerCase())) { color = candidate; break; }
    }
    resolved[id] = color;
    used.add(color.toLowerCase());
  }
  return resolved;
}

export function resolveSpeakerAccentColor(speakerId: string | undefined, formalAccentColors: Record<string, string>): string {
  if (speakerId === 'player') return PLAYER_ACCENT_COLOR;
  return speakerId ? formalAccentColors[speakerId] ?? '#667085' : '#667085';
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
