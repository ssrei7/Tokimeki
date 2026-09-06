import type { CharacterCard, ChatMessage, Persona, PresetBundle, WorldbookEntry } from '../../data/content';
import type { SaveFile } from '../../data/schema/save';
import type { PromptBlock, PromptFacts } from './assembler';

export const DEFAULT_PROMPT_BLOCK_IDS = [
  'format_contract', 'character_core', 'encounter_participants', 'relationship_state', 'scene_now', 'node_worldbook', 'node_memory',
  'char_memory', 'recent_diary', 'milestones', 'worldbook_keyword', 'chapter_summary', 'raw_history',
] as const;

export interface DefaultPromptFacts extends PromptFacts {
  input: string;
  character?: CharacterCard;
  worldbooks: WorldbookEntry[];
  history: ChatMessage[];
  participants?: CharacterCard[];
  presetBundle?: PresetBundle;
  playerPersona?: Persona;
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
      return `你是开放世界叙事游戏中的角色。先输出自然语言正文。面对面场景中只有明确写成 [说话人:角色名] 的内容才是角色台词；环境、动作、心理或其他描写一律使用 [旁白] 内容。未标记的助手正文为兼容旧记录，界面会按旁白显示。不要替玩家决定行动、台词、心理或选择；玩家的行动只能来自玩家消息。游戏状态只由确定性内核持有，不要声称提议已经生效。${presetText}${opContract}`;
    } },
    { id: 'character_core', role: 'system', priority: 95, order: 1, build: (facts) => {
      const character = factsOf(facts).character;
      if (!character) return null;
      return [character.name, character.description, character.personality, character.scenario].filter(Boolean).join('\n');
    } },
    { id: 'encounter_participants', role: 'system', priority: 94, order: 2, build: (facts) => {
      const participants = factsOf(facts).participants;
      if (!participants?.length) return null;
      return `本次面对面在场角色（仅这些角色可以发言）：\n${participants.map((character) => `${character.name}\n简介：${character.description}\n性格：${character.personality}${character.scenario ? `\n场景：${character.scenario}` : ''}`).join('\n\n')}`;
    } },
    { id: 'relationship_state', role: 'system', priority: 90, order: 3, build: missing },
    { id: 'scene_now', role: 'system', priority: 88, order: 4, build: (facts) => {
      const world = factsOf(facts).world;
      if (!world) return null;
      const node = world.map?.nodes?.[world.player.nodeId];
      const location = node ? `${node.name}（${node.id}）` : world.player.nodeId;
      const persona = factsOf(facts).playerPersona;
      const identity = persona ? `当前面具身份：${persona.displayName}。${persona.description ? ` ${persona.description}` : ''}` : `玩家名为 ${world.player.name}。`;
      return `当前场景：第 ${world.clock.day} 天，时段 ${world.clock.slotId}，地点 ${location}。${identity}`;
    } },
    { id: 'node_worldbook', role: 'system', priority: 80, order: 5, build: (facts) => {
      const { world, worldbooks } = factsOf(facts);
      const node = world?.map?.nodes?.[world.player.nodeId];
      if (!node) return null;
      const matched = node.worldbookIds
        .map((id) => worldbooks.find((entry) => entry.id === id))
        .filter((entry): entry is WorldbookEntry => Boolean(entry?.enabled));
      return matched.map((entry) => `[${entry.name}]\n${entry.content}`).join('\n\n') || null;
    } },
    { id: 'node_memory', role: 'system', priority: 70, order: 6, build: (facts) => {
      const world = factsOf(facts).world;
      const node = world?.map?.nodes?.[world.player.nodeId];
      if (!node?.memories?.length) return null;
      const names = new Map(Object.values(world.characters).map((character) => [character.id, character.name]));
      for (const npc of Object.values(world.npcs)) names.set(npc.id, npc.name);
      return `地点记忆（最近 ${node.memories.length} 条）：\n${node.memories.slice(-5).map((memory) => `- 第 ${memory.day} 天${memory.charIds.length ? `（${memory.charIds.map((id) => names.get(id) ?? id).join('、')}）` : ''}：${memory.text}`).join('\n')}`;
    } },
    { id: 'char_memory', role: 'system', priority: 65, order: 7, build: missing },
    { id: 'recent_diary', role: 'system', priority: 60, order: 8, build: (facts) => {
      const diary = factsOf(facts).world?.diary.slice(-7);
      return diary?.length ? `最近日记：\n${diary.map((entry) => `第 ${entry.day} 天：${entry.text}`).join('\n')}` : null;
    } },
    { id: 'milestones', role: 'system', priority: 55, order: 9, build: missing },
    { id: 'worldbook_keyword', role: 'system', priority: 50, order: 10, build: (facts) => {
      const { input, worldbooks } = factsOf(facts);
      const lowerInput = input.toLocaleLowerCase();
      const node = factsOf(facts).world?.map?.nodes?.[factsOf(facts).world.player.nodeId];
      const boundIds = new Set(node?.worldbookIds ?? []);
      const matched = worldbooks
        .filter((entry) => !boundIds.has(entry.id) && entry.enabled && (entry.keys.length === 0 || entry.keys.some((key) => key.trim() && lowerInput.includes(key.toLocaleLowerCase()))))
        .sort((a, b) => b.priority - a.priority);
      return matched.map((entry) => `[${entry.name}]\n${entry.content}`).join('\n\n') || null;
    } },
    { id: 'chapter_summary', role: 'system', priority: 40, order: 11, build: missing },
    { id: 'raw_history', role: 'user', priority: 20, order: 12, build: (facts) => {
      const history = factsOf(facts).history;
      if (!history.length) return null;
      return history.map((message) => `${message.role}: ${message.content}`).join('\n');
    } },
  ];
}
