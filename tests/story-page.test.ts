import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StoryScene terminal page', () => {
  it('keeps the root details content expanded when its summary is hidden by the subpage shell', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<details className="fold-card story-scene-library" open>');
  });
});
