import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('StoryScene terminal page', () => {
  it('keeps the root details content expanded when its summary is hidden by the subpage shell', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<details className="fold-card story-scene-library" open>');
  });

  it('lets the outline describe time and place without coordinate controls', () => {
    const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    const start = source.indexOf('function StorySceneLibraryView');
    const end = source.indexOf('function ContactAvatar', start);
    const storySceneUi = source.slice(start, end);
    expect(storySceneUi).toContain('时间与地点由你在详细大纲中自由描述');
    expect(storySceneUi).not.toContain('<label>地点');
    expect(storySceneUi).not.toContain('开始日期');
    expect(storySceneUi).not.toContain('开始时段');
  });
});
