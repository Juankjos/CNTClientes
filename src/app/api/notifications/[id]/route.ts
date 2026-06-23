// src/app/api/notifications/[id]/route.ts
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader } from 'mysql2';

export async function PATCH(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await ctx.params;

    await pool.execute<ResultSetHeader>(
      `
      UPDATE notificaciones_clientes
      SET leida_at = COALESCE(leida_at, NOW())
      WHERE id = ?
        AND usuario_id = ?
      `,
      [id, session.user.id]
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[PATCH /api/notifications/[id]]', error);

    return NextResponse.json(
      { error: 'Error interno al actualizar notificación' },
      { status: 500 }
    );
  }
}