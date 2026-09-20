import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../src/models/project-schema';
import {
  canDeleteAsset,
  estimateStorageUsage,
  findDuplicateAssetIds,
  LocalAssetStorageAdapter,
  MetadataOnlyAssetStorageAdapter,
  selectAssetStorageAdapter,
  storageState,
} from '../src/assets/asset-storage';

describe('asset storage foundation', () => {
  it('selects local and metadata-only adapters without R2', () => {
    expect(selectAssetStorageAdapter(false).kind).toBe('local');
    expect(selectAssetStorageAdapter(true).kind).toBe('metadata-only');
    expect(storageState(new MetadataOnlyAssetStorageAdapter()).configured).toBe(true);
    expect(storageState(new MetadataOnlyAssetStorageAdapter()).detail).toContain('not configured');
  });

  it('persists local asset metadata and supports safe removal', () => {
    const adapter = new LocalAssetStorageAdapter();
    const project = createEmptyProject();
    const asset = {
      id: 'a1',
      workspaceId: 'local',
      siteId: 'local-site',
      filename: 'hero.jpg',
      mimeType: 'image/jpeg',
      size: 2048,
      altText: '',
      caption: '',
      folder: '/',
      tags: [],
      focalPoint: { x: 50, y: 50 },
      usageCount: 0,
      storageStatus: 'local' as const,
      transformations: { available: false },
      createdAt: '',
      updatedAt: '',
    };
    const saved = adapter.save(project, asset);
    expect(adapter.list(saved)[0].filename).toBe('hero.jpg');
    expect(canDeleteAsset(asset)).toBe(true);
    expect(canDeleteAsset({ usageCount: 1 })).toBe(false);
    expect(adapter.remove(saved, 'a1').assets).toHaveLength(0);
  });

  it('estimates referenced metadata size without claiming transformations', () => {
    expect(estimateStorageUsage([{ size: 10 }, { size: 25 }])).toBe(35);
    expect(new MetadataOnlyAssetStorageAdapter().capabilities().has('transformations')).toBe(false);
    expect(
      findDuplicateAssetIds([
        { id: 'a', contentHash: 'same' },
        { id: 'b', contentHash: 'same' },
        { id: 'c', contentHash: 'other' },
      ]),
    ).toEqual(new Set(['a', 'b']));
  });
});
