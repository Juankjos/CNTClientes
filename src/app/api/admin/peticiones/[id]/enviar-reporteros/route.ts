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
    fechas_omitidas: unknown;
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

type ModoEnvioReporteros = 'unica' | 'rango';

function parseRequestBody(value: unknown): { modoEnvio: ModoEnvioReporteros } {
    if (!value || typeof value !== 'object') {
        return { modoEnvio: 'unica' };
    }

    const body = value as Record<string, unknown>;

    return {
        modoEnvio: body.modoEnvio === 'rango' ? 'rango' : 'unica',
    };
}

function parseDateOnlyLocal(value: unknown): Date | null {
    const dateText = formatDateValue(value);

    if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
        return null;
    }

    const [year, month, day] = dateText.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);

    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function dateToSqlDate(date: Date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function parseFechasOmitidas(value: unknown): Set<string> {
    let parsed = value;

    if (Buffer.isBuffer(parsed)) {
        parsed = parsed.toString('utf8');
    }

    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return new Set();
        }
    }

    if (!Array.isArray(parsed)) {
        return new Set();
    }

    const fechas = parsed
        .map((item) => {
            if (typeof item === 'string') return item;

            if (item && typeof item === 'object') {
                return String((item as Record<string, unknown>).fecha ?? '');
            }

            return '';
        })
        .map((item) => item.trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));

    return new Set(fechas);
}

function getRangoDiasAplicables(peticion: PeticionRow) {
    const rangoDias = Number(peticion.rango_dias ?? 0);

    return Number.isInteger(rangoDias) && rangoDias > 0 ? rangoDias : 1;
}

function buildFechasPublicacion(
    peticion: PeticionRow,
    modoEnvio: ModoEnvioReporteros
) {
    const fechaInicial = parseDateOnlyLocal(peticion.fecha_deseada);

    if (!fechaInicial) {
        throw new Error('No se pudo calcular la fecha inicial de la petición.');
    }

    const rangoDias = getRangoDiasAplicables(peticion);

    if (modoEnvio !== 'rango' || rangoDias <= 1) {
        return [dateToSqlDate(fechaInicial)];
    }

    const fechasOmitidas = parseFechasOmitidas(peticion.fechas_omitidas);
    const fechas: string[] = [];

    let cursor = new Date(fechaInicial);
    let safety = 0;

    while (fechas.length < rangoDias && safety < 730) {
        const fechaSql = dateToSqlDate(cursor);

        if (!fechasOmitidas.has(fechaSql)) {
            fechas.push(fechaSql);
        }

        cursor = addDays(cursor, 1);
        safety += 1;
    }

    if (fechas.length < rangoDias) {
        throw new Error(
            `No se pudieron calcular ${rangoDias} fechas aplicables para publicar noticias.`
        );
    }

    return fechas;
}

function buildTituloNoticia(
    tituloBase: string,
    index: number,
    total: number,
    modoEnvio: ModoEnvioReporteros
) {
    const cleanTitle = tituloBase.trim() || 'Noticia';

    if (modoEnvio !== 'rango' || total <= 1) {
        return cleanTitle;
    }

    const dia = index + 1;
    const finalText = dia === total ? ' Final' : '';

    return `${cleanTitle} (Día ${dia}${finalText})`;
}

export async function POST(
    req: NextRequest,
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

        const body = await req.json().catch(() => ({}));
        const { modoEnvio } = parseRequestBody(body);

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

        const existingRows = await executeRows<RowDataPacket[]>(
            conn,
            `
            SELECT id
            FROM noticias
            WHERE peticion_id = ?
            ORDER BY id ASC
            `,
            [peticionId]
        );

        if (existingRows.length) {
            const existingNoticiaIds = existingRows.map((row) => Number(row.id));
            const existingNoticiaId = existingNoticiaIds[0];

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
                [peticionId, existingNoticiaIds.join(','), session.user.id]
            );

            await conn.commit();
            committed = true;

            try {
                await logAction(
                    Number(session.user.id),
                    'enviar_reporteros',
                    'peticiones',
                    `Petición ${peticionId} vinculada a noticias existentes ${existingNoticiaIds.join(',')}`
                );
            } catch (logError) {
                console.error('[logAction enviar_reporteros existing]', logError);
            }

            return NextResponse.json({
                ok: true,
                alreadyExisted: true,
                noticia_id: existingNoticiaId,
                noticia_ids: existingNoticiaIds,
                noticias_count: existingNoticiaIds.length,
            });
        }

        const fechasPublicacion = buildFechasPublicacion(peticion, modoEnvio);
        const noticiaIds: number[] = [];

        for (let index = 0; index < fechasPublicacion.length; index += 1) {
            const fechaPublicacion = fechasPublicacion[index];

            const fechaCita = combineDateAndTime(fechaPublicacion, peticion.hora_cita);

            if (!fechaCita) {
                await conn.rollback();
                return NextResponse.json(
                    { error: 'No se pudo calcular fecha_cita para noticias.' },
                    { status: 400 }
                );
            }

            const tituloNoticia = buildTituloNoticia(
                String(peticion.motivo ?? '').trim(),
                index,
                fechasPublicacion.length,
                modoEnvio
            );

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
                    tituloNoticia,
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

            noticiaIds.push(insert.insertId);
        }

        const firstNoticiaId = noticiaIds[0];

        await executeResult(
            conn,
            `
            UPDATE peticiones_clientes
            SET
                noticia_id = ?,
                enviada_reporteros_at = NOW()
            WHERE id = ?
            `,
            [firstNoticiaId, peticionId]
        );

        await executeResult(
            conn,
            `
            INSERT INTO peticiones_clientes_historial
            (peticion_id, accion, campo, valor_anterior, valor_nuevo, admin_user_id)
            VALUES (?, 'enviar_reporteros', 'noticia_id', NULL, ?, ?)
            `,
            [peticionId, noticiaIds.join(','), session.user.id]
        );

        await conn.commit();
        committed = true;

        try {
            await logAction(
                Number(session.user.id),
                'enviar_reporteros',
                'peticiones',
                `Petición ${peticionId} enviada a reporteros como ${noticiaIds.length} noticia(s): ${noticiaIds.join(',')}`
            );
        } catch (logError) {
            console.error('[logAction enviar_reporteros]', logError);
        }

        return NextResponse.json({
            ok: true,
            noticia_id: firstNoticiaId,
            noticia_ids: noticiaIds,
            noticias_count: noticiaIds.length,
            modoEnvio,
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