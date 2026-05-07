// src/app/api/admin/peticiones/[id]/enviar-reporteros/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export const runtime = 'nodejs';

const NOTICIAS_CATEGORIAS = new Set(['noticia', 'entrevista', 'reportaje']);

type PeticionRow = RowDataPacket & {
    id: number;
    cliente_id: number;
    catalogo_id: number;
    pago_id: number | null;
    categoria: string;
    motivo: string;
    descripcion: string;
    domicilio_texto: string | null;
    fecha_deseada: unknown;
    fecha_fin: unknown;
    rango_dias: number | null;
    usa_hora_cita: number | boolean;
    hora_cita: string | null;
    estatus: string;
    enviada_reporteros_at: unknown;
    noticia_id: number | null;
    usuario_cliente_id: number | null;
    fecha_pago: unknown;
    catalogo_categoria: string;
};

type DbConnection = Awaited<ReturnType<typeof pool.getConnection>>;

async function executeRows<T extends RowDataPacket[]>(
    conn: DbConnection,
    sql: string,
    values: unknown[] = []
): Promise<T> {
    const [rows] = await (conn.execute as any)(sql, values);
    return rows as T;
}

async function executeResult(
    conn: DbConnection,
    sql: string,
    values: unknown[] = []
): Promise<ResultSetHeader> {
    const [result] = await (conn.execute as any)(sql, values);
    return result as ResultSetHeader;
}

function formatDateValue(value: unknown): string | null {
    if (!value) return null;

    if (value instanceof Date) {
        const yyyy = value.getFullYear();
        const mm = String(value.getMonth() + 1).padStart(2, '0');
        const dd = String(value.getDate()).padStart(2, '0');

        return `${yyyy}-${mm}-${dd}`;
    }

    const text = String(value).trim();

    return text.length >= 10 ? text.slice(0, 10) : null;
}

function normalizeTimeForDb(value: unknown, fallback = '09:00:00') {
    if (value === undefined || value === null || value === '') return fallback;

    const text = String(value).trim();
    const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

    if (!match) return fallback;

    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const second = match[3] === undefined ? 0 : Number(match[3]);

    if (hour < 0 || hour > 23) return fallback;
    if (minute < 0 || minute > 59) return fallback;
    if (second < 0 || second > 59) return fallback;

    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function combineDateAndTime(dateValue: unknown, timeValue: unknown) {
    const date = formatDateValue(dateValue);

    if (!date) return null;

    const time = normalizeTimeForDb(timeValue);

    return `${date} ${time}`;
}

function toTipoDeNota(categoria: unknown): 'Noticia' | 'Entrevista' | 'Reportaje' {
    const value = String(categoria ?? '').trim().toLowerCase();

    if (value === 'entrevista') return 'Entrevista';
    if (value === 'reportaje') return 'Reportaje';

    return 'Noticia';
}

export async function POST(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string }> }
) {
    const conn = await pool.getConnection();
    let committed = false;

    try {
        const session = await getSession();

        if (!session.user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        if (session.user.rol !== 'admin') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const { id } = await ctx.params;
        const peticionId = Number(id);

        if (!Number.isInteger(peticionId) || peticionId <= 0) {
            return NextResponse.json({ error: 'ID inválido.' }, { status: 400 });
        }

        await conn.beginTransaction();

        const rows = await executeRows<PeticionRow[]>(
            conn,
            `
            SELECT
                p.*,
                cl.usuario_id AS usuario_cliente_id,
                pc.created_at AS fecha_pago,
                c.categoria AS catalogo_categoria
            FROM peticiones_clientes p
            INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
            LEFT JOIN pagos_clientes pc ON pc.id = p.pago_id
            INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
            WHERE p.id = ?
            LIMIT 1
            FOR UPDATE
            `,
            [peticionId]
        );

        if (!rows.length) {
            await conn.rollback();
            return NextResponse.json({ error: 'Petición no encontrada.' }, { status: 404 });
        }

        const peticion = rows[0];

        if (String(peticion.estatus) !== 'aceptada') {
            await conn.rollback();
            return NextResponse.json(
                { error: 'Primero debes aceptar la petición antes de enviarla a reporteros.' },
                { status: 400 }
            );
        }

        if (peticion.enviada_reporteros_at || peticion.noticia_id) {
            await conn.rollback();
            return NextResponse.json(
                { error: 'Esta petición ya fue enviada a reporteros.' },
                { status: 409 }
            );
        }

        const categoriaCatalogo = String(
            peticion.catalogo_categoria ?? peticion.categoria ?? ''
        ).trim().toLowerCase();

        if (!NOTICIAS_CATEGORIAS.has(categoriaCatalogo)) {
            await conn.rollback();
            return NextResponse.json(
                { error: 'Esta categoría no puede enviarse a reporteros.' },
                { status: 400 }
            );
        }

        const rangoDias = Number(peticion.rango_dias ?? 0);

        if (Number.isInteger(rangoDias) && rangoDias > 1) {
            await conn.rollback();
            return NextResponse.json(
                { error: 'No se puede enviar a reporteros una petición con rango mayor a un día.' },
                { status: 400 }
            );
        }

        const existingRows = await executeRows<RowDataPacket[]>(
            conn,
            `
            SELECT id
            FROM noticias
            WHERE peticion_id = ?
            LIMIT 1
            `,
            [peticionId]
        );

        if (existingRows.length) {
            const existingNoticiaId = Number(existingRows[0].id);

            await executeResult(
                conn,
                `
                UPDATE peticiones_clientes
                SET
                noticia_id = ?,
                enviada_reporteros_at = NOW()
                WHERE id = ?
                `,
                [existingNoticiaId, peticionId]
            );

            await executeResult(
                conn,
                `
                INSERT INTO peticiones_clientes_historial
                (peticion_id, accion, campo, valor_anterior, valor_nuevo, admin_user_id)
                VALUES (?, 'enviar_reporteros', 'noticia_id', NULL, ?, ?)
                `,
                [peticionId, String(existingNoticiaId), session.user.id]
            );

            await conn.commit();
            committed = true;

            try {
                await logAction(
                    Number(session.user.id),
                    'enviar_reporteros',
                    'peticiones',
                    `Petición ${peticionId} vinculada a noticia existente ${existingNoticiaId}`
                );
            } catch (logError) {
                console.error('[logAction enviar_reporteros existing]', logError);
            }

            return NextResponse.json({
                ok: true,
                alreadyExisted: true,
                noticia_id: existingNoticiaId,
            });
        }

        const fechaCita = combineDateAndTime(peticion.fecha_deseada, peticion.hora_cita);

        if (!fechaCita) {
            await conn.rollback();
            return NextResponse.json(
                { error: 'No se pudo calcular fecha_cita para noticias.' },
                { status: 400 }
            );
        }

        const insert = await executeResult(
            conn,
            `
            INSERT INTO noticias
            (
                noticia,
                tipo_de_nota,
                descripcion,
                peticion_id,
                cliente_cliente_id,
                usuario_cliente_id,
                domicilio,
                fecha_pago,
                fecha_cita,
                pendiente,
                ultima_mod
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW())
            `,
            [
                String(peticion.motivo ?? '').trim(),
                toTipoDeNota(categoriaCatalogo),
                String(peticion.descripcion ?? '').trim(),
                peticionId,
                peticion.cliente_id,
                peticion.usuario_cliente_id ?? null,
                peticion.domicilio_texto ?? null,
                peticion.fecha_pago ?? null,
                fechaCita,
            ]
        );

        await executeResult(
            conn,
            `
            UPDATE peticiones_clientes
            SET
                noticia_id = ?,
                enviada_reporteros_at = NOW()
            WHERE id = ?
            `,
            [insert.insertId, peticionId]
        );

        await executeResult(
            conn,
            `
            INSERT INTO peticiones_clientes_historial
            (peticion_id, accion, campo, valor_anterior, valor_nuevo, admin_user_id)
            VALUES (?, 'enviar_reporteros', 'noticia_id', NULL, ?, ?)
            `,
            [peticionId, String(insert.insertId), session.user.id]
        );

        await conn.commit();
        committed = true;

        try {
            await logAction(
                Number(session.user.id),
                'enviar_reporteros',
                'peticiones',
                `Petición ${peticionId} enviada a reporteros como noticia ${insert.insertId}`
            );
        } catch (logError) {
            console.error('[logAction enviar_reporteros]', logError);
        }

        return NextResponse.json({
            ok: true,
            noticia_id: insert.insertId,
        });
    } catch (error: any) {
        if (!committed) {
            await conn.rollback().catch(() => {});
        }

        if (error?.code === 'ER_DUP_ENTRY') {
            return NextResponse.json(
                { error: 'Esta petición ya fue enviada a reporteros.' },
                { status: 409 }
            );
        }

        console.error('[POST /api/admin/peticiones/[id]/enviar-reporteros]', {
            code: error?.code,
            errno: error?.errno,
            sqlMessage: error?.sqlMessage,
            message: error?.message,
        });

        return NextResponse.json(
            {
            error:
                process.env.NODE_ENV === 'production'
                ? 'Error interno al enviar a reporteros.'
                : error?.sqlMessage || error?.message || 'Error interno al enviar a reporteros.',
            },
            { status: 500 }
        );
    }finally {
        conn.release();
    }
}