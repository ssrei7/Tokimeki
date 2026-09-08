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
  const context = messages.at(-1)?.content;
  if (!context) return fixture;
  try {
    const parsed = JSON.parse(context) as { day?: unknown; node?: { id?: unknown }; character?: { id?: unknown; name?: unknown } };
    const charId = typeof parsed.character?.id === 'string' ? parsed.character.id : undefined;
    const charName = typeof parsed.character?.name === 'string' ? parsed.character.name : undefined;
    const nodeId = typeof parsed.node?.id === 'string' ? parsed.node.id : undefined;
    const day = typeof parsed.day === 'number' ? parsed.day : undefined;
    if (!charId || !charName || !nodeId || !day) return fixture;
    return { ...fixture, chunks: fixture.chunks.map((chunk) => chunk.replaceAll('"seir"', JSON.stringify(charId)).replaceAll('"docks"', JSON.stringify(nodeId)).replaceAll('"generatedDay":3', `"generatedDay":${day}`).replaceAll('塞伊尔', charName)) };
  } catch {
    return fixture;
  }
}
