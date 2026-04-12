//src/app/api/admin/catalog/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
    return !session.user || session.user.rol !== 'admin';
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
        const body = await req.json();
        const { titulo, descripcion, categoria, precio, imagen, activo } = body;

        if (!titulo || !categoria) {
        return NextResponse.json(
            { error: 'Faltan campos requeridos' },
            { status: 400 }
        );
        }

        await pool.execute<ResultSetHeader>(
        `UPDATE catalogo_clientes
        SET titulo = ?, descripcion = ?, categoria = ?, precio = ?, imagen = ?, activo = ?
        WHERE id = ?`,
        [
            titulo,
            descripcion || null,
            categoria,
            precio || 0,
            imagen || null,
            activo ? 1 : 0,
            id,
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

        await pool.execute<ResultSetHeader>(
        'DELETE FROM catalogo_clientes WHERE id = ?',
        [id]
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