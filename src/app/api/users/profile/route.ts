// src/app/api/users/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';

// GET /api/users/profile
export async function GET() {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.id, u.username, u.email, u.rol, u.ultimo_login, u.created_at,
            cl.nombre, cl.apellidos, cl.telefono, cl.empresa
      FROM usuarios_clientes u
      LEFT JOIN clientes_clientes cl ON cl.usuario_id = u.id
      WHERE u.id = ?`,
    [session.user.id]
  );

  if (!rows.length) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  return NextResponse.json(rows[0]);
}

// PATCH /api/users/profile — Actualizar perfil
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      nombre,
      apellidos,
      telefono,
      empresa,
      password_nuevo,
      password_actual,
    } = body;

    // 1) Cambio de contraseña
    if (password_nuevo) {
      if (!password_actual) {
        return NextResponse.json(
          { error: 'Se requiere la contraseña actual' },
          { status: 400 }
        );
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT password FROM usuarios_clientes WHERE id = ?`,
        [session.user.id]
      );

      if (!rows.length) {
        return NextResponse.json(
          { error: 'Usuario no encontrado' },
          { status: 404 }
        );
      }

      const ok = await bcrypt.compare(password_actual, rows[0].password);
      if (!ok) {
        return NextResponse.json(
          { error: 'Contraseña actual incorrecta' },
          { status: 400 }
        );
      }

      const hash = await bcrypt.hash(password_nuevo, 12);
      await pool.execute(
        `UPDATE usuarios_clientes SET password = ? WHERE id = ?`,
        [hash, session.user.id]
      );
    }

    // 2) Actualizar perfil solo si llegaron campos de perfil
    const hasProfileFields =
      Object.prototype.hasOwnProperty.call(body, 'nombre') ||
      Object.prototype.hasOwnProperty.call(body, 'apellidos') ||
      Object.prototype.hasOwnProperty.call(body, 'telefono') ||
      Object.prototype.hasOwnProperty.call(body, 'empresa');

    if (hasProfileFields) {
      const [exists] = await pool.execute<RowDataPacket[]>(
        `SELECT id FROM clientes_clientes WHERE usuario_id = ?`,
        [session.user.id]
      );

      const safeNombre = nombre ?? null;
      const safeApellidos = apellidos ?? null;
      const safeTelefono = telefono ?? null;
      const safeEmpresa = empresa ?? null;

      if (exists.length) {
        await pool.execute(
          `UPDATE clientes_clientes
           SET nombre = ?, apellidos = ?, telefono = ?, empresa = ?
           WHERE usuario_id = ?`,
          [safeNombre, safeApellidos, safeTelefono, safeEmpresa, session.user.id]
        );
      } else {
        await pool.execute(
          `INSERT INTO clientes_clientes
           (usuario_id, nombre, apellidos, telefono, empresa, email)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            session.user.id,
            safeNombre,
            safeApellidos,
            safeTelefono,
            safeEmpresa,
            session.user.email,
          ]
        );
      }
    }

    await logAction(
      session.user.id,
      'actualizar_perfil',
      'usuarios',
      'Perfil actualizado'
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/users/profile error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}