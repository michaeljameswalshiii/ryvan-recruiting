/**
 * DELETE /api/files/[id] — remove an entity file
 * GET    /api/files/[id] — metadata + fresh download URL
 *
 * @serverOnly
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSessionTenantId } from '@/lib/server-auth';
import {
  deleteEntityFile,
  getEntityFileById,
} from '@/lib/db/repositories/entity-file-repository';
import {
  deleteEntityFileObject,
  getEntityFileDownloadUrl,
} from '@/lib/aws/entity-files-s3';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await ctx.params;
    const file = await getEntityFileById(tenantId, decodeURIComponent(id));
    if (!file) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    let downloadUrl: string | undefined;
    if (file.s3Key) {
      try {
        downloadUrl = await getEntityFileDownloadUrl(file.s3Key, 3600);
      } catch {
        /* ignore */
      }
    } else if (file.dataUrl) {
      downloadUrl = file.dataUrl;
    }
    return NextResponse.json({
      file: {
        id: file.id,
        entityType: file.entityType,
        entityId: file.entityId,
        companyId: file.companyId,
        fileName: file.fileName,
        contentType: file.contentType,
        sizeBytes: file.sizeBytes,
        label: file.label,
        uploadedBy: file.uploadedBy,
        uploadedByEmail: file.uploadedByEmail,
        createdAt: file.createdAt,
        downloadUrl,
        storage: file.s3Key ? 's3' : 'inline',
      },
    });
  } catch (error) {
    console.error('[FILES_GET]', error);
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, ctx: Ctx) {
  try {
    const tenantId = await getSessionTenantId();
    if (!tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { id } = await ctx.params;
    const deleted = await deleteEntityFile(tenantId, decodeURIComponent(id));
    if (!deleted) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    if (deleted.s3Key) {
      await deleteEntityFileObject(deleted.s3Key);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[FILES_DELETE]', error);
    return NextResponse.json(
      { error: 'Failed to delete file' },
      { status: 500 }
    );
  }
}
