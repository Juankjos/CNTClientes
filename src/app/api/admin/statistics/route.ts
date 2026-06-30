//src/app/api/admin/statistics/route.ts
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

type MonthlyYearRow = RowDataPacket & {
    month_number: string | number;
    total_pagos: string | number;
    pagos_gratuitos: string | number;
    pagos_de_paga: string | number;
    ingresos_pagados: string | number;
};

type ItemYearRow = RowDataPacket & {
    titulo: string | null;
    categoria: string | null;
    total_pagos: string | number;
    pagos_gratuitos: string | number;
    pagos_de_paga: string | number;
    ingresos_pagados: string | number;
};

const MONTH_LABELS = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic',
];

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

function buildYearRange(year: number) {
    return {
        startSql: `${year}-01-01 00:00:00`,
        endSql: `${year + 1}-01-01 00:00:00`,
    };
}

function parseYear(req: NextRequest) {
    const now = new Date();
    const rawYear = req.nextUrl.searchParams.get('year');
    const year = Number.parseInt(rawYear ?? String(now.getFullYear()), 10);

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
        throw new Error('Año inválido');
    }

    return year;
}

function parseYearMonth(req: NextRequest) {
    const now = new Date();

    const year = parseYear(req);
    const rawMonth = req.nextUrl.searchParams.get('month');
    const month = Number.parseInt(rawMonth ?? String(now.getMonth() + 1), 10);

    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('Mes inválido');
    }

    return { year, month };
}

async function requireAdmin() {
    const session = await getSession();

    if (!session.user) {
        return {
            ok: false as const,
            response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }),
        };
    }

    if (session.user.rol !== 'admin') {
        return {
            ok: false as const,
            response: NextResponse.json({ error: 'No autorizado' }, { status: 403 }),
        };
    }

    return { ok: true as const };
}

async function getMonthStats(req: NextRequest) {
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
        view: 'month',
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
}

async function getYearStats(req: NextRequest) {
    const year = parseYear(req);
    const { startSql, endSql } = buildYearRange(year);

    const [monthlyRows] = await pool.execute<MonthlyYearRow[]>(
        `
        SELECT
            MONTH(p.pagado_at) AS month_number,
            COUNT(*) AS total_pagos,
            SUM(CASE WHEN p.monto = 0 THEN 1 ELSE 0 END) AS pagos_gratuitos,
            SUM(CASE WHEN p.monto > 0 THEN 1 ELSE 0 END) AS pagos_de_paga,
            COALESCE(SUM(CASE WHEN p.monto > 0 THEN p.monto ELSE 0 END), 0) AS ingresos_pagados
        FROM pagos_clientes p
        WHERE p.estatus = 'pagado'
            AND p.pagado_at >= ?
            AND p.pagado_at < ?
        GROUP BY MONTH(p.pagado_at)
        ORDER BY month_number ASC
        `,
        [startSql, endSql]
    );

    const monthlyMap = new Map<number, MonthlyYearRow>();

    for (const row of monthlyRows) {
        monthlyMap.set(Number(row.month_number), row);
    }

    const monthly = Array.from({ length: 12 }, (_, index) => {
        const monthNumber = index + 1;
        const row = monthlyMap.get(monthNumber);

        return {
            month: monthNumber,
            label: MONTH_LABELS[index],
            total_pagos: Number(row?.total_pagos ?? 0),
            pagos_gratuitos: Number(row?.pagos_gratuitos ?? 0),
            pagos_de_paga: Number(row?.pagos_de_paga ?? 0),
            ingresos_pagados: Number(row?.ingresos_pagados ?? 0),
        };
    });

    const [itemRows] = await pool.execute<ItemYearRow[]>(
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

            COUNT(*) AS total_pagos,
            SUM(CASE WHEN p.monto = 0 THEN 1 ELSE 0 END) AS pagos_gratuitos,
            SUM(CASE WHEN p.monto > 0 THEN 1 ELSE 0 END) AS pagos_de_paga,
            COALESCE(SUM(CASE WHEN p.monto > 0 THEN p.monto ELSE 0 END), 0) AS ingresos_pagados
            FROM pagos_clientes p
            WHERE p.estatus = 'pagado'
                AND p.pagado_at >= ?
                AND p.pagado_at < ?
            GROUP BY titulo, categoria
            ORDER BY ingresos_pagados DESC, total_pagos DESC, titulo ASC
            LIMIT 10
        `,
        [startSql, endSql]
    );

    const items = itemRows.map((row) => ({
        titulo: row.titulo ?? '—',
        categoria: row.categoria ?? 'sin_categoria',
        total_pagos: Number(row.total_pagos ?? 0),
        pagos_gratuitos: Number(row.pagos_gratuitos ?? 0),
        pagos_de_paga: Number(row.pagos_de_paga ?? 0),
        ingresos_pagados: Number(row.ingresos_pagados ?? 0),
    }));

    const summary = monthly.reduce(
        (acc, row) => {
            acc.total_pagos += row.total_pagos;
            acc.pagos_gratuitos += row.pagos_gratuitos;
            acc.pagos_de_paga += row.pagos_de_paga;
            acc.ingresos_pagados += row.ingresos_pagados;

        return acc;
        },
        {
            total_pagos: 0,
            pagos_gratuitos: 0,
            pagos_de_paga: 0,
            ingresos_pagados: 0,
        }
    );

    return NextResponse.json({
        view: 'year',
        year: {
            year,
            start: startSql,
            end: endSql,
        },
        summary,
        monthly,
        items,
    });
}

export async function GET(req: NextRequest) {
    try {
        const admin = await requireAdmin();

        if (!admin.ok) {
            return admin.response;
        }

        const view = req.nextUrl.searchParams.get('view') ?? 'month';

        if (view === 'year') {
            return getYearStats(req);
        }

        return getMonthStats(req);
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