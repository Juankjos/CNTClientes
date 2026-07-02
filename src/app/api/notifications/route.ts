// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const rawLimit = req.nextUrl.searchParams.get('limit');
    const parsedLimit = Number.parseInt(rawLimit ?? '10', 10);
    const limit = Number.isInteger(parsedLimit)
      ? Math.min(Math.max(parsedLimit, 1), 30)
      : 10;

    const [notifications] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        n.id,
        n.actor_usuario_id,
        actor.username AS actor_username,
        n.peticion_id,
        n.tipo,
        n.titulo,
        n.mensaje,
        n.url,
        n.leida_at,
        DATE_FORMAT(n.created_at, '%Y-%m-%d %H:%i:%s') AS created_at
      FROM notificaciones_clientes n
      LEFT JOIN usuarios_clientes actor
        ON actor.id = n.actor_usuario_id
      WHERE n.usuario_id = ?
      ORDER BY n.created_at DESC, n.id DESC
      LIMIT ${limit}
      `,
      [session.user.id]
    );

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS unread
      FROM notificaciones_clientes
      WHERE usuario_id = ?
        AND leida_at IS NULL
      `,
      [session.user.id]
    );

    return NextResponse.json({
      notifications,
      unread: Number(countRows[0]?.unread ?? 0),
    });
  } catch (error) {
    console.error('[GET /api/notifications]', error);

    return NextResponse.json(
      { error: 'Error interno al cargar notificaciones' },
      { status: 500 }
    );
  }
}

export async function PATCH() {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    await pool.execute<ResultSetHeader>(
      `
      UPDATE notificaciones_clientes
      SET leida_at = NOW()
      WHERE usuario_id = ?
        AND leida_at IS NULL
      `,
      [session.user.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/notifications]', error);

    return NextResponse.json(
      { error: 'Error interno al actualizar notificaciones' },
      { status: 500 }
    );
  }
}