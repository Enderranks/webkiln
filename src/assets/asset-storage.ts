import type { AssetMetadata } from '../cloud/contracts';
import type { WebKilnProject } from '../types';

export type StorageCapability = 'metadata' | 'binary' | 'transformations';
export interface AssetStorageAdapter {
  readonly kind: 'local' | 'metadata-only' | 'r2-future';
  capabilities(): ReadonlySet<StorageCapability>;
  list(project: WebKilnProject): AssetMetadata[];
  save(project: WebKilnProject, asset: AssetMetadata): WebKilnProject;
  remove(project: WebKilnProject, assetId: string): WebKilnProject;
}

const localAsset = (asset: WebKilnProject['assets'][number]): AssetMetadata => ({
  id: asset.id,
  workspaceId: 'local',
  siteId: 'local-site',
  filename: asset.name,
  mimeType: asset.mime,
  size: asset.size,
  altText: '',
  caption: '',
  folder: '/',
  tags: [],
  focalPoint: { x: 50, y: 50 },
  usageCount: 0,
  storageStatus: 'local',
  transformations: { available: false, reason: 'Local binary processing is not configured' },
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
});

export class LocalAssetStorageAdapter implements AssetStorageAdapter {
  readonly kind = 'local' as const;
  capabilities(): ReadonlySet<StorageCapability> {
    return new Set(['metadata', 'binary']);
  }
  list(project: WebKilnProject): AssetMetadata[] {
    return project.assets.map(localAsset);
  }
  save(project: WebKilnProject, asset: AssetMetadata): WebKilnProject {
    const next = project.assets.filter((item) => item.id !== asset.id);
    next.push({ id: asset.id, name: asset.filename, mime: asset.mimeType, size: asset.size });
    return { ...project, assets: next };
  }
  remove(project: WebKilnProject, assetId: string): WebKilnProject {
    return { ...project, assets: project.assets.filter((item) => item.id !== assetId) };
  }
}

export class MetadataOnlyAssetStorageAdapter implements AssetStorageAdapter {
  readonly kind = 'metadata-only' as const;
  capabilities(): ReadonlySet<StorageCapability> {
    return new Set(['metadata']);
  }
  list(): AssetMetadata[] {
    return [];
  }
  save(project: WebKilnProject): WebKilnProject {
    return project;
  }
  remove(project: WebKilnProject): WebKilnProject {
    return project;
  }
}

export class FutureR2AssetStorageAdapter implements AssetStorageAdapter {
  readonly kind = 'r2-future' as const;
  capabilities(): ReadonlySet<StorageCapability> {
    return new Set();
  }
  list(): AssetMetadata[] {
    return [];
  }
  save(project: WebKilnProject): WebKilnProject {
    return project;
  }
  remove(project: WebKilnProject): WebKilnProject {
    return project;
  }
}

export function selectAssetStorageAdapter(cloudConfigured: boolean): AssetStorageAdapter {
  return cloudConfigured ? new MetadataOnlyAssetStorageAdapter() : new LocalAssetStorageAdapter();
}

export function storageState(adapter: AssetStorageAdapter): {
  configured: boolean;
  label: string;
  detail: string;
} {
  if (adapter.kind === 'metadata-only')
    return {
      configured: true,
      label: 'Metadata only',
      detail: 'Binary storage is not configured. Asset details are safe to edit.',
    };
  if (adapter.kind === 'r2-future')
    return {
      configured: false,
      label: 'Storage not configured',
      detail: 'R2 is reserved for a future approved milestone.',
    };
  return {
    configured: true,
    label: 'Local storage',
    detail: 'Local asset metadata remains available in this browser.',
  };
}

export function canDeleteAsset(asset: Pick<AssetMetadata, 'usageCount'>): boolean {
  return asset.usageCount === 0;
}
export function estimateStorageUsage(assets: Pick<AssetMetadata, 'size'>[]): number {
  return assets.reduce((total, asset) => total + Math.max(0, asset.size), 0);
}
