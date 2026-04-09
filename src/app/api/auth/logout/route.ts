import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';

export async function POST() {
  try {
    const session = await getSession();

    if (session.user?.id) {
      // Invalidar sesión en BD
      await pool.execute(
        `UPDATE sesiones_clientes SET expires_at = NOW() WHERE usuario_id = ?`,
        [session.user.id]
      );
    }

    session.destroy();

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[POST /api/auth/logout]', err);
    return NextResponse.json({ error: 'Error cerrando sesión' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({ authenticated: true, user: session.user });
}
