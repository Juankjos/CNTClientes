// src/app/api/catalog/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const userId = Number((session.user as any).id);
    if (!Number.isFinite(userId) || userId <= 0) {
      console.error('[GET /api/catalog/[id]] session.user inválido:', session.user);
      return NextResponse.json(
        { error: 'Sesión inválida: falta user.id' },
        { status: 500 }
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT c.*, 0 AS ya_pagado
       FROM catalogo_clientes c
       WHERE c.id = ? AND c.activo = 1`,
      [id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'No encontrado' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('[GET /api/catalog/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al obtener contenido' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session.user || session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const allowed = ['titulo', 'descripcion', 'categoria', 'precio', 'imagen', 'archivo', 'activo'];
    const fields = Object.keys(body).filter((k) => allowed.includes(k));

    if (!fields.length) {
      return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 });
    }

    const sets = fields.map((f) => `${f} = ?`).join(', ');
    const vals = fields.map((f) => body[f]);

    await pool.execute<ResultSetHeader>(
      `UPDATE catalogo_clientes SET ${sets} WHERE id = ?`,
      [...vals, id]
    );

    await logAction((session.user as any).id, 'editar_catalogo', 'catalogo', `ID: ${id}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/catalog/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al actualizar contenido' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const session = await getSession();
    if (!session.user || session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    await pool.execute(
      `UPDATE catalogo_clientes SET activo = 0 WHERE id = ?`,
      [id]
    );

    await logAction((session.user as any).id, 'eliminar_catalogo', 'catalogo', `ID: ${id}`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[DELETE /api/catalog/[id]] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al eliminar contenido' },
      { status: 500 }
    );
  }
}