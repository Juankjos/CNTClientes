// src/app/api/admin/catalog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

const VALID_CATEGORIAS = new Set(['reportaje', 'noticia', 'entrevista', 'especial']);

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
    return !session.user || session.user.rol !== 'admin';
}

function normalizeCategoria(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

function normalizeCatalogRange({
    categoria,
    usa_rango_fechas,
    rango_dias,
}: {
    categoria: string;
    usa_rango_fechas: unknown;
    rango_dias: unknown;
}) {
    const isEspecial = categoria === 'especial';
    const safeUsaRangoFechas = isEspecial ? Boolean(usa_rango_fechas) : false;
    const safeRangoDias =
        isEspecial && safeUsaRangoFechas ? Number(rango_dias) : null;

    if (
        isEspecial &&
        safeUsaRangoFechas &&
        (!Number.isInteger(safeRangoDias) || Number(safeRangoDias) <= 0)
    ) {
        return {
        ok: false as const,
        error: 'rango_dias debe ser un entero mayor a 0.',
        };
    }

    return {
        ok: true as const,
        usaRangoFechas: safeUsaRangoFechas,
        rangoDias: safeRangoDias,
    };
}

// GET - listar todos incluyendo inactivos
export async function GET() {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
        `
        SELECT
            id,
            titulo,
            descripcion,
            categoria,
            usa_rango_fechas,
            rango_dias,
            precio,
            imagen,
            archivo,
            activo,
            fecha_publicacion
        FROM catalogo_clientes
        ORDER BY fecha_publicacion DESC
        `
        );

        return NextResponse.json(rows);
    } catch (error) {
        console.error('[GET /api/admin/catalog] Error:', error);
        return NextResponse.json(
        { error: 'Error interno al listar catálogo' },
        { status: 500 }
        );
    }
}

// POST - crear nuevo item
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const body = await req.json();

        const {
            titulo,
            descripcion,
            categoria,
            usa_rango_fechas,
            rango_dias,
            precio,
            imagen,
            activo,
        } = body;

        const safeTitulo = String(titulo ?? '').trim();
        const safeCategoria = normalizeCategoria(categoria);

        if (!safeTitulo || !safeCategoria) {
            return NextResponse.json(
                { error: 'Faltan campos requeridos' },
                { status: 400 }
            );
        }

        if (!VALID_CATEGORIAS.has(safeCategoria)) {
            return NextResponse.json(
                { error: 'Categoría inválida' },
                { status: 400 }
            );
        }

        const range = normalizeCatalogRange({
            categoria: safeCategoria,
            usa_rango_fechas,
            rango_dias,
        });

        if (!range.ok) {
            return NextResponse.json({ error: range.error }, { status: 400 });
        }

        const [result] = await pool.execute<ResultSetHeader>(
        `
        INSERT INTO catalogo_clientes
        (
            titulo,
            descripcion,
            categoria,
            usa_rango_fechas,
            rango_dias,
            precio,
            imagen,
            activo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            safeTitulo,
            descripcion ? String(descripcion).trim() : null,
            safeCategoria,
            range.usaRangoFechas ? 1 : 0,
            range.rangoDias,
            Number(precio) || 0,
            imagen || null,
            activo ? 1 : 0,
        ]
        );

        return NextResponse.json(
            { ok: true, id: result.insertId },
            { status: 201 }
        );
    } catch (error) {
        console.error('[POST /api/admin/catalog] Error:', error);
        return NextResponse.json(
            { error: 'Error interno al crear item' },
            { status: 500 }
        );
    }
}