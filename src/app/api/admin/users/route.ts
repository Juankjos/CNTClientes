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

    const where = q
      ? `
        WHERE
          u.username LIKE ?
          OR u.email LIKE ?
          OR c.nombre LIKE ?
          OR c.apellidos LIKE ?
          OR CONCAT_WS(' ', c.nombre, c.apellidos) LIKE ?
          OR c.telefono LIKE ?
      `
      : '';

    const filterParams: (string | number)[] = q
      ? [`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`]
      : [];

    const rowsSql = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.rol,
        u.activo,
        u.intentos_login,
        u.bloqueado_hasta,
        u.ultimo_login,
        u.ultima_ip,
        c.nombre,
        c.apellidos,
        c.telefono
      FROM usuarios_clientes u
      LEFT JOIN clientes_clientes c
        ON c.usuario_id = u.id
      ${where}
      ORDER BY u.id DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(rowsSql, filterParams);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM usuarios_clientes u
      LEFT JOIN clientes_clientes c
        ON c.usuario_id = u.id
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
  const connection = await pool.getConnection();
  try {
    const session = await getSession();
    if (requireAdmin(session)) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();

    const username = String(body.username ?? '').trim();
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const rol = body.rol === 'admin' ? 'admin' : 'cliente';

    const nombre = String(body.nombre ?? '').trim();
    const apellidos = String(body.apellidos ?? '').trim();
    const telefono = String(body.telefono ?? '').trim();
    const empresa = String(body.empresa ?? '').trim();

    if (!username || !email || !password) {
      return NextResponse.json(
        { error: 'Campos requeridos: username, email, password' },
        { status: 400 }
      );
    }

    if (!['admin', 'cliente'].includes(rol)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    await connection.beginTransaction();

    const hash = await bcrypt.hash(password, 12);

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO usuarios_clientes (
          username,
          email,
          password,
          rol,
          email_verificado_at
      )
      VALUES (?, ?, ?, ?, NOW())`,
      [username, email, hash, rol]
    );

    const usuarioId = result.insertId;

    if (rol === 'cliente') {
      await connection.execute(
        `INSERT INTO clientes_clientes (
            usuario_id,
            nombre,
            apellidos,
            telefono,
            email,
            empresa
        )
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          usuarioId,
          nombre || null,
          apellidos || null,
          telefono || null,
          email,
          empresa || null,
        ]
      );
    }

    await connection.commit();

    await logAction(
      session.user!.id,
      'crear_usuario',
      'usuarios',
      `ID: ${usuarioId} - ${username} - rol: ${rol}`
    );

    return NextResponse.json(
      { ok: true, id: usuarioId },
      { status: 201 }
    );
  } catch (error: any) {
    await connection.rollback();

    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'El username o el email ya existen' },
        { status: 409 }
      );
    }

    console.error('[POST /api/admin/users] Error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al crear usuario',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}