// src/app/api/admin/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

const VALID_LEVELS = new Set(['debug', 'info', 'warning', 'error']);

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user || session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const searchParams = req.nextUrl.searchParams;

    const rawPage = searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const limit = 20;
    const offset = (page - 1) * limit;

    const nivel = String(searchParams.get('nivel') ?? '').trim();
    const q = String(searchParams.get('q') ?? '').trim();

    const whereParts: string[] = [];
    const params: Array<string | number> = [];

    if (nivel) {
      if (!VALID_LEVELS.has(nivel)) {
        return NextResponse.json(
          { error: 'Nivel de log inválido' },
          { status: 400 }
        );
      }

      whereParts.push('l.nivel = ?');
      params.push(nivel);
    }

    if (q) {
      whereParts.push(`
        (
          u.username LIKE ?
          OR l.accion LIKE ?
          OR l.modulo LIKE ?
          OR l.descripcion LIKE ?
          OR l.ip LIKE ?
          OR l.nivel LIKE ?
        )
      `);

      const like = `%${q}%`;
      params.push(like, like, like, like, like, like);
    }

    const whereSql = whereParts.length
      ? `WHERE ${whereParts.join(' AND ')}`
      : '';

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT
          l.id,
          l.usuario_id,
          l.accion,
          l.modulo,
          l.descripcion,
          l.ip,
          l.nivel,
          l.created_at,
          u.username
        FROM logs_clientes l
        LEFT JOIN usuarios_clientes u ON u.id = l.usuario_id
        ${whereSql}
        ORDER BY l.created_at DESC, l.id DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `
        SELECT COUNT(*) AS total
        FROM logs_clientes l
        LEFT JOIN usuarios_clientes u ON u.id = l.usuario_id
        ${whereSql}
      `,
      params
    );

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      logs: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/admin/logs] Error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al cargar logs',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}