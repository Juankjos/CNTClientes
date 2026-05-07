// src/app/api/media/peticiones/[clienteId]/[fileName]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';

export const runtime = 'nodejs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR;

if (!UPLOAD_ROOT) {
  throw new Error('UPLOAD_DIR no está definido');
}

const MEDIA_ROOT = path.join(UPLOAD_ROOT, 'media');
const PETICIONES_ROOT = path.join(MEDIA_ROOT, 'peticiones');

function contentTypeFromExt(fileName: string) {
  const ext = path.extname(fileName).toLowerCase();

  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.pdf':
      return 'application/pdf';
    case '.zip':
      return 'application/zip';
    case '.mp4':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ clienteId: string; fileName: string }> }
) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { clienteId, fileName } = await ctx.params;

    const requestedClienteId = Number(clienteId);

    if (!Number.isInteger(requestedClienteId) || requestedClienteId <= 0) {
      return NextResponse.json({ error: 'Cliente inválido' }, { status: 400 });
    }

    if (session.user.rol !== 'admin') {
      const [clienteRows] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM clientes_clientes WHERE usuario_id = ? LIMIT 1`,
        [session.user.id]
      );

      const ownClienteId = Number(clienteRows[0]?.id);

      if (ownClienteId !== requestedClienteId) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
    }

    const safeFileName = path.basename(fileName);
    const clienteDir = path.join(PETICIONES_ROOT, String(requestedClienteId));
    const filePath = path.join(clienteDir, safeFileName);

    const safeRoot = `${clienteDir}${path.sep}`;

    if (!filePath.startsWith(safeRoot)) {
      return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
    }

    const info = await stat(filePath);

    if (!info.isFile()) {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    const stream = createReadStream(filePath);

    const download = req.nextUrl.searchParams.get('download') === '1';
    const originalName = safeFileName.replace(/"/g, '');

    return new Response(stream as any, {
      headers: {
        'Content-Type': contentTypeFromExt(safeFileName),
        'Content-Length': String(info.size),
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(originalName)}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return NextResponse.json({ error: 'Archivo no encontrado' }, { status: 404 });
    }

    console.error('[GET /api/media/peticiones]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}