import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { createEventPackageTemplate, createWorldPackageTemplate } from '../src/data/io/package-template';
import { importEventPackage, importWorldPackage } from '../src/data/io/zip';

describe('downloadable package templates', () => {
  it('creates a directly importable world package with consistent example references', async () => {
    const blob = await createWorldPackageTemplate();
    const imported = await importWorldPackage(blob);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(imported.manifest).toMatchObject({ type: 'world', schemaVersion: 1 });
    expect(imported.pack.map.nodes['sample-square']?.worldbookIds).toContain('sample-setting');
    expect(imported.pack.characters['sample-character']?.homeNodeId).toBe('sample-square');
    expect(imported.pack.eventDefs['sample-meeting']?.trigger.charIds).toContain('sample-character');
    expect(await zip.file('README.md')?.async('text')).toContain('编辑根目录的 world.json');
  });

  it('creates a directly importable event package without external id dependencies', async () => {
    const blob = await createEventPackageTemplate();
    const imported = await importEventPackage(blob);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(imported.manifest.type).toBe('events');
    expect(imported.pack.events).toHaveLength(1);
    expect(imported.pack.events[0]?.trigger).toEqual({});
    expect(await zip.file('README.md')?.async('text')).toContain('编辑根目录的 events.json');
  });
});
