import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SaveFileSchema } from '../src/data/schema/save';
import { migrateSave } from '../src/data/migrations';
import { UnsupportedSchemaVersionError } from '../src/data/migrations/types';
import fixtureV1 from './fixtures/save-v1.json';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

const fixtureV0 = {
  schemaVersion: 0,
  meta: { id: 'old-save', title: '旧存档' },
  player: { name: '小明', nodeId: 'start', stats: { money: 10 }, flags: { intro: true }, inventory: [] },
};

describe('save migrations', () => {
  it('migrates the v0 fixture through every version to a valid current save', () => {
    const migrated = migrateSave(fixtureV0);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.player.name).toBe('小明');
    expect(migrated.world.player.stats.money).toBe(10);
    expect(SaveFileSchema.safeParse(migrated).success).toBe(true);
  });

  it('treats a missing schemaVersion as v0', () => {
    const migrated = migrateSave({ player: { name: '无版本', nodeId: 'start' } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.player.name).toBe('无版本');
  });

  it('migrates a v1 save through v4 without changing existing player state', () => {
    const migrated = migrateSave(fixtureV1);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.player.stats.money).toBe(10);
    expect(migrated.world.stats).toEqual({});
    expect(migrated.world.flags).toEqual({});
    expect(migrated.world.items).toEqual({});
    expect(migrated.world.relations).toEqual({});
    expect(migrated.world.slotsUsedToday).toBe(0);
    expect(migrated.world.diary).toEqual([]);
    expect(migrated.world.settlements).toEqual([]);
    expect(migrated.world.map.nodes.start.discovered).toBe(true);
    expect(migrated.world.characters).toEqual({});
    expect(migrated.world.npcs).toEqual({});
    expect(migrated.world.npcTemplates).toEqual({});
    expect(migrated.world.encounterLog).toEqual([]);
    expect(migrated.world.eventDefs).toEqual({});
    expect(migrated.world.director).toEqual({ scheduled: [], lastFiredDay: {}, tension: 0 });
    expect(migrated.world.eventHistory).toEqual([]);
  });

  it('rejects saves from a newer schema', () => {
    expect(() => migrateSave({ schemaVersion: 999 })).toThrow(UnsupportedSchemaVersionError);
  });

  it('migrates a v22 world into the local event state without changing other facts', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v22-events', title: 'v22 events' }));
    const legacy = structuredClone(source) as Record<string, unknown>;
    legacy.schemaVersion = 22;
    const world = legacy.world as Record<string, unknown>;
    delete world.eventDefs;
    delete world.director;
    delete world.eventHistory;
    const migrated = migrateSave(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.player.name).toBe(source.world.player.name);
    expect(migrated.world.eventDefs).toEqual({});
    expect(migrated.world.director).toEqual({ scheduled: [], lastFiredDay: {}, tension: 0 });
    expect(migrated.world.eventHistory).toEqual([]);
  });

  it('migrates v23 event history into the replay metadata schema', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v23-history', title: 'v23 history' }));
    const legacy = structuredClone(source) as Record<string, unknown>;
    legacy.schemaVersion = 23;
    const world = legacy.world as Record<string, unknown>;
    world.eventHistory = [{ id: 'event-history-1', eventId: 'e1', title: '旧事件', day: 2, slotId: 'noon', nodeId: 'start', charIds: [], scope: 'formal', content: '旧叙述' }];
    const migrated = migrateSave(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.eventHistory[0]).toMatchObject({ eventId: 'e1', content: '旧叙述' });
    expect(migrated.world.eventHistory[0].choice).toBeUndefined();
  });

  it('rejects malformed migrated data with field-level validation errors', () => {
    expect(() => migrateSave({ schemaVersion: CURRENT_SCHEMA_VERSION, world: {} })).toThrow();
  });

  it('expands the legacy one-slot calendar when migrating to v5', () => {
    const migrated = migrateSave({
      schemaVersion: 4,
      meta: { id: 'legacy-calendar', title: 'Legacy calendar', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一', '二', '三', '四', '五', '六', '日'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 },
      world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '旧玩家', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: { regions: { 'start-region': { id: 'start-region', name: '起点街区' } }, nodes: { start: { id: 'start', name: '起点街区', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 500, y: 350 } } }, edges: [], view: { mode: 'graph', size: { w: 1000, h: 700 } } }, diary: [], settlements: [] },
    });
    expect(migrated.config.calendar.slots.map((slot) => slot.id)).toHaveLength(6);
    expect(migrated.config.calendar.slots.map((slot) => slot.id)).toContain('evening');
  });

  it('repairs an already-v5 legacy save without changing its schema version', () => {
    const source = migrateSave({
      schemaVersion: 4,
      meta: { id: 'legacy-v5-calendar', title: 'Legacy v5 calendar', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一', '二', '三', '四', '五', '六', '日'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12 },
      world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '旧玩家', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: { regions: { 'start-region': { id: 'start-region', name: '起点街区' } }, nodes: { start: { id: 'start', name: '起点街区', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 500, y: 350 } } }, edges: [], view: { mode: 'graph', size: { w: 1000, h: 700 } } }, diary: [], settlements: [] },
    });
    const repaired = migrateSave({ ...source, config: { ...source.config, calendar: { ...source.config.calendar, slots: [source.config.calendar.slots[0]] } } });
    expect(repaired.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(repaired.config.calendar.slots).toHaveLength(6);
  });

  it('migrates v5 persona text without dropping it and accepts a persona binding', () => {
    const migrated = migrateSave({
      schemaVersion: 5,
      meta: { id: 'persona-save', title: 'Persona save', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
      world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '旧玩家', persona: '沉默的旅行者', personaId: 'mask-1', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: { regions: { 'start-region': { id: 'start-region', name: '起点街区' } }, nodes: { start: { id: 'start', name: '起点街区', regionId: 'start-region', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 500, y: 350 } } }, edges: [], view: { mode: 'graph', size: { w: 1000, h: 700 } } }, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [] },
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.player.persona).toBe('沉默的旅行者');
    expect(migrated.world.player.personaId).toBe('mask-1');
  });

  it('migrates v6 map nodes while preserving existing node data', () => {
    const migrated = migrateSave({
      schemaVersion: 6,
      meta: { id: 'scene-save', title: 'Scene save', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
      world: { clock: { day: 1, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '玩家', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: { regions: { start: { id: 'start', name: '起点' } }, nodes: { start: { id: 'start', name: '起点', regionId: 'start', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 1, y: 2 } } }, edges: [], view: { mode: 'graph', size: { w: 100, h: 100 } } }, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [] },
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.map.nodes.start.name).toBe('起点');
    expect(migrated.world.map.nodes.start.sceneBackground).toBeUndefined();
  });

  it('migrates v7 saves with empty TopicTree state', () => {
    const migrated = migrateSave({
      schemaVersion: 7,
      meta: { id: 'topic-save', title: 'Topic save', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
      world: { clock: { day: 2, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '玩家', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: {}, map: { regions: { start: { id: 'start', name: '起点' } }, nodes: { start: { id: 'start', name: '起点', regionId: 'start', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 1, y: 2 } } }, edges: [], view: { mode: 'graph', size: { w: 100, h: 100 } } }, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [] },
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.topicTrees).toEqual({});
    expect(migrated.world.usedTopics).toEqual({});
    expect(migrated.world.appointments).toEqual([]);
  });

  it('migrates v8 relation memories into full relationship state defaults', () => {
    const migrated = migrateSave({
      schemaVersion: 8,
      meta: { id: 'relation-save', title: 'Relation save', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', appVersion: '0.0.1' },
      config: { calendar: { slots: [{ id: 'morning', name: '早晨', order: 0 }], daysPerWeek: 7, weekdayNames: ['一'], preset: 'standard', unlimitedSlots: false }, actionCosts: {}, axisDefs: [], stageRules: [], showNumbers: false, hiddenTopicStyle: 'hide', realTimeAwareness: false, opsLimitPerTurn: 12, encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} } },
      world: { clock: { day: 2, slotId: 'morning' }, slotsUsedToday: 0, player: { name: '玩家', nodeId: 'start', stats: {}, flags: {}, inventory: [] }, stats: {}, flags: {}, items: {}, relations: { rin: { memories: [{ id: 'm1', text: '旧记忆', day: 1 }] } }, map: { regions: { start: { id: 'start', name: '起点' } }, nodes: { start: { id: 'start', name: '起点', regionId: 'start', kind: ['outdoor'], worldbookIds: [], discovered: true, visitCount: 0, memories: [], pos: { x: 1, y: 2 } } }, edges: [], view: { mode: 'graph', size: { w: 100, h: 100 } } }, diary: [], settlements: [], characters: {}, npcs: {}, npcTemplates: {}, encounterLog: [], topicTrees: {}, usedTopics: {}, appointments: [] },
    });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.relations.rin).toMatchObject({ axes: {}, knots: [], memories: [{ id: 'm1', text: '旧记忆', day: 1 }] });
  });

  it('migrates v9 encounter logs without changing existing entries', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v9-departure', title: 'v9 departure' }));
    const entry = { id: 'encounter-1', day: 1, slotId: 'morning', nodeId: 'start', characterIds: [], trigger: 'enter' as const, scope: 'formal' as const, outcome: 'continued' as const };
    const migrated = migrateSave({ ...source, schemaVersion: 9, world: { ...source.world, encounterLog: [entry] } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.encounterLog[0]).toEqual(entry);
  });

  it('migrates v14 memories with safe metadata defaults and preserves provenance', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'memory-migration', title: 'Memory migration' }));
    const migrated = migrateSave({ ...source, schemaVersion: 14, world: { ...source.world, relations: { seir: { memories: [{ id: 'm1', text: '旧记忆', day: 1, sourceChatMessageIndex: 4 }] } } } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.relations.seir.memories[0]).toMatchObject({ type: 'interaction', importance: 'normal', archived: false, inject: true, source: { kind: 'chat', chatMessageIndex: 4 } });
    expect(migrated.world.relations.seir.memories[0].sourceChatMessageIndex).toBe(4);
    expect(migrated.world.relations.seir.memories[0].sourceChatMessageIndices).toEqual([4]);
    expect(migrated.world.relations.seir.memories[0].source.chatMessageIndices).toEqual([4]);
  });

  it('migrates v16 worlds with an empty morning brief list', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'morning-migration', title: 'Morning migration' }));
    const world = { ...source.world } as Record<string, unknown>;
    delete world.morningBriefs;
    const migrated = migrateSave({ ...source, schemaVersion: 16, world });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.morningBriefs).toEqual([]);
  });

  it('migrates v17 worlds with an empty hook pool', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'hook-migration', title: 'Hook migration' }));
    const world = { ...source.world } as Record<string, unknown>;
    delete world.hooks;
    const migrated = migrateSave({ ...source, schemaVersion: 17, world });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.hooks).toEqual([]);
  });

  it('migrates v18 worlds with an empty morning update list', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'morning-update-migration', title: 'Morning update migration' }));
    const world = { ...source.world } as Record<string, unknown>;
    delete world.morningUpdates;
    const migrated = migrateSave({ ...source, schemaVersion: 18, world });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.morningUpdates).toEqual([]);
  });

  it('migrates v19 worlds to typed morning advertisement metadata', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'ad-migration', title: 'Ad migration' }));
    const migrated = migrateSave({ ...source, schemaVersion: 19 });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.morningBriefs).toEqual([]);
  });

  it('migrates v20 worlds to lead event text metadata', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'event-text-migration', title: 'Event text migration' }));
    const migrated = migrateSave({ ...source, schemaVersion: 20 });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.hooks).toEqual([]);
  });

  it('migrates v21 saves with the default morning presentation style', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'morning-style-migration', title: 'Morning style migration' }));
    const { morningStyle: _morningStyle, ...legacyConfig } = source.config;
    const migrated = migrateSave({ ...source, schemaVersion: 21, config: legacyConfig });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.config.morningStyle).toBe('newspaper');
  });

  it('preserves an explicitly selected morning presentation style', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'morning-style-preserve', title: 'Morning style preserve' }));
    const migrated = migrateSave({ ...source, schemaVersion: 21, config: { ...source.config, morningStyle: 'tavern' } });
    expect(migrated.config.morningStyle).toBe('tavern');
  });

  it('migrates v10 worlds with an empty gift history', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v10-gifts', title: 'v10 gifts' }));
    const migrated = migrateSave({ ...source, schemaVersion: 10, world: { ...source.world, giftHistory: undefined } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.giftHistory).toEqual([]);
  });

  it('migrates v11 gift history entries to resolved status', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v11-gifts', title: 'v11 gifts' }));
    const migrated = migrateSave({ ...source, schemaVersion: 11, world: { ...source.world, giftHistory: [{ id: 'gift-1', day: 1, slotId: 'morning', nodeId: 'start', charId: 'seir', itemId: 'flower', reaction: 'liked', accepted: true, score: 1, specialItem: false, matchedLikeTags: ['flower'], matchedDislikeTags: [] }] } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.giftHistory[0]).toMatchObject({ status: 'resolved', reaction: 'liked', accepted: true });
  });

  it('migrates legacy inventory entries into collection records', () => {
    const source = seedScenario(createCurrentSaveScenario({ id: 'v12-collection', title: 'v12 collection' }));
    const { collection: _collection, ...legacyWorld } = source.world;
    const migrated = migrateSave({ ...source, schemaVersion: 12, world: { ...legacyWorld, items: { keepsake: { id: 'keepsake', name: '旧车票', tags: ['memory'], description: '褪色的车票' } }, player: { ...legacyWorld.player, inventory: [{ itemId: 'keepsake', count: 1, gotDay: 2, gotNodeId: 'start' }] }, collection: undefined } });
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.collection[0]).toMatchObject({ itemId: 'keepsake', title: '旧车票', description: '褪色的车票', tags: ['memory'], day: 2, nodeId: 'start' });
  });

  it('migrates v13 saves to the current schema without dropping existing memories', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'migration-v13', title: 'Migration v13' }));
    const legacy = { ...save, schemaVersion: 13, world: { ...save.world, relations: { ...save.world.relations, seir: { ...save.world.relations.seir, memories: [{ id: 'memory-1', text: '保留', day: 1 }] } } } };
    const migrated = migrateSave(legacy);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.world.relations.seir.memories[0]).toMatchObject({ id: 'memory-1', text: '保留' });
  });
});
