// src/app/api/admin/users/[id]/route.ts
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
  const userId = Number(id);

  if (!Number.isInteger(userId) || userId <= 0) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const userSetClauses: string[] = [];
  const userSetValues: (string | number | null)[] = [];

  function cleanText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  if (body.username !== undefined) {
    const username = cleanText(body.username);

    if (!username || username.length < 3) {
      return NextResponse.json(
        { error: 'El username debe tener al menos 3 caracteres' },
        { status: 400 }
      );
    }

    userSetClauses.push('username = ?');
    userSetValues.push(username);
  }

  if (body.email !== undefined) {
    const email = cleanText(body.email);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { error: 'Correo electrónico inválido' },
        { status: 400 }
      );
    }

    userSetClauses.push('email = ?');
    userSetValues.push(email);
  }

  if (body.activo !== undefined) {
    if (String(userId) === String(session.user.id) && !body.activo) {
      return NextResponse.json(
        { error: 'No puedes desactivar tu propia cuenta' },
        { status: 400 }
      );
    }

    userSetClauses.push('activo = ?');
    userSetValues.push(body.activo ? 1 : 0);
  }

  if (body.rol !== undefined) {
    if (!['admin', 'cliente'].includes(String(body.rol))) {
      return NextResponse.json(
        { error: 'Rol inválido' },
        { status: 400 }
      );
    }

    userSetClauses.push('rol = ?');
    userSetValues.push(String(body.rol));
  }

  if (body.password !== undefined && String(body.password).trim() !== '') {
    const password = String(body.password);

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    const hash = await bcrypt.hash(password, 12);

    userSetClauses.push('password = ?');
    userSetValues.push(hash);
  }

  if (body.desbloquear) {
    userSetClauses.push('intentos_login = 0');
    userSetClauses.push('bloqueado_hasta = NULL');
  }

  const clientFields = {
    nombre: cleanText(body.nombre),
    apellidos: cleanText(body.apellidos),
    telefono: cleanText(body.telefono),
    empresa: cleanText(body.empresa),
  };

  const shouldUpdateClientProfile =
    body.nombre !== undefined ||
    body.apellidos !== undefined ||
    body.telefono !== undefined ||
    body.empresa !== undefined;

  if (!userSetClauses.length && !shouldUpdateClientProfile) {
    return NextResponse.json({ error: 'Sin campos válidos' }, { status: 400 });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    if (userSetClauses.length) {
      await connection.execute(
        `UPDATE usuarios_clientes SET ${userSetClauses.join(', ')} WHERE id = ?`,
        [...userSetValues, userId]
      );
    }

    if (shouldUpdateClientProfile) {
      const [updateResult] = await connection.execute<any>(
        `
        UPDATE clientes_clientes
        SET
          nombre = ?,
          apellidos = ?,
          telefono = ?,
          empresa = ?
        WHERE usuario_id = ?
        `,
        [
          clientFields.nombre,
          clientFields.apellidos,
          clientFields.telefono,
          clientFields.empresa,
          userId,
        ]
      );

      if (Number(updateResult.affectedRows ?? 0) === 0) {
        await connection.execute(
          `
          INSERT INTO clientes_clientes
            (usuario_id, nombre, apellidos, telefono, empresa)
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            userId,
            clientFields.nombre,
            clientFields.apellidos,
            clientFields.telefono,
            clientFields.empresa,
          ]
        );
      }
    }

    await connection.commit();

    await logAction(
      session.user.id,
      'editar_usuario',
      'usuarios',
      `ID: ${id}`
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    await connection.rollback();

    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { error: 'El username o correo ya está en uso por otro usuario' },
        { status: 409 }
      );
    }

    console.error('[PATCH /api/admin/users/[id]]', error);

    return NextResponse.json(
      { error: 'Error interno al actualizar usuario' },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
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