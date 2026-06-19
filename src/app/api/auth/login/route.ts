// src/app/api/auth/login/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { getSession } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const identifier = String(body.identifier ?? body.username ?? '').trim();
    const password = String(body.password ?? '');

    if (!identifier || !password) {
      return NextResponse.json(
        { error: 'Usuario/correo y contraseña requeridos' },
        { status: 400 }
      );
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
      req.headers.get('x-real-ip') ??
      '0.0.0.0';

    const userAgent = req.headers.get('user-agent') ?? '';

    const result = await login(identifier, password, ip, userAgent);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const session = await getSession();
    session.user = result.user!;
    await session.save();

    return NextResponse.json({ ok: true, user: result.user });
  } catch (err) {
    console.error('[POST /api/auth/login]', err);

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
