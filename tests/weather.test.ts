import { describe, expect, it } from 'vitest';
import { triggerEncounter } from '../src/core/encounter';
import { weatherAllows, weatherForDay, weatherHasTag } from '../src/core/world/weather';
import { PromptAssembler } from '../src/core/prompt/assembler';
import { createDefaultPromptBlocks } from '../src/core/prompt/default-blocks';
import { createCurrentSaveScenario, seedScenario } from '../src/dev/scenarios/seeder';

describe('deterministic weather facts and gates', () => {
  it('reads the current day weather and evaluates all/any/none gates locally', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'weather', title: 'Weather' }));
    save.world.morningUpdates.push({ day: 1, weather: { id: 'drizzle', label: '细雨', tags: ['rain', 'cold'] }, npcMoves: [] });
    expect(weatherForDay(save.world)).toEqual({ id: 'drizzle', label: '细雨', tags: ['rain', 'cold'] });
    expect(weatherHasTag(save.world, 'RAIN')).toBe(true);
    expect(weatherAllows(save.world, { all: ['rain'], none: ['heat'] })).toBe(true);
    expect(weatherAllows(save.world, { any: ['snow', 'rain'] })).toBe(true);
    expect(weatherAllows(save.world, { all: ['rain'], none: ['cold'] })).toBe(false);
    expect(weatherAllows(save.world, { all: ['snow'] })).toBe(false);
    expect(weatherAllows(save.world, undefined)).toBe(true);
  });

  it('exposes weather to narration and blocks a gated encounter without changing state', () => {
    const save = seedScenario(createCurrentSaveScenario({ id: 'weather-prompt', title: 'Weather prompt' }));
    save.world.morningUpdates.push({ day: 1, weather: { id: 'drizzle', label: '细雨', tags: ['rain'] }, npcMoves: [] });
    save.world.characters.seir = { id: 'seir', name: '塞伊尔', tier: 'formal', card: { description: '测试角色', personality: '安静' }, visuals: { portraits: [] }, homeNodeId: 'start', schedule: { grid: {}, overrides: {} } };
    const assembler = new PromptAssembler();
    for (const block of createDefaultPromptBlocks()) assembler.register(block);
    const prompt = assembler.assemble({ input: '今天适合出门吗？', worldbooks: [], history: [], world: save.world }, { budget: 4096, task: 'narrate_main' });
    expect(prompt.messages.map((message) => message.content).join('\n')).toContain('细雨');
    const before = structuredClone(save.world.encounterLog);
    expect(triggerEncounter(save.world, save.config.encounter, { nodeId: 'start', trigger: 'enter', weatherGate: { all: ['snow'] } }).triggered).toBe(false);
    expect(save.world.encounterLog).toEqual(before);
    expect(triggerEncounter(save.world, save.config.encounter, { nodeId: 'start', trigger: 'enter', weatherGate: { all: ['rain'] } }).triggered).toBe(true);
  });
});
