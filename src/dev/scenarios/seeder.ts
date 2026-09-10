import { exportSaveZip } from '../../data/io/zip';
import { migrateSave } from '../../data/migrations';
import { createDefaultMap, CURRENT_SCHEMA_VERSION, DEFAULT_ACTION_COSTS, DEFAULT_ECONOMY_STATE, DEFAULT_SLOT_DEFS, type SaveFile } from '../../data/schema/save';

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
        encounter: { enabled: true, triggerOnLeave: true, leaveProbability: 0.35, guaranteeAfterDays: 3, maxParticipants: 3, weights: {} },
      },
      world: {
          clock: { day: options.day ?? 1, slotId: options.slotId ?? 'morning' },
          slotsUsedToday: 0,
        player: {
          name: options.playerName ?? '测试玩家',
          nodeId: options.nodeId ?? 'start',
          stats: { money: 0, 'economy.rent.amount': 10, 'economy.rent.interval-days': 7, 'economy.job.wage': 18, energy: 6, 'economy.energy.max': 6, 'economy.energy.rest-restore': 2, ...(options.stats ?? {}) },
          flags: { 'economy.energy.enabled': true, ...(options.flags ?? {}) },
          inventory: [],
        },
        stats: {},
        flags: {},
        items: {},
          relations: {},
          map: createDefaultMap(),
          diary: [],
          settlements: [],
          characters: {},
          npcs: {},
          npcTemplates: {},
          encounterLog: [],
          topicTrees: {},
          usedTopics: {},
          appointments: [],
          eventDefs: {},
          director: { scheduled: [], lastFiredDay: {}, tension: 0, tensionOffset: 0, tensionUpdatedDay: options.day ?? 1 },
          eventHistory: [], chapters: [], milestones: [], storyScenes: [], economy: structuredClone(DEFAULT_ECONOMY_STATE),
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
