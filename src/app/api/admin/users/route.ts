// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcryptjs';

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  return !session.user || session.user.rol !== 'admin';
}

// GET /api/admin/users
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (requireAdmin(session)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const limit = 15;
    const offset = (page - 1) * limit;

    const q = (req.nextUrl.searchParams.get('q') ?? '').trim();

    const where = q ? 'WHERE username LIKE ? OR email LIKE ?' : '';
    const filterParams: (string | number)[] = q ? [`%${q}%`, `%${q}%`] : [];

    const rowsSql = `
      SELECT
        id,
        username,
        email,
        rol,
        activo,
        intentos_login,
        bloqueado_hasta,
        ultimo_login,
        ultima_ip
      FROM usuarios_clientes
      ${where}
      ORDER BY id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(rowsSql, filterParams);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM usuarios_clientes
      ${where}
    `;

    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, filterParams);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      users: rows,
      pagination: { page, limit, total },
    });
  } catch (error) {
    console.error('[GET /api/admin/users] Error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al cargar usuarios',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
// POST /api/admin/users
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (requireAdmin(session)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const { username, email, password, rol } = await req.json();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Campos requeridos: username, email, password' },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 12);

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO usuarios_clientes (username, email, password, rol)
       VALUES (?, ?, ?, ?)`,
      [username, email, hash, rol ?? 'cliente']
    );

    await logAction(
      session.user!.id,
      'crear_usuario',
      'usuarios',
      `ID: ${result.insertId} - ${username}`
    );

    return NextResponse.json({ ok: true, id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/admin/users] Error:', error);
    return NextResponse.json(
      { error: 'Error interno al crear usuario' },
      { status: 500 }
    );
  }
}