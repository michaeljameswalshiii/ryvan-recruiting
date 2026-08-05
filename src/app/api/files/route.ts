/**
 * GET  /api/files?entityType=&entityId=  — list files for an entity
 * POST /api/files (multipart) — upload a file
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionTenantId,
  getSessionUserId,
  getSession,
} from '@/lib/server-auth';
import {
  entityFileTypeSchema,
  type EntityFileView,
} from '@/lib/schemas/entity-file';
import {
  createEntityFile,
  listEntityFiles,
} from '@/lib/db/repositories/entity-file-repository';
import {
  getEntityFileDownloadUrl,
  storeEntityFileObject,
} from '@/lib/aws/entity-files-s3';

async function toView(
  f: Awaited<ReturnType<typeof listEntityFiles>>[number]
): Promise<EntityFileView> {
  let downloadUrl: string | undefined;
  let storage: 's3' | 'inline' = f.s3Key ? 's3' : 'inline';
  if (f.s3Key) {
    try {
      downloadUrl = await getEntityFileDownloadUrl(f.s3Key, 3600);
    } catch {
      downloadUrl = undefined;
    }
  } else if (f.dataUrl) {
    downloadUrl = f.dataUrl;
  }
  return {
    id: f.id,
    entityType: f.entityType,
    entityId: f.entityId,
    companyId: f.companyId,
    fileName: f.fileName,
    contentType: f.contentType,
    sizeBytes: f.sizeBytes,
    label: f.label,
    uploadedBy: f.uploadedBy,
    uploadedByEmail: f.uploadedByEmail,
    createdAt: f.createdAt,
    downloadUrl,
    storage,
  };
}

export async function GET(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const entityTypeRaw = request.nextUrl.searchParams.get('entityType');
    const entityId = request.nextUrl.searchParams.get('entityId');
    const parsedType = entityFileTypeSchema.safeParse(entityTypeRaw);
    if (!parsedType.success || !entityId) {
      return NextResponse.json(
        { error: 'entityType and entityId are required' },
        { status: 400 }
      );
    }
    const files = await listEntityFiles(tenantId, parsedType.data, entityId);
    const views = await Promise.all(files.map(toView));
    return NextResponse.json({ files: views });
  } catch (error) {
    console.error('[FILES_LIST]', error);
    return NextResponse.json(
      { error: 'Failed to list files' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = await getSessionUserId();
    const session = await getSession();

    const form = await request.formData();
    const entityTypeRaw = String(form.get('entityType') || '');
    const entityId = String(form.get('entityId') || '');
    const companyId = form.get('companyId')
      ? String(form.get('companyId'))
      : undefined;
    const label = form.get('label') ? String(form.get('label')) : undefined;
    const file = form.get('file');

    const parsedType = entityFileTypeSchema.safeParse(entityTypeRaw);
    if (!parsedType.success || !entityId) {
      return NextResponse.json(
        { error: 'entityType and entityId are required' },
        { status: 400 }
      );
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const stored = await storeEntityFileObject({
      buffer,
      fileName: file.name,
      contentType: file.type || 'application/octet-stream',
      tenantId,
      entityType: parsedType.data,
      entityId,
    });

    const record = await createEntityFile(tenantId, {
      entityType: parsedType.data,
      entityId,
      companyId,
      fileName: file.name,
      contentType: stored.contentType,
      sizeBytes: stored.size,
      s3Key: stored.storage === 's3' ? stored.s3Key : undefined,
      dataUrl: stored.storage === 'inline' ? stored.dataUrl : undefined,
      label: label?.slice(0, 200),
      uploadedBy: userId || undefined,
      uploadedByEmail: session?.email || undefined,
    });

    const view = await toView(record);
    return NextResponse.json({ file: view }, { status: 201 });
  } catch (error) {
    console.error('[FILES_UPLOAD]', error);
    const message =
      error instanceof Error ? error.message : 'Failed to upload file';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
