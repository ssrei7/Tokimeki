import { describe, expect, it } from 'vitest';
import { parseGeneratedMap } from '../src/core/map';

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
});
