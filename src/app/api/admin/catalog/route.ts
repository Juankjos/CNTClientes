//src/app/api/admin/catalog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
    return !session.user || session.user.rol !== 'admin';
}

// GET - listar todos (incluyendo inactivos)
export async function GET() {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
        'SELECT * FROM catalogo_clientes ORDER BY fecha_publicacion DESC'
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
        const { titulo, descripcion, categoria, precio, imagen, activo } = body;

        if (!titulo || !categoria) {
        return NextResponse.json(
            { error: 'Faltan campos requeridos' },
            { status: 400 }
        );
        }

        const [result] = await pool.execute<ResultSetHeader>(
        `INSERT INTO catalogo_clientes
            (titulo, descripcion, categoria, precio, imagen, activo)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
            titulo,
            descripcion || null,
            categoria,
            precio || 0,
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