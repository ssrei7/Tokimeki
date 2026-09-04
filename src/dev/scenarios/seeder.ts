import { exportSaveZip } from '../../data/io/zip';
import { migrateSave } from '../../data/migrations';
import { CURRENT_SCHEMA_VERSION, DEFAULT_ACTION_COSTS, DEFAULT_SLOT_DEFS, type SaveFile } from '../../data/schema/save';

export interface ScenarioDefinition {
  id: string;
  schemaVersion: number;
  create(): unknown;
  extras?: Record<string, unknown>;
}

export interface CurrentSaveScenarioOptions {
  id: string;
  title: string;
  playerName?: string;
  nodeId?: string;
  day?: number;
  slotId?: string;
  stats?: Record<string, number>;
  flags?: Record<string, boolean>;
  appVersion?: string;
  timestamp?: string;
}

const DEFAULT_TIMESTAMP = '2000-01-01T00:00:00.000Z';

export function createCurrentSaveScenario(options: CurrentSaveScenarioOptions): ScenarioDefinition {
  return {
    id: options.id,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    create: () => ({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      meta: {
        id: options.id,
        title: options.title,
        createdAt: options.timestamp ?? DEFAULT_TIMESTAMP,
        updatedAt: options.timestamp ?? DEFAULT_TIMESTAMP,
        appVersion: options.appVersion ?? '0.0.1',
      },
      config: {
        calendar: {
          slots: [...DEFAULT_SLOT_DEFS],
          daysPerWeek: 7,
          weekdayNames: ['一', '二', '三', '四', '五', '六', '日'],
          preset: 'standard',
          unlimitedSlots: false,
        },
        actionCosts: { ...DEFAULT_ACTION_COSTS },
        axisDefs: [],
        stageRules: [],
        showNumbers: false,
        hiddenTopicStyle: 'hide',
        realTimeAwareness: false,
        opsLimitPerTurn: 12,
      },
      world: {
          clock: { day: options.day ?? 1, slotId: options.slotId ?? 'morning' },
          slotsUsedToday: 0,
        player: {
          name: options.playerName ?? '测试玩家',
          nodeId: options.nodeId ?? 'start',
          stats: { ...(options.stats ?? {}) },
          flags: { ...(options.flags ?? {}) },
          inventory: [],
        },
        stats: {},
        flags: {},
        items: {},
          relations: {},
          diary: [],
          settlements: [],
      },
    }),
  };
}

export function seedScenario(definition: ScenarioDefinition): SaveFile {
  const raw = definition.create() as { schemaVersion?: unknown };
  if (raw?.schemaVersion !== definition.schemaVersion) {
    throw new Error(`Scenario ${definition.id} declared schema v${definition.schemaVersion} but created v${String(raw?.schemaVersion)}.`);
  }
  return migrateSave(raw);
}

export function exportScenarioZip(definition: ScenarioDefinition): Promise<Blob> {
  return exportSaveZip(seedScenario(definition), {}, definition.extras);
}
