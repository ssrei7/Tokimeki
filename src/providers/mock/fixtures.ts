import { TASK_IDS, type TaskId } from '../types';

export const MOCK_FIXTURE_IDS = [
  'perfect',
  'malformed',
  'fenced',
  'unregistered-op',
  'clamp-exceeded',
  'empty-ops',
  'interrupted-stream',
  'gift-reaction',
] as const;

export type MockFixtureId = typeof MOCK_FIXTURE_IDS[number];

export interface MockFixture {
  id: MockFixtureId;
  chunks: readonly string[];
  errorAfterChunks?: string;
}

function repliesForTask(taskId: TaskId): Record<MockFixtureId, MockFixture> {
  const prefix = `[mock:${taskId}]`;
  if (taskId === 'topic_tree') return topicTreeFixtures();
  if (taskId === 'summarize_memory') return memorySummaryFixtures();
  if (taskId === 'world_morning') return morningFixtures();
  if (taskId === 'workshop_draft') return workshopDraftFixtures();
  return {
    perfect: {
      id: 'perfect',
      chunks: [
        `${prefix} 他递给你一朵白色小花。\n<ops>\n`,
        '[{"op":"give_item","id":"white-flower"},',
        '{"op":"add_stat","target":"player","key":"custom-reputation","delta":2}]\n</ops>',
      ],
    },
    malformed: {
      id: 'malformed',
      chunks: [`${prefix} 正文应当保留。\n<ops>\n[{"op":"give_item"\n</ops>`],
    },
    fenced: {
      id: 'fenced',
      chunks: [`${prefix} 围栏外的正文。\n\`\`\`xml\n<ops>\n[]\n</ops>\n\`\`\``],
    },
    'unregistered-op': {
      id: 'unregistered-op',
      chunks: [`${prefix} 未注册项不应阻断合法项。\n<ops>\n[{"op":"teleport_anywhere","nodeId":"moon"},{"op":"set_flag","key":"mock-valid","value":true}]\n</ops>`],
    },
    'clamp-exceeded': {
      id: 'clamp-exceeded',
      chunks: [`${prefix} 变更幅度需要限幅。\n<ops>\n[{"op":"add_stat","target":"player","key":"custom-reputation","delta":100}]\n</ops>`],
    },
    'empty-ops': {
      id: 'empty-ops',
      chunks: [`${prefix} 这一回合只有叙述。\n<ops>\n[]\n</ops>`],
    },
    'interrupted-stream': {
      id: 'interrupted-stream',
      chunks: [`${prefix} 流式正文已经开始`, '，但连接在结束前中断。'],
      errorAfterChunks: `Mock stream interrupted for ${taskId}`,
    },
    'gift-reaction': {
      id: 'gift-reaction',
      chunks: [`${prefix} [说话人:塞伊尔] 谢谢你送来的礼物，我会好好珍惜。\n<ops>\n[{"op":"resolve_gift","giftId":"gift-placeholder","reaction":"liked"}]\n</ops>`],
    },
  };
}

function workshopDraftFixtures(): Record<MockFixtureId, MockFixture> {
  const pack = JSON.stringify({
    manifest: { type: 'workshop', packageVersion: 1, runtimeVersion: 1, id: 'mock.generated-app', name: 'Mock 草稿', author: 'Mock Provider', version: '1.0.0', permissions: [{ capability: 'app.local-state' }] },
    app: { entryPageId: 'home', pages: [{ id: 'home', title: 'Mock 草稿', components: [{ kind: 'text', text: '这是一次显式生成的本地草稿。' }, { kind: 'input', key: 'note', label: '本地备注', maxLength: 200 }, { kind: 'button', label: '标记完成', action: { type: 'set-local', key: 'done', value: true } }] }] },
    rules: { rules: [] },
  });
  return Object.fromEntries(MOCK_FIXTURE_IDS.map((id) => {
    const chunks = id === 'malformed' ? ['{'] : id === 'fenced' ? [`\`\`\`json\n${pack}\n\`\`\``] : id === 'interrupted-stream' ? ['{"manifest":'] : [pack];
    return [id, { id, chunks, ...(id === 'interrupted-stream' ? { errorAfterChunks: 'Mock workshop draft interrupted' } : {}) }];
  })) as unknown as Record<MockFixtureId, MockFixture>;
}

function memorySummaryFixtures(): Record<MockFixtureId, MockFixture> {
  return {
    perfect: { id: 'perfect', chunks: ['[{"target":"seir","text":"玩家喜欢在下雨天听海浪声。","type":"preference","importance":"normal"}]'] },
    malformed: { id: 'malformed', chunks: ['['] },
    fenced: { id: 'fenced', chunks: ['```json\n[]\n```'] },
    'unregistered-op': { id: 'unregistered-op', chunks: ['[{"target":"seir","text":"玩家曾在码头答应下次再见。","type":"promise","importance":"high"}]'] },
    'clamp-exceeded': { id: 'clamp-exceeded', chunks: ['[{"target":"seir","text":"可保留的整理结果。","type":"interaction","importance":"critical"},{"target":"seir","text":"第二条。","type":"event","importance":"low"},{"target":"seir","text":"第三条。","type":"observation","importance":"normal"}]'] },
    'empty-ops': { id: 'empty-ops', chunks: ['[]'] },
    'interrupted-stream': { id: 'interrupted-stream', chunks: ['[{"target":"seir"'], errorAfterChunks: 'Mock memory summary interrupted' },
    'gift-reaction': { id: 'gift-reaction', chunks: ['[]'] },
  };
}

function morningFixtures(): Record<MockFixtureId, MockFixture> {
  const entries = JSON.stringify({
    news: [
      { category: 'lead', title: '码头边的风声', body: '西码头今天仍在中午开放，那里有值得留意的动静。', eventText: '有人在木栈桥下留下了一张新的告示。', nodeId: 'docks', slotId: 'noon' },
      { category: 'ambience', title: '潮气沿街', body: '海风把潮湿的气息带进了起点街区。' },
      { category: 'ad', entryKind: 'job', title: '临时帮工', body: '有人在码头附近寻找短时帮工，前往地点即可查看。', nodeId: 'docks', expiresDay: 5 },
    ],
    weather: { id: 'drizzle', label: '细雨', tags: ['rain', 'cold'] },
    npcMoves: [{ charId: 'vendor-1', slotId: 'noon', nodeId: 'docks', note: '在摊位后整理货物' }],
    worldNote: '港口的钟声比往常晚了一刻。',
  });
  return Object.fromEntries(MOCK_FIXTURE_IDS.map((id) => [id, { id, chunks: [id === 'malformed' ? '[' : id === 'fenced' ? `\`\`\`json\n${entries}\n\`\`\`` : entries] }])) as unknown as Record<MockFixtureId, MockFixture>;
}

function topicTreeFixtures(): Record<MockFixtureId, MockFixture> {
  const tree = {
    charId: 'seir', nodeId: 'docks', generatedDay: 3,
    topics: [
      { id: 'weather', label: '聊聊天气', kind: 'daily', terminal: false, response: '[说话人:塞伊尔] 今天的风比昨天温柔。', usedResponse: '[说话人:塞伊尔] 嗯，还是老样子。', generatedDay: 3 },
      { id: 'music', label: '问他的音乐', kind: 'daily', terminal: false, response: '[说话人:塞伊尔] 我最近在练一段新的旋律。', usedResponse: '[说话人:塞伊尔] 之前说过了。', generatedDay: 3 },
      { id: 'past', label: '问起过去', kind: 'story', terminal: false, require: 'flags.met_docks', response: '[说话人:塞伊尔] 那是很久以前的事了。', usedResponse: '[说话人:塞伊尔] 这件事我们已经聊过。', unlocks: ['promise'], generatedDay: 3 },
      { id: 'promise', label: '约下次见面', kind: 'story', terminal: true, require: 'flags.met_docks', response: '[说话人:塞伊尔] 好，下次还在这里见。', generatedDay: 3 },
    ],
  };
  return {
    perfect: { id: 'perfect', chunks: [JSON.stringify(tree)] },
    malformed: { id: 'malformed', chunks: ['{"topics": ['] },
    fenced: { id: 'fenced', chunks: [`\`\`\`json\n${JSON.stringify(tree)}\n\`\`\``] },
    'unregistered-op': { id: 'unregistered-op', chunks: [JSON.stringify(tree)] },
    'clamp-exceeded': { id: 'clamp-exceeded', chunks: [JSON.stringify(tree)] },
    'empty-ops': { id: 'empty-ops', chunks: [JSON.stringify(tree)] },
    'interrupted-stream': { id: 'interrupted-stream', chunks: ['{"charId":"seir","topics":'], errorAfterChunks: 'Mock topic tree interrupted' },
    'gift-reaction': { id: 'gift-reaction', chunks: [JSON.stringify(tree)] },
  };
}

export const MOCK_FIXTURES: Record<TaskId, Record<MockFixtureId, MockFixture>> = Object.fromEntries(
  TASK_IDS.map((taskId) => [taskId, repliesForTask(taskId)]),
) as Record<TaskId, Record<MockFixtureId, MockFixture>>;

export function getMockFixture(taskId: TaskId, fixtureId: string): MockFixture {
  const fixture = MOCK_FIXTURES[taskId][fixtureId as MockFixtureId];
  if (!fixture) throw new Error(`Unknown mock fixture: ${taskId}/${fixtureId}`);
  return fixture;
}

export function adaptTopicTreeFixture(fixture: MockFixture, messages: readonly { role: string; content: string }[]): MockFixture {
  const parsed = [...messages].reverse().map((message) => {
    try { return JSON.parse(message.content) as { day?: unknown; node?: { id?: unknown }; character?: { id?: unknown; name?: unknown } }; } catch { return undefined; }
  }).find((candidate) => candidate?.character?.id && candidate?.node?.id);
  try {
    const charId = typeof parsed?.character?.id === 'string' ? parsed.character.id : undefined;
    const charName = typeof parsed?.character?.name === 'string' ? parsed.character.name : undefined;
    const nodeId = typeof parsed?.node?.id === 'string' ? parsed.node.id : undefined;
    const day = typeof parsed?.day === 'number' ? parsed.day : undefined;
    if (!charId || !charName || !nodeId || !day) return fixture;
    return { ...fixture, chunks: fixture.chunks.map((chunk) => chunk.replaceAll('"seir"', JSON.stringify(charId)).replaceAll('"docks"', JSON.stringify(nodeId)).replaceAll('"generatedDay":3', `"generatedDay":${day}`).replaceAll('塞伊尔', charName)) };
  } catch {
    return fixture;
  }
}

export function adaptMemoryFixture(fixture: MockFixture, messages: readonly { role: string; content: string }[]): MockFixture {
  const system = messages.find((message) => message.content.includes('target 必须是'))?.content;
  const target = system?.match(/target 必须是\s+([A-Za-z0-9_-]+)/)?.[1];
  if (!target) return fixture;
  return { ...fixture, chunks: fixture.chunks.map((chunk) => chunk.replaceAll('"seir"', JSON.stringify(target))) };
}
