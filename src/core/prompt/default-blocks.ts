import type { CharacterCard, ChatMessage, Persona, PresetBundle, WorldbookEntry } from '../../data/content';
import type { SaveFile } from '../../data/schema/save';
import type { PromptBlock, PromptFacts } from './assembler';
import { buildRelationshipStatePrompt, type RelationshipPromptState } from '../relationship';
import { retrieveRelationshipMemories } from '../relationship';
import { weatherForDay } from '../world/weather';

export const DEFAULT_PROMPT_BLOCK_IDS = [
  'preset_bundle', 'format_contract', 'encounter_participants', 'character_core', 'relationship_state', 'scene_now', 'weather', 'node_worldbook', 'node_memory',
  'char_memory', 'recent_diary', 'milestones', 'worldbook_keyword', 'chapter_summary', 'raw_history', 'regeneration_request',
  'gift_context', 'collection_context',
] as const;

export interface DefaultPromptFacts extends PromptFacts {
  input: string;
  character?: CharacterCard;
  worldbooks: WorldbookEntry[];
  history: ChatMessage[];
  participants?: CharacterCard[];
  presetBundle?: PresetBundle;
  playerPersona?: Persona;
  regenerationRequest?: string;
  relationshipState?: RelationshipPromptState;
  giftContext?: {
    giftId: string;
    charId: string;
    charName: string;
    itemId: string;
    itemName: string;
    description?: string;
    tags: string[];
  };
  collectionContext?: {
    entryId: string;
    itemId: string;
    title: string;
    description: string;
    tags: string[];
  };
  world: SaveFile['world'];
}

const missing = () => null;
const factsOf = (facts: PromptFacts) => facts as DefaultPromptFacts;

export function createDefaultPromptBlocks(opPromptDocs = ''): PromptBlock[] {
  const opContract = opPromptDocs
    ? `\n\n你可以在正文后提出状态变更。严格使用以下格式，JSON 必须是数组；不要把状态变化当作已经发生：\n<ops>\n[...]\n</ops>\n\n允许的 ops：\n${opPromptDocs}`
    : '';
  return [
    { id: 'preset_bundle', role: 'system', priority: 110, order: 0, build: (facts) => {
      const presetBundle = factsOf(facts).presetBundle;
      const entries = presetBundle?.entries.filter((entry) => entry.enabled !== false);
      if (!entries?.length) return null;
      return entries.map((entry, index) => `[${index === 0 ? '核心预设' : '预设'}：${entry.name}]\n${entry.systemPrompt}`).join('\n\n');
    } },
    { id: 'format_contract', role: 'system', priority: 100, order: 1, tasks: ['narrate_main'], build: () => `你是开放世界叙事游戏中的角色。先输出自然语言正文。面对面场景中只有明确写成 [说话人:角色名] 的内容才是角色台词；环境、动作、心理或其他描写一律使用 [旁白] 内容。未标记的助手正文为兼容旧记录，界面会按旁白显示。游戏状态只由确定性内核持有，不要声称提议已经生效。${opContract}` },
    { id: 'encounter_participants', role: 'system', priority: 96, order: 2, build: (facts) => {
      const { participants, character, playerPersona, world } = factsOf(facts);
      if (!participants?.length) return null;
      const playerLabel = playerPersona?.displayName ?? world?.player.name ?? '玩家';
      const playerIdentity = playerPersona?.description ? `\n玩家身份：${playerPersona.description}` : '';
      const cast = participants.map((participant) => `${participant.name}（${participant.id === character?.id ? '主要聊天角色' : '其他在场角色'}）\n简介：${participant.description}\n性格：${participant.personality}${participant.scenario ? `\n场景：${participant.scenario}` : ''}`).join('\n\n');
      return `[面对面场景角色与指代]\n玩家（叙事主角与旁白视角主体）：${playerLabel}${playerIdentity}\n\n本次在场的非玩家角色（除玩家外，仅这些角色可以发言）：\n${cast}\n\n指代与互动规则：\n- 旁白的人称形式由启用的预设决定，但旁白的视角主体始终是玩家。第一人称旁白中的“我”、第二人称旁白中的“你”、第三人称旁白中的玩家称呼都指向玩家；第三人称代词若可能与在场角色混淆，改用玩家称呼。\n- 角色台词中的“我”只指当前 [说话人]；台词中的“你”必须有清楚的受话对象。\n- 角色向玩家提问后，不得让另一名角色无提示地当作玩家回答。另一角色可以插话、抢答或打断，但必须用 [旁白] 明确写出其动作和介入方式。\n- 非玩家角色可以互相交谈。注意力从玩家转向另一角色时，必须用姓名、视线、动作或 [旁白] 明确交代；如果他们暂时无视玩家，也要描写玩家仍在场以及这种冷落或注意力转移。\n- 不得把任何非玩家角色静默替换成叙事中的玩家。`;
    } },
    { id: 'character_core', role: 'system', priority: 95, order: 3, build: (facts) => {
      const character = factsOf(facts).character;
      if (!character) return null;
      return [`当前主要聊天角色（非玩家）：${character.name}`, `简介：${character.description}`, `性格：${character.personality}`, character.scenario ? `场景：${character.scenario}` : ''].filter(Boolean).join('\n');
    } },
    { id: 'relationship_state', role: 'system', priority: 90, order: 4, build: (facts) => buildRelationshipStatePrompt(factsOf(facts).relationshipState) },
    { id: 'scene_now', role: 'system', priority: 88, order: 5, build: (facts) => {
      const world = factsOf(facts).world;
      if (!world) return null;
      const node = world.map?.nodes?.[world.player.nodeId];
      const location = node ? `${node.name}（${node.id}）` : world.player.nodeId;
      const persona = factsOf(facts).playerPersona;
      const identity = persona ? `当前面具身份：${persona.displayName}。${persona.description ? ` ${persona.description}` : ''}` : `玩家名为 ${world.player.name}。`;
      return `当前场景：第 ${world.clock.day} 天，时段 ${world.clock.slotId}，地点 ${location}。${identity}`;
    } },
    { id: 'weather', role: 'system', priority: 87, order: 6, build: (facts) => {
      const world = factsOf(facts).world;
      if (!world) return null;
      const weather = weatherForDay(world);
      if (!weather) return null;
      return `[今日天气]\n${weather.label}（${weather.id}）。天气标签：${weather.tags.length ? weather.tags.join('、') : '无'}。天气是世界事实，只用于背景描写和确定性事件门控；不要自行推断未提供的影响。`;
    } },
    { id: 'node_worldbook', role: 'system', priority: 80, order: 6, build: (facts) => {
      const { world, worldbooks } = factsOf(facts);
      const node = world?.map?.nodes?.[world.player.nodeId];
      if (!node) return null;
      const matched = node.worldbookIds
        .map((id) => worldbooks.find((entry) => entry.id === id))
        .filter((entry): entry is WorldbookEntry => Boolean(entry?.enabled));
      return matched.map((entry) => `[${entry.name}]\n${entry.content}`).join('\n\n') || null;
    } },
    { id: 'node_memory', role: 'system', priority: 70, order: 7, build: (facts) => {
      const world = factsOf(facts).world;
      const node = world?.map?.nodes?.[world.player.nodeId];
      if (!node?.memories?.length) return null;
      const names = new Map(Object.values(world.characters).map((character) => [character.id, character.name]));
      for (const npc of Object.values(world.npcs)) names.set(npc.id, npc.name);
      return `地点记忆（最近 ${node.memories.length} 条）：\n${node.memories.slice(-5).map((memory) => `- 第 ${memory.day} 天${memory.charIds.length ? `（${memory.charIds.map((id) => names.get(id) ?? id).join('、')}）` : ''}：${memory.text}`).join('\n')}`;
    } },
    { id: 'char_memory', role: 'system', priority: 65, order: 8, build: (facts) => {
      const { world, character, participants } = factsOf(facts);
      if (!world) return null;
      const selected = participants?.length ? participants : character ? [character] : [];
      const characterNames = new Map(Object.values(world.characters).map((item) => [item.id, item.name]));
      for (const participant of selected) characterNames.set(participant.id, participant.name);
      const sections = [...new Set(selected.map((item) => item.id))].flatMap((charId) => {
        const memories = retrieveRelationshipMemories(world, charId, { query: factsOf(facts).input, nodeId: world.player.nodeId, limit: 5 }).map(({ memory }) => memory);
        if (!memories.length) return [];
        const name = characterNames.get(charId) ?? charId;
        return [`${name}：\n${memories.map((memory) => `- 第 ${memory.day} 天${memory.nodeId ? ` · 地点 ${memory.nodeId}` : ''}：${memory.text}`).join('\n')}`];
      });
      return sections.length ? `角色长期记忆（每位角色最多最近 5 条）：\n${sections.join('\n\n')}` : null;
    } },
    { id: 'recent_diary', role: 'system', priority: 60, order: 9, build: (facts) => {
      const diary = factsOf(facts).world?.diary.slice(-7);
      return diary?.length ? `最近日记：\n${diary.map((entry) => `第 ${entry.day} 天：${entry.text}`).join('\n')}` : null;
    } },
    { id: 'milestones', role: 'system', priority: 55, order: 10, build: missing },
    { id: 'worldbook_keyword', role: 'system', priority: 50, order: 11, build: (facts) => {
      const { input, worldbooks } = factsOf(facts);
      const lowerInput = input.toLocaleLowerCase();
      const node = factsOf(facts).world?.map?.nodes?.[factsOf(facts).world.player.nodeId];
      const boundIds = new Set(node?.worldbookIds ?? []);
      const matched = worldbooks
        .filter((entry) => !boundIds.has(entry.id) && entry.enabled && (entry.keys.length === 0 || entry.keys.some((key) => key.trim() && lowerInput.includes(key.toLocaleLowerCase()))))
        .sort((a, b) => b.priority - a.priority);
      return matched.map((entry) => `[${entry.name}]\n${entry.content}`).join('\n\n') || null;
    } },
    { id: 'chapter_summary', role: 'system', priority: 40, order: 12, build: missing },
    { id: 'raw_history', role: 'user', priority: 20, order: 13, build: (facts) => {
      const history = factsOf(facts).history;
      if (!history.length) return null;
      return history.map((message) => `${message.role}: ${message.content}`).join('\n');
    } },
    { id: 'regeneration_request', role: 'user', priority: 25, order: 14, build: (facts) => {
      const request = factsOf(facts).regenerationRequest?.trim();
      if (!request) return null;
      return `[重生成上一条角色回复]\n用户要求：${request}\n请只输出替代上一条回复的自然语言正文。不要输出或提议任何 <ops> 状态操作。`;
    } },
    { id: 'gift_context', role: 'system', priority: 89, order: 15, tasks: ['narrate_main'], build: (facts) => {
      const gift = factsOf(facts).giftContext;
      if (!gift) return null;
      return `[送礼回应上下文]\n玩家刚刚将「${gift.itemName}」送给${gift.charName}（礼物 id：${gift.giftId}）。礼物描述：${gift.description ?? '无'}。标签：${gift.tags.length ? gift.tags.join('、') : '无'}。\n请像普通面对面聊天一样先输出${gift.charName}自然、具体的反应。然后必须提出一个仅针对该 giftId 的 resolve_gift op，reaction 只能是 special、liked、disliked、neutral 四者之一。不要输出 offer_gift，不要重复送礼，不要声称库存、关系数值、时间或其他状态已经改变；除 resolve_gift 外不要提出任何状态操作。`;
    } },
    { id: 'collection_context', role: 'system', priority: 89, order: 16, tasks: ['narrate_main'], build: (facts) => {
      const collection = factsOf(facts).collectionContext;
      if (!collection) return null;
      return `[收藏出示上下文]\n玩家正在向对方出示收藏条目「${collection.title}」（收藏 id：${collection.entryId}，物品 id：${collection.itemId}）。展示描述：${collection.description || '无'}。规则标签：${collection.tags.length ? collection.tags.join('、') : '无'}。\n请像普通面对面聊天一样描述角色看到这件收藏后的自然反应。出示不等于重新获得、赠送或消耗物品；不要提出 give_item 或 offer_gift，也不要声称库存、关系数值、时间或其他状态已经改变。`;
    } },
  ];
}
