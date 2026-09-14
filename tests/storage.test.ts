import { describe, expect, it } from 'vitest';
import { formatStorageBytes, storageUsagePercent } from '../src/ui/storage';

describe('storage visibility helpers', () => {
  it('formats browser storage estimates for the local UI', () => {
    expect(formatStorageBytes(512)).toBe('512 B');
    expect(formatStorageBytes(1536)).toBe('1.5 KB');
    expect(formatStorageBytes(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatStorageBytes(undefined)).toBe('未知');
  });

  it('clamps usage percentage and handles unavailable quota', () => {
    expect(storageUsagePercent({ usage: 25, quota: 100 })).toBe(25);
    expect(storageUsagePercent({ usage: 125, quota: 100 })).toBe(100);
    expect(storageUsagePercent({ usage: 1, quota: 0 })).toBeUndefined();
  });
});
