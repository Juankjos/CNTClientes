// src/lib/auth.ts
import bcrypt from 'bcryptjs';
import { pool } from './db';
import { logAction } from './logger';
import type { RowDataPacket } from 'mysql2';
import type { SessionUser } from '@/types';

const MAX_INTENTOS  = 5;
const BLOQUEO_MIN   = 30; // minutos

interface LoginResult {
  success: boolean;
  user?: SessionUser;
  error?: string;
}

export async function login(
  username: string,
  password: string,
  ip: string,
  userAgent: string
): Promise<LoginResult> {
  const [rows] = await pool.execute<RowDataPacket[]>(
  `SELECT id, username, email, password, rol, activo, intentos_login, bloqueado_hasta, email_verificado_at
    FROM usuarios_clientes
    WHERE username = ? OR email = ?
    LIMIT 1`,
    [username, username]
  );

  if (!rows.length) {
    return { success: false, error: 'Credenciales incorrectas' };
  }

  const user = rows[0];

  // Cuenta desactivada
  if (!user.activo) {
    return { success: false, error: 'Cuenta desactivada. Contacta a soporte.' };
  }

  // Bloqueo temporal
  if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
    const diff = Math.ceil((new Date(user.bloqueado_hasta).getTime() - Date.now()) / 60000);
    return { success: false, error: `Cuenta bloqueada. Intenta en ${diff} min.` };
  }

  if (!user.email_verificado_at) {
    return { success: false, error: 'Debes verificar tu correo antes de ingresar.' };
  }

  const ok = await bcrypt.compare(password, user.password);

  if (!ok) {
    const intentos = user.intentos_login + 1;
    const bloqueado = intentos >= MAX_INTENTOS
      ? new Date(Date.now() + BLOQUEO_MIN * 60_000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    await pool.execute(
      `UPDATE usuarios_clientes SET intentos_login = ?, bloqueado_hasta = ? WHERE id = ?`,
      [intentos, bloqueado, user.id]
    );

    await logAction(user.id, 'login_fallido', 'auth', `IP: ${ip}`, ip, 'warning');

    if (bloqueado) return { success: false, error: `Cuenta bloqueada por ${BLOQUEO_MIN} minutos.` };
    return { success: false, error: `Credenciales incorrectas. Intentos restantes: ${MAX_INTENTOS - intentos}` };
  }

  // Login exitoso
  await pool.execute(
    `UPDATE usuarios_clientes
      SET intentos_login = 0, bloqueado_hasta = NULL, ultimo_login = NOW(), ultima_ip = ?
      WHERE id = ?`,
    [ip, user.id]
  );

  await logAction(user.id, 'login', 'auth', `IP: ${ip} | UA: ${userAgent.slice(0, 100)}`, ip, 'info');

  return {
    success: true,
    user: { id: user.id, username: user.username, email: user.email, rol: user.rol },
  };
}
