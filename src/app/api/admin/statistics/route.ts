import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

type StatsRow = RowDataPacket & {
    titulo: string | null;
    categoria: string | null;
    monto_pagado: string | number;
    pagos_count: string | number;
    total_ingresos: string | number;
};

type SummaryRow = RowDataPacket & {
    pagos_count: string | number;
    total_ingresos: string | number;
};

function pad(value: number) {
    return String(value).padStart(2, '0');
}

function buildMonthRange(year: number, month: number) {
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;

    return {
        startSql: `${year}-${pad(month)}-01 00:00:00`,
        endSql: `${nextYear}-${pad(nextMonth)}-01 00:00:00`,
    };
}

function parseYearMonth(req: NextRequest) {
    const now = new Date();

    const rawYear = req.nextUrl.searchParams.get('year');
    const rawMonth = req.nextUrl.searchParams.get('month');

    const year = Number.parseInt(rawYear ?? String(now.getFullYear()), 10);
    const month = Number.parseInt(rawMonth ?? String(now.getMonth() + 1), 10);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new Error('Año inválido');
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Mes inválido');
    }

    return { year, month };
}

export async function GET(req: NextRequest) {
    try {
        const session = await getSession();

        if (!session.user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
        }

        if (session.user.rol !== 'admin') {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const { year, month } = parseYearMonth(req);
        const { startSql, endSql } = buildMonthRange(year, month);

        const whereSql = `
            p.estatus = 'pagado'
            AND p.pagado_at >= ?
            AND p.pagado_at < ?
        `;

        const [summaryRows] = await pool.execute<SummaryRow[]>(
            `
            SELECT
                COUNT(*) AS pagos_count,
                COALESCE(SUM(p.monto), 0) AS total_ingresos
            FROM pagos_clientes p
            WHERE ${whereSql}
            `,
            [startSql, endSql]
        );

        const [rows] = await pool.execute<StatsRow[]>(
            `
            SELECT
            COALESCE(
                NULLIF(p.catalogo_titulo, ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.catalogo_snapshot, '$.titulo')), ''),
                CONCAT('Catálogo #', p.catalogo_id)
            ) AS titulo,

            COALESCE(
                NULLIF(p.catalogo_categoria, ''),
                NULLIF(JSON_UNQUOTE(JSON_EXTRACT(p.catalogo_snapshot, '$.categoria')), ''),
                'sin_categoria'
            ) AS categoria,

            CAST(p.monto AS DECIMAL(10,2)) AS monto_pagado,
            COUNT(*) AS pagos_count,
            COALESCE(SUM(p.monto), 0) AS total_ingresos
                FROM pagos_clientes p
                WHERE ${whereSql}
                GROUP BY titulo, categoria, monto_pagado
                ORDER BY total_ingresos DESC, pagos_count DESC, titulo ASC
                `,
                [startSql, endSql]
        );

        const summary = summaryRows[0];

        return NextResponse.json({
            month: {
                year,
                month,
                start: startSql,
                end: endSql,
            },
            summary: {
                pagos_count: Number(summary?.pagos_count ?? 0),
                total_ingresos: Number(summary?.total_ingresos ?? 0),
                grupos_count: rows.length,
            },
            rows: rows.map((row) => ({
                titulo: row.titulo ?? '—',
                categoria: row.categoria ?? 'sin_categoria',
                monto_pagado: Number(row.monto_pagado ?? 0),
                pagos_count: Number(row.pagos_count ?? 0),
                total_ingresos: Number(row.total_ingresos ?? 0),
            })),
        });
    } catch (error) {
        console.error('[GET /api/admin/statistics] error:', error);

        return NextResponse.json(
        {
            error: 'Error interno al obtener estadísticas',
            detail: error instanceof Error ? error.message : String(error),
        },
        { status: 500 }
        );
    }
}