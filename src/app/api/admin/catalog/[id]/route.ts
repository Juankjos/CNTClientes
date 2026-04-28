// src/app/api/admin/catalog/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

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

// PUT - actualizar item
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const { id } = await params;
        const catalogoId = Number(id);

        if (!Number.isInteger(catalogoId) || catalogoId <= 0) {
            return NextResponse.json(
                { error: 'ID inválido' },
                { status: 400 }
            );
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

        await pool.execute<ResultSetHeader>(
            `
            UPDATE catalogo_clientes
            SET
                titulo = ?,
                descripcion = ?,
                categoria = ?,
                usa_rango_fechas = ?,
                rango_dias = ?,
                precio = ?,
                imagen = ?,
                activo = ?
            WHERE id = ?
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
                catalogoId,
            ]
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[PUT /api/admin/catalog/[id]] Error:', error);

        return NextResponse.json(
            { error: 'Error interno al actualizar item' },
            { status: 500 }
        );
    }
}

// DELETE - eliminar item
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const { id } = await params;
        const catalogoId = Number(id);

        if (!Number.isInteger(catalogoId) || catalogoId <= 0) {
            return NextResponse.json(
                { error: 'ID inválido' },
                { status: 400 }
            );
        }

        await pool.execute<ResultSetHeader>(
            'DELETE FROM catalogo_clientes WHERE id = ?',
            [catalogoId]
        );

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error('[DELETE /api/admin/catalog/[id]] Error:', error);
        return NextResponse.json(
            { error: 'Error interno al eliminar item' },
            { status: 500 }
        );
    }
}