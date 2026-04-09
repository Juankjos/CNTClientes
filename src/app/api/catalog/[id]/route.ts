import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

interface Params { params: { id: string } }

// GET /api/catalog/[id]
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM pagos_clientes p
        INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
        WHERE p.catalogo_id = c.id AND cl.usuario_id = ? AND p.estatus = 'pagado') AS ya_pagado
     FROM catalogo_clientes c WHERE c.id = ? AND c.activo = 1`,
    [session.user.id, params.id]
  );

  if (!rows.length) return NextResponse.json({ error: 'No encontrado' }, { status: 404 });

  return NextResponse.json(rows[0]);
}

// PATCH /api/catalog/[id] — Actualizar (solo admin)
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const body = await req.json();
  const allowed = ['titulo', 'descripcion', 'categoria', 'precio', 'imagen', 'archivo', 'activo'];
  const fields = Object.keys(body).filter(k => allowed.includes(k));

  if (!fields.length) return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 });

  const sets = fields.map(f => `${f} = ?`).join(', ');
  const vals = fields.map(f => body[f]);

  await pool.execute<ResultSetHeader>(
    `UPDATE catalogo_clientes SET ${sets} WHERE id = ?`,
    [...vals, params.id]
  );

  await logAction(session.user.id, 'editar_catalogo', 'catalogo', `ID: ${params.id}`);

  return NextResponse.json({ ok: true });
}

// DELETE /api/catalog/[id] — Soft-delete (solo admin)
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  await pool.execute(`UPDATE catalogo_clientes SET activo = 0 WHERE id = ?`, [params.id]);
  await logAction(session.user.id, 'eliminar_catalogo', 'catalogo', `ID: ${params.id}`);

  return NextResponse.json({ ok: true });
}
