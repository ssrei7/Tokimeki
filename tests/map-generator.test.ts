import { describe, expect, it } from 'vitest';
import { parseGeneratedMap, parseGeneratedMapExpansion } from '../src/core/map';

function generatedPayload() {
  const nodes = Array.from({ length: 8 }, (_, index) => ({ id: index === 0 ? 'start' : `node-${index}`, name: index === 0 ? '起点' : `地点 ${index}`, regionId: 'town', kind: ['outdoor'], pos: { x: index * 100, y: 200 } }));
  return { regions: [{ id: 'town', name: '城镇' }], nodes, edges: nodes.slice(1).map((node, index) => ({ from: index === 0 ? 'start' : `node-${index}`, to: node.id, travelSlots: 1 })) };
}

describe('map generation parser', () => {
  it('normalizes valid generated JSON and reveals the current node', () => {
    const map = parseGeneratedMap(JSON.stringify(generatedPayload()), 'start');
    expect(Object.keys(map.nodes)).toHaveLength(8);
    expect(map.nodes.start.discovered).toBe(true);
    expect(map.nodes['node-1'].discovered).toBe(false);
    expect(map.view.mode).toBe('graph');
  });

  it('accepts a fenced response and rejects isolated graphs', () => {
    expect(parseGeneratedMap(`\`\`\`json\n${JSON.stringify(generatedPayload())}\n\`\`\``, 'start').nodes.start.name).toBe('起点');
    const invalid = generatedPayload(); invalid.edges = invalid.edges.slice(0, 6);
    expect(() => parseGeneratedMap(JSON.stringify(invalid), 'start')).toThrow('孤立节点');
  });

  it('rejects maps outside the stage 3 node count range', () => {
    const invalid = generatedPayload(); invalid.nodes = invalid.nodes.slice(0, 7);
    expect(() => parseGeneratedMap(JSON.stringify(invalid), 'start')).toThrow('8–15');
  });

  it('merges a single generated location onto an anchor without changing existing nodes', () => {
    const existing = parseGeneratedMap(JSON.stringify(generatedPayload()), 'start');
    const expanded = parseGeneratedMapExpansion(JSON.stringify({
      regions: [{ id: 'town', name: '城镇' }],
      nodes: [{ id: 'harbor', name: '港口', regionId: 'town', kind: ['outdoor'], pos: { x: 800, y: 260 } }],
      edges: [{ from: 'start', to: 'harbor', travelSlots: 1 }],
    }), existing, 'start', 1);
    expect(expanded.nodes.harbor.name).toBe('港口');
    expect(expanded.nodes.start).toEqual(existing.nodes.start);
    expect(expanded.edges).toHaveLength(existing.edges.length + 1);
  });

  it('supports multiple locations chained from the anchor', () => {
    const existing = parseGeneratedMap(JSON.stringify(generatedPayload()), 'start');
    const expanded = parseGeneratedMapExpansion(JSON.stringify({
      regions: [{ id: 'suburb', name: '郊外' }],
      nodes: [
        { id: 'park', name: '公园', regionId: 'suburb', kind: ['outdoor'], pos: { x: 700, y: 120 } },
        { id: 'cafe', name: '咖啡馆', regionId: 'suburb', kind: ['indoor'], pos: { x: 820, y: 120 } },
      ],
      edges: [{ from: 'start', to: 'park', travelSlots: 1 }, { from: 'park', to: 'cafe', travelSlots: 1 }],
    }), existing, 'start', 2);
    expect(expanded.nodes.park.name).toBe('公园');
    expect(expanded.nodes.cafe.name).toBe('咖啡馆');
    expect(expanded.regions.suburb.name).toBe('郊外');
  });

  it('rejects duplicate ids and disconnected expansions', () => {
    const existing = parseGeneratedMap(JSON.stringify(generatedPayload()), 'start');
    expect(() => parseGeneratedMapExpansion(JSON.stringify({ nodes: [{ id: 'node-1', name: '重复', regionId: 'town', pos: { x: 1, y: 1 } }], edges: [] }), existing, 'start', 1)).toThrow('已存在');
    expect(() => parseGeneratedMapExpansion(JSON.stringify({ nodes: [{ id: 'far', name: '孤岛', regionId: 'town', pos: { x: 1, y: 1 } }], edges: [] }), existing, 'start', 1)).toThrow('没有连到指定锚点');
  });
});
