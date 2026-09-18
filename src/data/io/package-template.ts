import JSZip from 'jszip';
import type { EventPackage } from '../content';
import { createWorldPackage } from './world-package';
import { exportEventPackage, exportWorldPackage } from './zip';

const TEMPLATE_TIMESTAMP = '2000-01-01T00:00:00.000Z';

const WORLD_TEMPLATE_README = `# Tokimeki 世界包模板

1. 编辑根目录的 world.json，不要修改 manifest.json 中的 type 和 schemaVersion。
2. JSON 不支持注释、尾逗号或未加双引号的字段名。
3. id 是引用键。修改地点、角色、物品或事件 id 时，要同步修改所有引用它的字段。
4. 修改完成后，把 manifest.json、world.json 和 README.md 直接压在 zip 根目录；不要在外面多套一层文件夹。
5. 回到 Tokimeki 的“终端 → 存档 → 世界包”，选择“导入并合并世界包”进行检查。

模板包含一个地点、一个正式角色、一个物品、一个世界书条目和一个事件。可以删除不需要的示例，但不能留下指向已删除 id 的引用。
图片请使用 AssetRef 外链 URL，或先在应用中配置后导出含图片的世界包。不要把 base64、API key 或 Provider 配置写进 world.json。
`;

const EVENT_TEMPLATE_README = `# Tokimeki 事件包模板

1. 编辑根目录的 events.json，不要修改 manifest.json 中的 type 和 schemaVersion。
2. JSON 不支持注释、尾逗号或未加双引号的字段名。
3. 修改完成后，把 manifest.json、events.json 和 README.md 直接压在 zip 根目录；不要在外面多套一层文件夹。
4. 回到 Tokimeki 的“终端 → 事件包”，选择“导入事件包”进行检查。

模板事件的 trigger 为空，因此不依赖特定地点或角色。需要限制触发条件时，可加入：
- nodeIds：地点 id 数组
- slotIds：时段 id 数组
- charIds：参与角色 id 数组，最多 3 个
- scope：formal 或 peripheral

可继续加入 when、stageRange、tension、once、cooldownDays 和 weight。事件必须至少提供 content、prompt 或 choices 之一。
事件中的 ops 仍会经过应用白名单校验；不要放入 API key 或 Provider 配置。
`;

async function withReadme(blob: Blob, readme: string): Promise<Blob> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  zip.file('README.md', readme);
  return zip.generateAsync({ type: 'blob' });
}

export async function createWorldPackageTemplate(): Promise<Blob> {
  const pack = createWorldPackage({
    id: 'my-world-package',
    name: '我的世界包',
    map: {
      regions: { 'sample-region': { id: 'sample-region', name: '示例区域' } },
      nodes: {
        'sample-square': {
          id: 'sample-square',
          name: '示例广场',
          regionId: 'sample-region',
          kind: ['outdoor'],
          description: '在这里填写地点说明。',
          worldbookIds: ['sample-setting'],
          discovered: false,
          visitCount: 0,
          memories: [],
          pos: { x: 500, y: 350 },
        },
      },
      edges: [],
      view: { mode: 'graph', size: { w: 1000, h: 700 } },
    },
    characters: {
      'sample-character': {
        id: 'sample-character',
        name: '示例角色',
        tier: 'formal',
        card: {
          description: '在这里填写角色外貌、身份和背景。',
          personality: '在这里填写角色性格。',
          firstMes: '很高兴见到你。',
        },
        visuals: { portraits: [] },
        homeNodeId: 'sample-square',
        worldbookIds: ['sample-setting'],
        source: 'user',
      },
    },
    npcs: {},
    npcTemplates: {},
    items: {
      'sample-flower': {
        id: 'sample-flower',
        name: '示例花朵',
        tags: ['flower'],
        description: '一个可替换或删除的示例物品。',
        stackable: true,
        giftable: true,
      },
    },
    eventDefs: {
      'sample-meeting': {
        id: 'sample-meeting',
        title: '示例相遇',
        trigger: { nodeIds: ['sample-square'], charIds: ['sample-character'], scope: 'formal' },
        once: true,
        weight: 1,
        content: '你在示例广场遇见了示例角色。',
      },
    },
    worldbooks: [{
      id: 'sample-setting',
      name: '示例世界设定',
      content: '在这里填写会注入提示词的世界设定。',
      keys: ['示例广场'],
      enabled: true,
      priority: 50,
    }],
    characterCards: [{
      id: 'sample-character',
      name: '示例角色',
      description: '在这里填写角色外貌、身份和背景。',
      personality: '在这里填写角色性格。',
      firstMes: '很高兴见到你。',
      updatedAt: TEMPLATE_TIMESTAMP,
    }],
  });
  return withReadme(await exportWorldPackage(pack), WORLD_TEMPLATE_README);
}

export async function createEventPackageTemplate(): Promise<Blob> {
  const pack: EventPackage = {
    id: 'my-event-package',
    name: '我的事件包',
    events: [{
      id: 'sample-event',
      title: '示例事件',
      trigger: {},
      once: true,
      weight: 1,
      content: '在这里填写事件发生时显示的确定性文字。',
    }],
  };
  return withReadme(await exportEventPackage(pack), EVENT_TEMPLATE_README);
}
