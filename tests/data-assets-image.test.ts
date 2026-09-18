import { describe, expect, it } from 'vitest';
import { externalImageAssetRef } from '../src/data/assets/image';

describe('externalImageAssetRef', () => {
  it('accepts normalized http(s) image references without fetching them', () => {
    expect(externalImageAssetRef(' https://example.com/avatar.png ')).toEqual({ kind: 'url', url: 'https://example.com/avatar.png' });
    expect(externalImageAssetRef('http://example.com/art.webp')).toEqual({ kind: 'url', url: 'http://example.com/art.webp' });
  });

  it.each(['', 'not a url', 'data:image/png;base64,AA==', 'file:///avatar.png', 'ftp://example.com/a.png'])(
    'rejects unsupported input %j',
    (value) => expect(() => externalImageAssetRef(value)).toThrow(),
  );
});
