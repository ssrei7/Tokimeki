export type Migration = (save: unknown) => unknown;

export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly version: number, public readonly currentVersion: number) {
    super(`Save schema v${version} is newer than supported v${currentVersion}.`);
    this.name = 'UnsupportedSchemaVersionError';
  }
}

export class MigrationError extends Error {
  constructor(public readonly fromVersion: number, public readonly toVersion: number, cause: unknown) {
    super(`Failed to migrate save schema v${fromVersion} to v${toVersion}.`, { cause });
    this.name = 'MigrationError';
  }
}
