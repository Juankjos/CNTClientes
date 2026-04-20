// src/app/api/admin/peticiones/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

const VALID_STATUS = new Set(['pendiente', 'aceptada', 'rechazada']);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const estatus = req.nextUrl.searchParams.get('estatus') ?? '';
    const q = String(req.nextUrl.searchParams.get('q') ?? '').trim();

    const limit = 10;
    const offset = (page - 1) * limit;

    const whereParts: string[] = [];
    const params: Array<string | number> = [];

    if (VALID_STATUS.has(estatus)) {
      whereParts.push('p.estatus = ?');
      params.push(estatus);
    }

    if (q) {
      whereParts.push(`(
        c.titulo LIKE ?
        OR u.username LIKE ?
        OR u.email LIKE ?
        OR cl.nombre LIKE ?
        OR cl.apellidos LIKE ?
      )`);
      const like = `%${q}%`;
      params.push(like, like, like, like, like);
    }

    const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        p.id,
        p.estatus,
        p.created_at,
        p.fecha_deseada,
        p.categoria,
        c.titulo,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', cl.nombre, cl.apellidos)), ''),
          u.username,
          cl.email,
          u.email
        ) AS cliente_nombre
      FROM peticiones_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      INNER JOIN usuarios_clientes u ON u.id = cl.usuario_id
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS total
      FROM peticiones_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      INNER JOIN usuarios_clientes u ON u.id = cl.usuario_id
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      ${whereSql}
      `,
      params
    );

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      peticiones: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/peticiones]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}