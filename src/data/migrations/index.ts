import { SaveFileSchema, CURRENT_SCHEMA_VERSION, type SaveFile } from '../schema/save';
import { migrateV0ToV1 } from './v0-to-v1';
import { migrateV1ToV2 } from './v1-to-v2';
import { migrateV2ToV3 } from './v2-to-v3';
import { migrateV3ToV4 } from './v3-to-v4';
import { migrateV4ToV5, repairLegacyV5Save } from './v4-to-v5';
import { migrateV5ToV6 } from './v5-to-v6';
import { migrateV6ToV7 } from './v6-to-v7';
import { migrateV7ToV8 } from './v7-to-v8';
import { migrateV8ToV9 } from './v8-to-v9';
import { migrateV9ToV10 } from './v9-to-v10';
import { migrateV10ToV11 } from './v10-to-v11';
import { migrateV11ToV12 } from './v11-to-v12';
import { migrateV12ToV13 } from './v12-to-v13';
import { migrateV13ToV14 } from './v13-to-v14';
import { migrateV14ToV15 } from './v14-to-v15';
import { migrateV15ToV16 } from './v15-to-v16';
import { migrateV16ToV17 } from './v16-to-v17';
import { migrateV17ToV18 } from './v17-to-v18';
import { migrateV18ToV19 } from './v18-to-v19';
import { migrateV19ToV20 } from './v19-to-v20';
import { MigrationError, UnsupportedSchemaVersionError, type Migration } from './types';

export const migrations: Record<number, Migration> = {
  1: migrateV0ToV1,
  2: migrateV1ToV2,
  3: migrateV2ToV3,
  4: migrateV3ToV4,
  5: migrateV4ToV5,
  6: migrateV5ToV6,
  7: migrateV6ToV7,
  8: migrateV7ToV8,
  9: migrateV8ToV9,
  10: migrateV9ToV10,
  11: migrateV10ToV11,
  12: migrateV11ToV12,
  13: migrateV12ToV13,
  14: migrateV13ToV14,
  15: migrateV14ToV15,
  16: migrateV15ToV16,
  17: migrateV16ToV17,
  18: migrateV17ToV18,
  19: migrateV18ToV19,
  20: migrateV19ToV20,
};

export function migrateSave(input: unknown): SaveFile {
  const candidate = (input ?? {}) as Record<string, unknown>;
  let version = typeof candidate.schemaVersion === 'number' ? candidate.schemaVersion : 0;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(version, CURRENT_SCHEMA_VERSION);
  }

  let current: unknown = input;
  while (version < CURRENT_SCHEMA_VERSION) {
    const targetVersion = version + 1;
    const migration = migrations[targetVersion];
    if (!migration) {
      throw new MigrationError(version, targetVersion, new Error('Migration is not registered.'));
    }
    try {
      current = migration(current);
    } catch (cause) {
      throw new MigrationError(version, targetVersion, cause);
    }
    version = targetVersion;
  }

  return SaveFileSchema.parse(version === CURRENT_SCHEMA_VERSION ? repairLegacyV5Save(current) : current);
}
