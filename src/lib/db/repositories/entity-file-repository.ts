/**
 * Entity file metadata repository (profiles table + index per entity).
 *
 * @serverOnly
 */

import { getItem, putItem, deleteItem, tableNames } from '../dynamodb';
import type { EntityFile, EntityFileType } from '@/lib/schemas/entity-file';
import { randomUUID } from 'crypto';

function fileRecordKey(tenantId: string, fileId: string) {
  return `entity-file#${tenantId}#${fileId}`;
}

function entityIndexKey(
  tenantId: string,
  entityType: EntityFileType,
  entityId: string
) {
  return `entity-files#${tenantId}#${entityType}#${entityId}`;
}

interface IdIndex {
  id: string;
  tenant_id: string;
  type: string;
  ids: string[];
  updatedAt: string;
}

async function getIndex(key: string): Promise<IdIndex | null> {
  try {
    return await getItem<IdIndex>(tableNames.profiles, { id: key });
  } catch {
    return null;
  }
}

async function addToIndex(
  key: string,
  tenantId: string,
  itemId: string,
  max = 200
): Promise<void> {
  const existing = await getIndex(key);
  let ids = existing?.ids ? [...existing.ids] : [];
  if (!ids.includes(itemId)) ids.push(itemId);
  if (ids.length > max) ids = ids.slice(-max);
  await putItem(tableNames.profiles, {
    id: key,
    tenant_id: tenantId,
    type: 'entity_file_index',
    ids,
    updatedAt: new Date().toISOString(),
  } satisfies IdIndex);
}

async function removeFromIndex(key: string, itemId: string): Promise<void> {
  const existing = await getIndex(key);
  if (!existing?.ids?.length) return;
  const ids = existing.ids.filter((x) => x !== itemId);
  await putItem(tableNames.profiles, {
    ...existing,
    ids,
    updatedAt: new Date().toISOString(),
  });
}

export async function createEntityFile(
  tenantId: string,
  input: Omit<
    EntityFile,
    'id' | 'tenant_id' | 'type' | 'createdAt' | 'updatedAt'
  > & { id?: string }
): Promise<EntityFile> {
  const shortId = input.id || randomUUID();
  const now = new Date().toISOString();
  const id = fileRecordKey(tenantId, shortId);
  const record: EntityFile = {
    ...input,
    id,
    tenant_id: tenantId,
    type: 'entity_file',
    createdAt: now,
    updatedAt: now,
  };
  await putItem(tableNames.profiles, record);
  await addToIndex(
    entityIndexKey(tenantId, input.entityType, input.entityId),
    tenantId,
    id
  );
  return record;
}

export async function getEntityFileById(
  tenantId: string,
  fileId: string
): Promise<EntityFile | null> {
  // Accept full id or short uuid
  const id = fileId.startsWith('entity-file#')
    ? fileId
    : fileRecordKey(tenantId, fileId);
  try {
    const item = await getItem<EntityFile>(tableNames.profiles, { id });
    if (item && item.tenant_id === tenantId && item.type === 'entity_file') {
      return item;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function listEntityFiles(
  tenantId: string,
  entityType: EntityFileType,
  entityId: string
): Promise<EntityFile[]> {
  const idx = await getIndex(entityIndexKey(tenantId, entityType, entityId));
  if (!idx?.ids?.length) return [];
  const out: EntityFile[] = [];
  for (const id of idx.ids) {
    try {
      const m = await getItem<EntityFile>(tableNames.profiles, { id });
      if (
        m &&
        m.tenant_id === tenantId &&
        m.type === 'entity_file' &&
        m.entityId === entityId
      ) {
        out.push(m);
      }
    } catch {
      /* skip */
    }
  }
  return out.sort(
    (a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function deleteEntityFile(
  tenantId: string,
  fileId: string
): Promise<EntityFile | null> {
  const existing = await getEntityFileById(tenantId, fileId);
  if (!existing) return null;
  await deleteItem(tableNames.profiles, { id: existing.id });
  await removeFromIndex(
    entityIndexKey(tenantId, existing.entityType, existing.entityId),
    existing.id
  );
  return existing;
}
