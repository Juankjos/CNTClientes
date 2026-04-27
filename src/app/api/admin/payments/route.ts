// src/app/api/admin/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'admin') {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      );
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const limit = 10;
    const offset = (page - 1) * limit;

    const rowsSql = `
      SELECT
        p.*,
        c.titulo,
        c.categoria,
        c.imagen,
        cl.nombre,
        cl.apellidos,
        cl.email
      FROM pagos_clientes p
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(rowsSql);

    const [countRows] = await pool.execute<RowDataPacket[]>(`
      SELECT COUNT(*) AS total
      FROM pagos_clientes
    `);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      pagos: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/payments] error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al obtener pagos',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}