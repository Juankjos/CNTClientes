// src/app/api/peticiones/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import Busboy from 'busboy';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

export const runtime = 'nodejs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR;

if (!UPLOAD_ROOT) {
  throw new Error('UPLOAD_DIR no está definido');
}

const MEDIA_ROOT = path.join(UPLOAD_ROOT, 'media');
const PETICIONES_ROOT = path.join(MEDIA_ROOT, 'peticiones');

const MB = 1024 * 1024;
const GB = 1024 * MB;

const MAX_BY_KIND = {
  image: 25 * MB,
  document: 100 * MB,
  video: 1 * GB,
  compressed: 500 * MB,
} as const;

const MAX_TOTAL_PER_CLIENT = 2 * GB;
const MAX_FILE_ABSOLUTE = 1 * GB;
const MAX_FILES_PER_REQUEST = 10;

type FileKind = keyof typeof MAX_BY_KIND;

type UploadedPeticionFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: FileKind;
  relativePath: string;
  url: string;
};

function sanitizeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);
}

function getExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

function getFileKind(filename: string, mimeType: string): FileKind | null {
  const ext = getExtension(filename);
  const mime = String(mimeType || '').toLowerCase();

  if (
    mime.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.svg'].includes(ext)
  ) {
    return 'image';
  }

  if (
    mime.startsWith('video/') ||
    ['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v'].includes(ext)
  ) {
    return 'video';
  }

  if (
    [
      '.zip',
      '.rar',
      '.7z',
      '.tar',
      '.gz',
      '.tgz',
      '.bz2',
    ].includes(ext)
  ) {
    return 'compressed';
  }

  if (
    [
      '.pdf',
      '.doc',
      '.docx',
      '.xls',
      '.xlsx',
      '.ppt',
      '.pptx',
      '.txt',
      '.csv',
      '.rtf',
    ].includes(ext)
  ) {
    return 'document';
  }

  return null;
}

async function getDirSize(dir: string): Promise<number> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });

    let total = 0;

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        total += await getDirSize(fullPath);
      } else if (entry.isFile()) {
        const info = await stat(fullPath);
        total += info.size;
      }
    }

    return total;
  } catch (error: any) {
    if (error?.code === 'ENOENT') return 0;
    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user || session.user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const [clienteRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM clientes_clientes WHERE usuario_id = ? LIMIT 1`,
      [session.user.id]
    );

    if (!clienteRows.length) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
    }

    const clienteId = Number(clienteRows[0].id);

    if (!Number.isInteger(clienteId) || clienteId <= 0) {
      return NextResponse.json({ error: 'Cliente inválido.' }, { status: 400 });
    }

    if (!req.body) {
      return NextResponse.json({ error: 'No se recibió archivo.' }, { status: 400 });
    }

    const clienteDir = path.join(PETICIONES_ROOT, String(clienteId));
    await mkdir(clienteDir, { recursive: true });

    const usedBefore = await getDirSize(clienteDir);
    let usedInRequest = 0;

    const uploaded: UploadedPeticionFile[] = [];

    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({
        headers: Object.fromEntries(req.headers.entries()),
        limits: {
          files: MAX_FILES_PER_REQUEST,
          fileSize: MAX_FILE_ABSOLUTE,
        },
      });

      let pendingFiles = 0;
      let finished = false;
      let failed = false;

      function finishIfDone() {
        if (finished && pendingFiles === 0 && !failed) {
          resolve();
        }
      }

      function fail(error: Error) {
        if (failed) return;
        failed = true;
        reject(error);
      }

      bb.on('file', (_fieldName, file, info) => {
        const originalName = sanitizeFileName(info.filename || 'archivo');
        const mimeType = info.mimeType || 'application/octet-stream';

        const kind = getFileKind(originalName, mimeType);

        if (!kind) {
          file.resume();
          fail(new Error(`Tipo de archivo no permitido: ${originalName}`));
          return;
        }

        const maxSize = MAX_BY_KIND[kind];
        const ext = getExtension(originalName);
        const id = crypto.randomUUID();
        const storedName = `${Date.now()}-${id}${ext}`;
        const filePath = path.join(clienteDir, storedName);

        const safeRoot = `${clienteDir}${path.sep}`;
        if (!filePath.startsWith(safeRoot)) {
          file.resume();
          fail(new Error('Ruta de archivo inválida.'));
          return;
        }

        pendingFiles += 1;

        let fileSize = 0;
        const writeStream = createWriteStream(filePath);

        file.on('data', (chunk: Buffer) => {
          fileSize += chunk.length;

          if (fileSize > maxSize) {
            writeStream.destroy();
            file.resume();
            unlink(filePath).catch(() => {});
            fail(
              new Error(
                `El archivo "${originalName}" excede el máximo permitido para ${kind}.`
              )
            );
            return;
          }

          if (usedBefore + usedInRequest + fileSize > MAX_TOTAL_PER_CLIENT) {
            writeStream.destroy();
            file.resume();
            unlink(filePath).catch(() => {});
            fail(new Error('Excediste el máximo total permitido de archivos.'));
          }
        });

        file.on('error', (error) => {
          writeStream.destroy();
          unlink(filePath).catch(() => {});
          fail(error);
        });

        writeStream.on('error', (error) => {
          unlink(filePath).catch(() => {});
          fail(error);
        });

        writeStream.on('finish', () => {
          if (!failed) {
            usedInRequest += fileSize;

            const relativePath = `peticiones/${clienteId}/${storedName}`;

            uploaded.push({
              id,
              originalName,
              storedName,
              mimeType,
              size: fileSize,
              kind,
              relativePath,
              url: `/api/media/peticiones/${clienteId}/${storedName}`,
            });
          }

          pendingFiles -= 1;
          finishIfDone();
        });

        file.pipe(writeStream);
      });

      bb.on('filesLimit', () => {
        fail(new Error(`Máximo ${MAX_FILES_PER_REQUEST} archivos por envío.`));
      });

      bb.on('error', fail);

      bb.on('finish', () => {
        finished = true;
        finishIfDone();
      });

      Readable.fromWeb(req.body as any).pipe(bb);
    });

    return NextResponse.json({
      ok: true,
      files: uploaded,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno al subir archivos';

    console.error('[POST /api/peticiones/upload]', error);

    return NextResponse.json(
      {
        error: message,
      },
      { status: 400 }
    );
  }
}