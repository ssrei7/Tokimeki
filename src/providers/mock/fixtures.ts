import { TASK_IDS, type TaskId } from '../types';

export const MOCK_FIXTURE_IDS = [
  'perfect',
  'malformed',
  'fenced',
  'unregistered-op',
  'clamp-exceeded',
  'empty-ops',
  'interrupted-stream',
] as const;

export type MockFixtureId = typeof MOCK_FIXTURE_IDS[number];

export interface MockFixture {
  id: MockFixtureId;
  chunks: readonly string[];
  errorAfterChunks?: string;
}

function repliesForTask(taskId: TaskId): Record<MockFixtureId, MockFixture> {
  const prefix = `[mock:${taskId}]`;
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
