import { type Migration } from './types';

const defaultConfig = {
  calendar: {
    slots: [{ id: 'morning', name: '早晨', order: 0 }],
    daysPerWeek: 7,
    weekdayNames: ['一', '二', '三', '四', '五', '六', '日'],
    preset: 'standard' as const,
    unlimitedSlots: false,
  },
  actionCosts: {},
  axisDefs: [],
  stageRules: [],
  showNumbers: false,
  hiddenTopicStyle: 'hide' as const,
  realTimeAwareness: false,
  opsLimitPerTurn: 12,
};

export const migrateV0ToV1: Migration = (input) => {
  const old = (input ?? {}) as Record<string, unknown>;
  const oldMeta = (old.meta ?? {}) as Record<string, unknown>;
  const oldWorld = (old.world ?? {}) as Record<string, unknown>;
  const oldPlayer = (oldWorld.player ?? old.player ?? {}) as Record<string, unknown>;
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    meta: {
      id: typeof oldMeta.id === 'string' ? oldMeta.id : 'migrated-save',
      title: typeof oldMeta.title === 'string' ? oldMeta.title : 'Migrated Save',
      createdAt: typeof oldMeta.createdAt === 'string' ? oldMeta.createdAt : now,
      updatedAt: now,
      appVersion: typeof oldMeta.appVersion === 'string' ? oldMeta.appVersion : '0.0.1',
    },
    config: { ...defaultConfig, ...(old.config as object | undefined) },
    world: {
      clock: {
        day: typeof (oldWorld.clock as Record<string, unknown> | undefined)?.day === 'number'
          ? (oldWorld.clock as Record<string, number>).day
          : 1,
        slotId: typeof (oldWorld.clock as Record<string, unknown> | undefined)?.slotId === 'string'
          ? (oldWorld.clock as Record<string, string>).slotId
          : 'morning',
      },
      player: {
        name: typeof oldPlayer.name === 'string' ? oldPlayer.name : 'Player',
        ...(typeof oldPlayer.persona === 'string' ? { persona: oldPlayer.persona } : {}),
        nodeId: typeof oldPlayer.nodeId === 'string' ? oldPlayer.nodeId : 'start',
        stats: isRecordOfNumbers(oldPlayer.stats) ? oldPlayer.stats : {},
        flags: isRecordOfBooleans(oldPlayer.flags) ? oldPlayer.flags : {},
        inventory: Array.isArray(oldPlayer.inventory) ? oldPlayer.inventory : [],
      },
    },
  };
};

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'number');
}

function isRecordOfBooleans(value: unknown): value is Record<string, boolean> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'boolean');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
