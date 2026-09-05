import { SaveFileSchema, CURRENT_SCHEMA_VERSION, type SaveFile } from '../schema/save';
import { migrateV0ToV1 } from './v0-to-v1';
import { migrateV1ToV2 } from './v1-to-v2';
import { migrateV2ToV3 } from './v2-to-v3';
import { migrateV3ToV4 } from './v3-to-v4';
import { migrateV4ToV5, repairLegacyV5Save } from './v4-to-v5';
import { migrateV5ToV6 } from './v5-to-v6';
import { MigrationError, UnsupportedSchemaVersionError, type Migration } from './types';

export const migrations: Record<number, Migration> = {
  1: migrateV0ToV1,
  2: migrateV1ToV2,
  3: migrateV2ToV3,
  4: migrateV3ToV4,
  5: migrateV4ToV5,
  6: migrateV5ToV6,
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
