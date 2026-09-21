import { describe, expect, it } from 'vitest';
import {
  buildPlaceHighlightGenerationMessages,
  confirmGeneratedPlaceHighlights,
  createPlaceHighlight,
  deletePlaceHighlight,
  parseGeneratedPlaceHighlights,
  placeHighlightReferences,
  selectPlaceHighlightNodes,
  updatePlaceHighlight,
  visiblePlaceHighlights,
} from '../src/core/place-highlights';
import { createDefaultMap, PlaceHighlightSchema, type PlaceHighlight } from '../src/data/schema/save';

function testMap() {
  const map = createDefaultMap();
  map.nodes.harbor = { ...map.nodes.start, id: 'harbor', name: '港口', discovered: true, pos: { x: 700, y: 350 } };
  map.nodes.secret = { ...map.nodes.start, id: 'secret', name: '秘密花园', discovered: false, pos: { x: 300, y: 500 } };
  return map;
}

const manualInput = { nodeId: 'start', kind: 'hotspot' as const, title: '公告栏', body: '新贴了一张手写海报。', allowsNewNpc: false };

describe('place highlights', () => {
  it('creates, edits, and deletes save-local highlights without provider work', () => {
    const map = testMap();
    const created = createPlaceHighlight([], map, manualInput, { id: 'highlight-1', day: 2, source: 'manual' });
    expect(created[0]).toMatchObject({ id: 'highlight-1', source: 'manual', createdDay: 2, updatedDay: 2 });
    const updated = updatePlaceHighlight(created, map, 'highlight-1', { ...manualInput, nodeId: 'harbor', kind: 'activity', title: '夜航准备' }, 3);
    expect(updated[0]).toMatchObject({ nodeId: 'harbor', kind: 'activity', title: '夜航准备', createdDay: 2, updatedDay: 3 });
    expect(deletePlaceHighlight(updated, 'highlight-1')).toEqual([]);
  });

  it('rejects invalid locations and enforces text limits', () => {
    const map = testMap();
    expect(() => createPlaceHighlight([], map, { ...manualInput, nodeId: 'missing' }, { id: 'bad', day: 1, source: 'manual' })).toThrow('地点不存在');
    expect(PlaceHighlightSchema.safeParse({ ...manualInput, id: 'bad', source: 'manual', createdDay: 1, updatedDay: 1, title: 'x'.repeat(81) }).success).toBe(false);
  });

  it('uses local random selection and caps selection to existing locations', () => {
    const map = testMap();
    const selected = selectPlaceHighlightNodes(map, 8, () => 0);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((node) => node.id)).size).toBe(3);
    expect(() => selectPlaceHighlightNodes(map, 9)).toThrow('1–8');
  });

  it('locks single-location generation to the requested valid node', () => {
    const map = testMap();
    expect(selectPlaceHighlightNodes(map, 1, () => 0.5, 'harbor').map((node) => node.id)).toEqual(['harbor']);
    expect(() => selectPlaceHighlightNodes(map, 1, () => 0.5, 'missing')).toThrow('地点不存在');
    expect(() => selectPlaceHighlightNodes(map, 2, () => 0.5, 'harbor')).toThrow('只能生成 1 条');
  });

  it('builds one bounded request payload containing only locally selected locations', () => {
    const nodes = selectPlaceHighlightNodes(testMap(), 2, () => 0);
    const messages = buildPlaceHighlightGenerationMessages(nodes, '温柔一些');
    expect(messages).toHaveLength(2);
    expect(JSON.parse(messages[1].content)).toMatchObject({ requirements: '温柔一些' });
    expect(JSON.parse(messages[1].content).allowedLocations.map((node: { id: string }) => node.id)).toEqual(nodes.map((node) => node.id));
  });

  it('rejects AI drafts with unknown, duplicate, missing, or excess locations', () => {
    const valid = JSON.stringify({ highlights: [
      { nodeId: 'start', kind: 'hotspot', title: '风筝', body: '风筝落在屋顶。', allowsNewNpc: false },
      { nodeId: 'harbor', kind: 'activity', title: '灯船', body: '有人准备放灯船。', allowsNewNpc: true },
    ] });
    expect(parseGeneratedPlaceHighlights(valid, ['start', 'harbor'])).toHaveLength(2);
    expect(() => parseGeneratedPlaceHighlights(valid.replace('harbor', 'unknown'), ['start', 'harbor'])).toThrow('未授权地点');
    expect(() => parseGeneratedPlaceHighlights(valid.replace('harbor', 'start'), ['start', 'harbor'])).toThrow('重复返回地点');
    expect(() => parseGeneratedPlaceHighlights(JSON.stringify({ highlights: [JSON.parse(valid).highlights[0]] }), ['start', 'harbor'])).toThrow('恰好返回 2 条');
  });

  it('keeps generated content as drafts until explicit confirmation', () => {
    const map = testMap();
    const drafts = parseGeneratedPlaceHighlights(JSON.stringify({ highlights: [{ nodeId: 'start', kind: 'activity', title: '街角演出', body: '短暂的街头演出即将开始。', allowsNewNpc: true }] }), ['start']);
    const before: PlaceHighlight[] = [];
    expect(before).toEqual([]);
    const confirmed = confirmGeneratedPlaceHighlights(before, map, drafts, 4, () => 'ai-1');
    expect(confirmed[0]).toMatchObject({ id: 'ai-1', source: 'ai', createdDay: 4, updatedDay: 4 });
  });

  it('hides undiscovered-location highlights on the ordinary map but retains management references', () => {
    const map = testMap();
    const entries = [
      PlaceHighlightSchema.parse({ ...manualInput, id: 'visible', source: 'manual', createdDay: 1, updatedDay: 1 }),
      PlaceHighlightSchema.parse({ ...manualInput, id: 'hidden', nodeId: 'secret', source: 'manual', createdDay: 1, updatedDay: 1 }),
    ];
    expect(visiblePlaceHighlights(entries, map).map((item) => item.id)).toEqual(['visible']);
    expect(placeHighlightReferences(entries, 'secret').map((item) => item.id)).toEqual(['hidden']);
  });
});
