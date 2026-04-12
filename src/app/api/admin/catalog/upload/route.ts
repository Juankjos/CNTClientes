// src/app/api/admin/catalog/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { getSession } from '@/lib/session';
import { apiPath } from '@/lib/api-path';

export const runtime = 'nodejs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR;
if (!UPLOAD_ROOT) throw new Error('UPLOAD_DIR no está definido');

const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'catalog');

const ALLOWED_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
]);

const MAX_SIZE = 5 * 1024 * 1024;

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
    return !session.user || session.user.rol !== 'admin';
}

function extFromMime(type: string) {
    switch (type) {
        case 'image/jpeg': return '.jpg';
        case 'image/png': return '.png';
        case 'image/webp': return '.webp';
        default: return '';
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const formData = await req.formData();
        const file = formData.get('file');

        if (
            !file ||
            typeof file !== 'object' ||
            typeof (file as Blob).arrayBuffer !== 'function' ||
            typeof (file as Blob).type !== 'string' ||
            typeof (file as Blob).size !== 'number'
        ) {
            return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 });
        }
        

        if (!ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: 'Solo JPG, PNG o WEBP' }, { status: 400 });
        }

        if (file.size > MAX_SIZE) {
        return NextResponse.json({ error: 'Máximo 5 MB' }, { status: 400 });
        }

        const ext = extFromMime(file.type);
        if (!ext) {
        return NextResponse.json({ error: 'Formato no soportado' }, { status: 400 });
        }

        await mkdir(UPLOAD_DIR, { recursive: true });

        const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
        const filePath = path.join(UPLOAD_DIR, fileName);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        await writeFile(filePath, buffer);

        const publicUrl = apiPath(`/api/media/catalog/${fileName}`);

        return NextResponse.json({
        ok: true,
        fileName,
        url: publicUrl,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        console.error('[POST /api/admin/catalog/upload] Error:', {
            message,
            cwd: process.cwd(),
            uploadRoot: UPLOAD_ROOT,
            uploadDir: UPLOAD_DIR,
            uid: process.getuid?.(),
            gid: process.getgid?.(),
        });

        return NextResponse.json(
            {
            error: 'Error interno al subir imagen',
            detail: message,
            cwd: process.cwd(),
            uploadRoot: UPLOAD_ROOT,
            uploadDir: UPLOAD_DIR,
            uid: process.getuid?.(),
            gid: process.getgid?.(),
            },
            { status: 500 }
        );
    }
}