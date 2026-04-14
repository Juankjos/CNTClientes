import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rate-limit';
import { verifyCaptchaToken } from '@/lib/captcha';
import { sendVerificationEmail } from '@/lib/mail';
import { logAction } from '@/lib/logger';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getClientIp(req: NextRequest) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  try {
    const byIp = await consumeRateLimit('register_ip', ip, 10, 15 * 60, 30 * 60);
    if (!byIp.ok) {
      return NextResponse.json(
        { error: `Demasiados intentos. Intenta en ${byIp.retryAfterSeconds} segundos.` },
        { status: 429 }
      );
    }

    const body = await req.json();
    const {
      username,
      email,
      password,
      confirmPassword,
      nombre,
      apellidos,
      telefono,
      empresa,
      captchaToken,
    } = body;

    if (!username || !email || !password || !confirmPassword || !nombre || !apellidos) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios' },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: 'Las contraseñas no coinciden' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'La contraseña debe tener al menos 8 caracteres' },
        { status: 400 }
      );
    }

    const usernameClean = String(username).trim();
    const emailClean = String(email).trim().toLowerCase();

    const captchaOk = await verifyCaptchaToken(String(captchaToken || ''), ip);
    if (!captchaOk) {
      return NextResponse.json(
        { error: 'Captcha inválido' },
        { status: 400 }
      );
    }

    const byEmail = await consumeRateLimit('register_email', emailClean, 5, 60 * 60, 60 * 60);
    if (!byEmail.ok) {
      return NextResponse.json(
        { error: 'Demasiados intentos para este correo. Intenta más tarde.' },
        { status: 429 }
      );
    }

    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();

      const [dupes] = await conn.execute<RowDataPacket[]>(
        `SELECT id, username, email
          FROM usuarios_clientes
          WHERE username = ? OR email = ?
          LIMIT 2`,
        [usernameClean, emailClean]
      );

      if (dupes.some((row) => row.username === usernameClean)) {
        await conn.rollback();
        return NextResponse.json(
          { error: 'El nombre de usuario ya está registrado' },
          { status: 409 }
        );
      }

      if (dupes.some((row) => String(row.email).toLowerCase() === emailClean)) {
        await conn.rollback();
        return NextResponse.json(
          { error: 'El correo ya está registrado' },
          { status: 409 }
        );
      }

      const passwordHash = await bcrypt.hash(password, 12);

      const [userResult] = await conn.execute<ResultSetHeader>(
        `INSERT INTO usuarios_clientes
          (username, email, password, rol, activo, intentos_login, bloqueado_hasta, ultimo_login, ultima_ip, email_verificado_at)
            VALUES (?, ?, ?, 'cliente', 1, 0, NULL, NULL, NULL, NULL)`,
        [usernameClean, emailClean, passwordHash]
      );

      const usuarioId = userResult.insertId;

      await conn.execute<ResultSetHeader>(
        `INSERT INTO clientes_clientes
          (usuario_id, nombre, apellidos, telefono, email, empresa)
            VALUES (?, ?, ?, ?, ?, ?)`,
        [
          usuarioId,
          String(nombre).trim(),
          String(apellidos).trim(),
          telefono ? String(telefono).trim() : null,
          emailClean,
          empresa ? String(empresa).trim() : null,
        ]
      );

      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(rawToken);

      await conn.execute<ResultSetHeader>(
        `INSERT INTO usuarios_clientes_verificaciones
          (usuario_id, token_hash, expires_at, used_at)
          VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), NULL)`,
        [usuarioId, tokenHash]
      );

      await conn.commit();

      const baseUrl = process.env.APP_URL || 'https://nube.tvctepa.com/CNTClientes';
      const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${rawToken}`;

      await sendVerificationEmail(emailClean, usernameClean, verifyUrl);
      await logAction(usuarioId, 'registro', 'auth', `Registro público | IP: ${ip}`, ip, 'info');

      return NextResponse.json({
        ok: true,
        message: 'Cuenta creada. Revisa tu correo para verificarla.',
      });
    } catch (error: any) {
      await conn.rollback();

      if (error?.code === 'ER_DUP_ENTRY') {
        return NextResponse.json(
          { error: 'Usuario o correo ya registrado' },
          { status: 409 }
        );
      }

      throw error;
    } finally {
      conn.release();
    }
  } catch (err) {
    console.error('[POST /api/auth/register]', err);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}