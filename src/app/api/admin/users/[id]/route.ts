import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import bcrypt from 'bcryptjs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/admin/users/[id]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const body = await req.json();
  const setClauses: string[] = [];
  const setValues: (string | number | null)[] = [];
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }
  if (body.activo !== undefined) {
    setClauses.push('activo = ?');
    setValues.push(body.activo ? 1 : 0);
  }
  if (body.rol && ['admin', 'cliente'].includes(body.rol as string)) {
    setClauses.push('rol = ?');
    setValues.push(body.rol as string);
  }
  if (body.password) {
    const hash = await bcrypt.hash(body.password as string, 12);
    setClauses.push('password = ?');
    setValues.push(hash);
  }
  if (body.desbloquear) {
    setClauses.push('intentos_login = 0');
    setClauses.push('bloqueado_hasta = NULL');
  }
  if (!setClauses.length) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 });
  }

  const sql = `UPDATE usuarios_clientes SET ${setClauses.join(', ')} WHERE id = ?`;
  const values = [...setValues, Number(id)];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await pool.execute(sql, values as any);

  await logAction(session.user.id, 'editar_usuario', 'usuarios', `ID: ${id}`);
  return NextResponse.json({ ok: true });
}

// DELETE /api/admin/users/[id]
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  if (String(id) === String(session.user.id)) {
    return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
  }

  await pool.execute(
    'UPDATE usuarios_clientes SET activo = 0 WHERE id = ?',
    [Number(id)]
  );

  await logAction(session.user.id, 'desactivar_usuario', 'usuarios', `ID: ${id}`);
  return NextResponse.json({ ok: true });
}