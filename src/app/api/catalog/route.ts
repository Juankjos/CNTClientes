import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// GET /api/catalog — Lista paginada del catálogo (requiere sesión)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit    = Math.min(24, parseInt(searchParams.get('limit') ?? '12'));
  const categoria = searchParams.get('categoria') ?? '';
  const busqueda  = searchParams.get('q') ?? '';
  const offset   = (page - 1) * limit;

  let where = 'WHERE c.activo = 1';
  const params: (string | number)[] = [];

  if (categoria) {
    where += ' AND c.categoria = ?';
    params.push(categoria);
  }
  if (busqueda) {
    where += ' AND (c.titulo LIKE ? OR c.descripcion LIKE ?)';
    params.push(`%${busqueda}%`, `%${busqueda}%`);
  }

  // Verificar si el usuario ya pagó cada ítem
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM pagos_clientes p
        INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
        WHERE p.catalogo_id = c.id AND cl.usuario_id = ? AND p.estatus = 'pagado') AS ya_pagado
     FROM catalogo_clientes c ${where}
     ORDER BY c.fecha_publicacion DESC
     LIMIT ? OFFSET ?`,
    [session.user.id, ...params, limit, offset]
  );

  const [[{ total }]] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM catalogo_clientes c ${where}`,
    params
  );

  return NextResponse.json({
    items: rows,
    pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  });
}

// POST /api/catalog — Crear ítem (solo admin)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const body = await req.json();
  const { titulo, descripcion, categoria, precio, imagen, archivo } = body;

  if (!titulo || !categoria) {
    return NextResponse.json({ error: 'Título y categoría son requeridos' }, { status: 400 });
  }

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO catalogo_clientes (titulo, descripcion, categoria, precio, imagen, archivo)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [titulo, descripcion ?? null, categoria, precio ?? 0, imagen ?? null, archivo ?? null]
  );

  await logAction(session.user.id, 'crear_catalogo', 'catalogo', `ID: ${result.insertId} — ${titulo}`);

  return NextResponse.json({ ok: true, id: result.insertId }, { status: 201 });
}
