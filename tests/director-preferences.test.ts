import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDefaultPromptBlocks } from '../src/core/prompt/default-blocks';
import { buildDirectorPreferencesPrompt } from '../src/core/prompt/director';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';
import { DEFAULT_DIRECTOR_PREFERENCES, DirectorPreferencesSchema } from '../src/data/schema/save';
import { LIBRARY_PAGE_DEFINITIONS } from '../src/App';

describe('director preferences', () => {
  it('accepts bounded preferences and rejects invalid values', () => {
    expect(DirectorPreferencesSchema.parse({})).toEqual(DEFAULT_DIRECTOR_PREFERENCES);
    expect(() => DirectorPreferencesSchema.parse({ pace: 'chaos' })).toThrow();
    expect(() => DirectorPreferencesSchema.parse({ toneTags: Array.from({ length: 21 }, () => 'tag') })).toThrow();
    expect(() => DirectorPreferencesSchema.parse({ toneTags: ['x'.repeat(41)] })).toThrow();
    expect(() => DirectorPreferencesSchema.parse({ storyDirection: 'x'.repeat(2001) })).toThrow();
  });

  it('injects non-empty preferences only into narration and topic prompts', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'director-prompt', title: 'Director prompt' }));
    save.world.director.preferences = DirectorPreferencesSchema.parse({
      storyDirection: '让新角色主动制造相遇。',
      toneTags: ['治愈'],
      pace: 'slow_burn',
      playerRoleNotes: '玩家是万人迷。',
      npcPreferenceTags: ['帅气', '男 NPC'],
      avoidTags: ['背叛'],
      shortTermGoal: '先认识新朋友。',
      focusCharacterIds: [],
    });
    const blocks = createDefaultPromptBlocks();
    const narration = blocks.find((block) => block.id === 'director_preferences');
    expect(narration?.tasks).toEqual(['narrate_main', 'topic_tree']);
    const prompt = buildDirectorPreferencesPrompt(save.world);
    expect(prompt).toContain('让新角色主动制造相遇');
    expect(prompt).toContain('帅气、男 NPC');
    expect(prompt).toContain('不是已经成立的世界事实');
    expect(buildDirectorPreferencesPrompt(seedScenario(createCurrentSaveScenario({ id: 'director-empty', title: 'Director empty' })).world)).toBeNull();
    expect(blocks.find((block) => block.id === 'director_preferences')?.build({ world: save.world }) as string).toContain('格式契约');
  });

  it('keeps the terminal launcher entry and dedicated route in App', () => {
    expect(LIBRARY_PAGE_DEFINITIONS.some((entry) => entry.id === 'director' && entry.label === '剧情导演')).toBe(true);
    const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain("libraryPage === 'director'");
    expect(app).toContain('<DirectorPreferencesView');
  });
});
