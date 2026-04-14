// src/app/api/auth/verify-email/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from '@/lib/db';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getPublicOrigin(req: NextRequest) {
  const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (appUrl) return appUrl;

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host =
    req.headers.get('x-forwarded-host') ??
    req.headers.get('host');

  if (!host) {
    throw new Error('No se pudo determinar el host público');
  }

  return `${proto}://${host}`;
}

function buildLoginRedirect(req: NextRequest, status: string) {
  const url = new URL('/CNTClientes/login', getPublicOrigin(req));
  url.searchParams.set('verified', status);
  return url;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(buildLoginRedirect(req, 'invalid'));
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const tokenHash = hashToken(token);

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT v.id, v.usuario_id, v.expires_at, v.used_at, u.email_verificado_at
        FROM usuarios_clientes_verificaciones v
        INNER JOIN usuarios_clientes u ON u.id = v.usuario_id
        WHERE v.token_hash = ?
        LIMIT 1
        FOR UPDATE`,
      [tokenHash]
    );

    if (!rows.length) {
      await conn.rollback();
      return NextResponse.redirect(buildLoginRedirect(req, 'invalid'));
    }

    const row = rows[0];
    const expired = new Date(row.expires_at) < new Date();

    // Si ya está verificado, no lo presentes como error.
    if (row.email_verificado_at) {
      await conn.rollback();
      return NextResponse.redirect(buildLoginRedirect(req, 'already_verified'));
    }

    if (expired) {
      await conn.rollback();
      return NextResponse.redirect(buildLoginRedirect(req, 'expired'));
    }

    if (row.used_at) {
      await conn.rollback();
      return NextResponse.redirect(buildLoginRedirect(req, 'already_verified'));
    }

    await conn.execute<ResultSetHeader>(
      `UPDATE usuarios_clientes_verificaciones
        SET used_at = NOW()
        WHERE id = ?`,
      [row.id]
    );

    await conn.execute<ResultSetHeader>(
      `UPDATE usuarios_clientes
        SET email_verificado_at = NOW()
        WHERE id = ? AND email_verificado_at IS NULL`,
      [row.usuario_id]
    );

    await conn.commit();

    return NextResponse.redirect(buildLoginRedirect(req, 'success'));
  } catch (error) {
    await conn.rollback();
    console.error('[GET /api/auth/verify-email]', error);
    return NextResponse.redirect(buildLoginRedirect(req, 'error'));
  } finally {
    conn.release();
  }
}