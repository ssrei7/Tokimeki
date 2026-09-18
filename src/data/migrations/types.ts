export type Migration = (save: unknown) => unknown;

export class UnsupportedSchemaVersionError extends Error {
  constructor(public readonly version: number, public readonly currentVersion: number) {
    super(`存档 schema v${version} 高于当前支持的 v${currentVersion}，请升级小小地图后重试。`);
    this.name = 'UnsupportedSchemaVersionError';
  }
}

export class MigrationError extends Error {
  constructor(public readonly fromVersion: number, public readonly toVersion: number, cause: unknown) {
    super(`Failed to migrate save schema v${fromVersion} to v${toVersion}.`, { cause });
    this.name = 'MigrationError';
  }
}
