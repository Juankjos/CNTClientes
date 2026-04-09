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
  const session = await getSession();
  if (requireAdmin(session)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = 15;
  const q     = searchParams.get('q') ?? '';
  const offset = (page - 1) * limit;

  const where  = q ? "WHERE username LIKE ? OR email LIKE ?" : '';
  const params = q ? [`%${q}%`, `%${q}%`, limit, offset] : [limit, offset];

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id, username, email, rol, activo, intentos_login, bloqueado_hasta,
            ultimo_login, ultima_ip, created_at
     FROM usuarios_clientes ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params
  );

  const [[{ total }]] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM usuarios_clientes ${where}`,
    q ? [`%${q}%`, `%${q}%`] : []
  );

  return NextResponse.json({ users: rows, pagination: { page, limit, total: Number(total) } });
}

// POST /api/admin/users — Crear usuario
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (requireAdmin(session)) return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });

  const { username, email, password, rol } = await req.json();
  if (!username || !email || !password) {
    return NextResponse.json({ error: 'Campos requeridos: username, email, password' }, { status: 400 });
  }

  const hash = await bcrypt.hash(password, 12);

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO usuarios_clientes (username, email, password, rol) VALUES (?, ?, ?, ?)`,
    [username, email, hash, rol ?? 'cliente']
  );

  await logAction(session.user!.id, 'crear_usuario', 'usuarios', `ID: ${result.insertId} — ${username}`);
  return NextResponse.json({ ok: true, id: result.insertId }, { status: 201 });
}
