import type { CharacterCard, ChatMessage, PresetBundle, WorldbookEntry } from '../../data/content';
import type { SaveFile } from '../../data/schema/save';
import type { PromptBlock, PromptFacts } from './assembler';

export const DEFAULT_PROMPT_BLOCK_IDS = [
  'format_contract', 'character_core', 'relationship_state', 'scene_now', 'node_worldbook', 'node_memory',
  'char_memory', 'recent_diary', 'milestones', 'worldbook_keyword', 'chapter_summary', 'raw_history',
] as const;

export interface DefaultPromptFacts extends PromptFacts {
  input: string;
  character?: CharacterCard;
  worldbooks: WorldbookEntry[];
  history: ChatMessage[];
  presetBundle?: PresetBundle;
  world: SaveFile['world'];
}

const missing = () => null;
const factsOf = (facts: PromptFacts) => facts as DefaultPromptFacts;

export function createDefaultPromptBlocks(opPromptDocs = ''): PromptBlock[] {
  const opContract = opPromptDocs
    ? `\n\n你可以在正文后提出状态变更。严格使用以下格式，JSON 必须是数组；不要把状态变化当作已经发生：\n<ops>\n[...]\n</ops>\n\n允许的 ops：\n${opPromptDocs}`
    : '';
  return [
    { id: 'format_contract', role: 'system', priority: 100, order: 0, build: (facts) => {
      const presetBundle = factsOf(facts).presetBundle;
      const presetText = presetBundle?.entries.length ? `\n\n当前资料预设包「${presetBundle.name}」的全部条目：\n${presetBundle.entries.map((entry) => `[${entry.name}]\n${entry.systemPrompt}`).join('\n\n')}` : '';
      return `你是开放世界叙事游戏中的角色。先输出自然语言正文。游戏状态只由确定性内核持有，不要声称提议已经生效。${presetText}${opContract}`;
    } },
    { id: 'character_core', role: 'system', priority: 95, order: 1, build: (facts) => {
      const character = factsOf(facts).character;
      if (!character) return null;
      return [character.name, character.description, character.personality, character.scenario].filter(Boolean).join('\n');
    } },
    { id: 'relationship_state', role: 'system', priority: 90, order: 2, build: missing },
    { id: 'scene_now', role: 'system', priority: 88, order: 3, build: (facts) => {
      const world = factsOf(facts).world;
      if (!world) return null;
      return `当前场景：第 ${world.clock.day} 天，时段 ${world.clock.slotId}，地点 ${world.player.nodeId}。玩家名为 ${world.player.name}。`;
    } },
    { id: 'node_worldbook', role: 'system', priority: 80, order: 4, build: missing },
    { id: 'node_memory', role: 'system', priority: 70, order: 5, build: missing },
    { id: 'char_memory', role: 'system', priority: 65, order: 6, build: missing },
    { id: 'recent_diary', role: 'system', priority: 60, order: 7, build: missing },
    { id: 'milestones', role: 'system', priority: 55, order: 8, build: missing },
    { id: 'worldbook_keyword', role: 'system', priority: 50, order: 9, build: (facts) => {
      const { input, worldbooks } = factsOf(facts);
      const lowerInput = input.toLocaleLowerCase();
      const matched = worldbooks
        .filter((entry) => entry.enabled && (entry.keys.length === 0 || entry.keys.some((key) => key.trim() && lowerInput.includes(key.toLocaleLowerCase()))))
        .sort((a, b) => b.priority - a.priority);
      return matched.map((entry) => `[${entry.name}]\n${entry.content}`).join('\n\n') || null;
    } },
    { id: 'chapter_summary', role: 'system', priority: 40, order: 10, build: missing },
    { id: 'raw_history', role: 'user', priority: 20, order: 11, build: (facts) => {
      const history = factsOf(facts).history;
      if (!history.length) return null;
      return history.map((message) => `${message.role}: ${message.content}`).join('\n');
    } },
  ];
}
