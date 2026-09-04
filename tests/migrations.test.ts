import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, SaveFileSchema } from '../src/data/schema/save';
import { migrateSave } from '../src/data/migrations';
import { UnsupportedSchemaVersionError } from '../src/data/migrations/types';
import fixtureV1 from './fixtures/save-v1.json';

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

  it('migrates a v1 save to v2 without changing existing player state', () => {
    const migrated = migrateSave(fixtureV1);
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.world.player.stats.money).toBe(10);
    expect(migrated.world.stats).toEqual({});
    expect(migrated.world.flags).toEqual({});
    expect(migrated.world.items).toEqual({});
    expect(migrated.world.relations).toEqual({});
  });

  it('rejects saves from a newer schema', () => {
    expect(() => migrateSave({ schemaVersion: 999 })).toThrow(UnsupportedSchemaVersionError);
  });

  it('rejects malformed migrated data with field-level validation errors', () => {
    expect(() => migrateSave({ schemaVersion: CURRENT_SCHEMA_VERSION, world: {} })).toThrow();
  });
});
