// src/app/api/media/catalog/[filename]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

const UPLOAD_ROOT = process.env.UPLOAD_DIR;

if (!UPLOAD_ROOT) {
    throw new Error('UPLOAD_DIR no está definido');
}

const UPLOAD_DIR = path.join(UPLOAD_ROOT, 'catalog');

const CONTENT_TYPES: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ filename: string }> }
) {
    try {
        const { filename } = await params;
        const safeName = path.basename(filename);

        if (safeName !== filename) {
        return NextResponse.json({ error: 'Archivo inválido' }, { status: 400 });
        }

        const fullPath = path.join(UPLOAD_DIR, safeName);
        const file = await readFile(fullPath);
        const ext = path.extname(safeName).toLowerCase();

        return new NextResponse(file, {
        headers: {
            'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
            'Cache-Control': 'public, max-age=31536000, immutable',
        },
        });
    } catch (error) {
        console.error('[GET /api/media/catalog/[filename]] Error:', error);
        return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }
}