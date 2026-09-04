import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : extname(path) === '.ts' ? [path] : [];
  });
}

describe('core Node boundary', () => {
  it('does not depend on browser persistence, DOM globals, providers, or network calls', () => {
    const violations = sourceFiles(join(process.cwd(), 'src', 'core')).flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const banned = [
        /\bindexedDB\b/,
        /\bwindow\s*[.[]/,
        /\bdocument\s*[.[]/,
        /\bfetch\s*\(/,
        /from\s+['"][^'"]*providers(?:\/[^'"]*)?['"]/,
      ];
      return banned.some((pattern) => pattern.test(source)) ? [path] : [];
    });
    expect(violations).toEqual([]);
  });
});
