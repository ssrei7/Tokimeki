import { SaveFileSchema, CURRENT_SCHEMA_VERSION, type SaveFile } from '../schema/save';
import { migrateV0ToV1 } from './v0-to-v1';
import { migrateV1ToV2 } from './v1-to-v2';
import { MigrationError, UnsupportedSchemaVersionError, type Migration } from './types';

export const migrations: Record<number, Migration> = {
  1: migrateV0ToV1,
  2: migrateV1ToV2,
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

  return SaveFileSchema.parse(current);
}
