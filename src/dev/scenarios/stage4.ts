import { CURRENT_SCHEMA_VERSION, DEFAULT_ACTION_COSTS, DEFAULT_SLOT_DEFS, createDefaultMap, type SaveFile } from '../../data/schema/save';
import type { ScenarioDefinition } from './seeder';

export function createStage4EncounterScenario(): ScenarioDefinition {
  return {
    id: 'stage4-encounter-demo',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    create: (): SaveFile => {
      const map = createDefaultMap();
      map.nodes.docks = {
        id: 'docks', name: '西码头', regionId: 'start-region', kind: ['outdoor'], description: '潮湿的木栈桥，今天有人在这里等你。',
        worldbookIds: [], openSlots: ['noon'], discovered: true, visitCount: 0, memories: [], pos: { x: 760, y: 350 },
      };
      map.edges.push({ from: 'start', to: 'docks', travelSlots: 1 });
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        meta: { id: 'stage4-encounter-demo', title: '阶段 4 相遇测试', createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z', appVersion: '0.0.1' },
        config: {
          calendar: { slots: [...DEFAULT_SLOT_DEFS], daysPerWeek: 7, weekdayNames: ['一', '二', '三', '四', '五', '六', '日'], preset: 'standard', unlimitedSlots: false },
          actionCosts: { ...DEFAULT_ACTION_COSTS }, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12,
          encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 1, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} },
        },
        world: {
          clock: { day: 3, slotId: 'noon' }, slotsUsedToday: 0,
          player: {
            name: '测试玩家', nodeId: 'start', stats: {}, flags: {},
            inventory: [
              { itemId: 'white-flower', count: 1, gotDay: 3, gotNodeId: 'start' },
              { itemId: 'lemon-candy', count: 1, gotDay: 3, gotNodeId: 'start' },
              { itemId: 'metal-charm', count: 1, gotDay: 3, gotNodeId: 'start' },
            ],
          }, stats: {}, flags: {}, items: {
            'white-flower': { id: 'white-flower', name: '白色小花', tags: ['flower'], description: '塞伊尔的特殊礼物测试项。', stackable: true, giftable: true },
            'lemon-candy': { id: 'lemon-candy', name: '柠檬糖', tags: ['sweet'], description: '凛的特殊礼物测试项。', stackable: true, giftable: true },
            'metal-charm': { id: 'metal-charm', name: '金属护符', tags: ['metal'], description: '用于测试被角色拒绝的礼物。', stackable: true, giftable: true },
          }, relations: {}, diary: [], settlements: [], map,
          characters: {
            seir: { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '在码头等人的青年。', personality: '安静而敏锐。' }, visuals: { portraits: [], accentColor: '#315efb' }, homeNodeId: 'start', giftPrefs: { likeTags: ['flower'], dislikeTags: ['metal'], specialItems: { 'white-flower': 4 } }, schedule: { grid: { '2:noon': { nodeId: 'docks', activity: '靠着栏杆等人' } }, overrides: {} } },
            rin: { id: 'rin', name: '凛', tier: 'formal', card: { description: '偶尔来码头买花的女孩。', personality: '爽朗。' }, visuals: { portraits: [], accentColor: '#d97706' }, homeNodeId: 'start', giftPrefs: { likeTags: ['sweet'], dislikeTags: ['metal'], specialItems: { 'lemon-candy': 3 } }, schedule: { grid: { '2:noon': { nodeId: 'docks', activity: '在摊位旁挑花' } }, overrides: {} } },
          },
          npcs: { 'vendor-1': { id: 'vendor-1', name: '摊主', tier: 'semi', facts: ['卖花'], tags: ['merchant'], homeNodeId: 'docks', lightMemory: [] } },
          npcTemplates: {}, encounterLog: [], topicTrees: {}, usedTopics: {}, appointments: [], giftHistory: [], collection: [],
        },
      };
    },
  };
}
