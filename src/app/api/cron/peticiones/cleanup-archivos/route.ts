// src/app/api/cron/peticiones/cleanup-archivos/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import path from 'node:path';
import { unlink } from 'node:fs/promises';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UPLOAD_ROOT = process.env.UPLOAD_DIR;
const CRON_SECRET = process.env.CRON_SECRET;

if (!UPLOAD_ROOT) {
    throw new Error('UPLOAD_DIR no está definido');
}

if (!CRON_SECRET) {
    throw new Error('CRON_SECRET no está definido');
}

const MEDIA_ROOT = path.join(UPLOAD_ROOT, 'media');

type ArchivoSubido = {
    id: string;
    originalName: string;
    storedName: string;
    mimeType: string;
    size: number;
    kind: 'image' | 'document' | 'video' | 'compressed';
    relativePath: string;
    url: string;
};

type PeticionRow = RowDataPacket & {
    id: number;
    cliente_id: number;
    archivos_subidos: unknown;
};

function parseArchivosSubidos(value: unknown): ArchivoSubido[] {
    let parsed = value;

    if (Buffer.isBuffer(parsed)) {
        parsed = parsed.toString('utf8');
    }

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ArchivoSubido => {
        return (
        item &&
            typeof item === 'object' &&
            typeof item.relativePath === 'string' &&
            typeof item.originalName === 'string'
        );
    });
}

function assertSafeFilePath(clienteId: number, relativePath: string) {
    const expectedPrefix = `peticiones/${clienteId}/`;
    if (!relativePath.startsWith(expectedPrefix)) {
        throw new Error(`Ruta no pertenece al cliente ${clienteId}: ${relativePath}`);
    }
    const absolutePath = path.resolve(MEDIA_ROOT, relativePath);
    const allowedRoot = path.resolve(MEDIA_ROOT, 'peticiones', String(clienteId)) + path.sep;
    if (!absolutePath.startsWith(allowedRoot)) {
        throw new Error(`Ruta insegura detectada: ${relativePath}`);
    }
    return absolutePath;
}

async function deleteFileIfExists(filePath: string) {
    try {
        await unlink(filePath);
        return true;
    } catch (error: any) {
        if (error?.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

export async function GET(req: NextRequest) {
    try {
        const auth = req.headers.get('authorization');

        if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const [rows] = await pool.execute<PeticionRow[]>(
        `
        SELECT
            id,
            cliente_id,
            archivos_subidos
        FROM peticiones_clientes
        WHERE archivos_subidos IS NOT NULL
            AND JSON_LENGTH(archivos_subidos) > 0
            AND archivos_eliminados_at IS NULL
            AND DATE_ADD(
            TIMESTAMP(COALESCE(fecha_fin, fecha_deseada), '23:59:59'),
            INTERVAL 2 DAY
            ) <= NOW()
        ORDER BY COALESCE(fecha_fin, fecha_deseada) ASC
        LIMIT 50
        `
        );

        let peticionesProcesadas = 0;
        let archivosEliminados = 0;
        let peticionesConError = 0;

        const detalles: Array<{
            peticion_id: number;
            ok: boolean;
            deleted: number;
            error?: string;
        }> = [];

        for (const row of rows) {
        const archivos = parseArchivosSubidos(row.archivos_subidos);
        let deletedForRow = 0;

        try {
            for (const archivo of archivos) {
                const filePath = assertSafeFilePath(Number(row.cliente_id), archivo.relativePath);
                const deleted = await deleteFileIfExists(filePath);

                if (deleted) {
                    deletedForRow += 1;
                    archivosEliminados += 1;
                }
            }

            await pool.execute(
            `
            UPDATE peticiones_clientes
            SET
                archivos_eliminados_at = NOW(),
                archivos_limpieza_error = NULL
            WHERE id = ?
            `,
            [row.id]
            );

            peticionesProcesadas += 1;

            detalles.push({
                peticion_id: row.id,
                ok: true,
                deleted: deletedForRow,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Error desconocido';

            peticionesConError += 1;

            await pool.execute(
                `
                    UPDATE peticiones_clientes
                    SET archivos_limpieza_error = ?
                    WHERE id = ?
                `,
            [message, row.id]
            );

            detalles.push({
                peticion_id: row.id,
                ok: false,
                deleted: deletedForRow,
                error: message,
            });
        }
        }

        return NextResponse.json({
            ok: true,
            candidatas: rows.length,
            peticionesProcesadas,
            peticionesConError,
            archivosEliminados,
            detalles,
        });
    } catch (error) {
        console.error('[GET /api/cron/peticiones/cleanup-archivos]', error);

        return NextResponse.json(
            { error: 'Error interno limpiando archivos' },
            { status: 500 }
        );
    }
}