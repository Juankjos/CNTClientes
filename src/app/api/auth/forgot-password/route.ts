// src/app/api/auth/forgot-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import { consumeRateLimit } from '@/lib/rate-limit';
import { sendPasswordResetEmail } from '@/lib/mail';
import { logAction } from '@/lib/logger';

function hashToken(token: string) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function getClientIp(req: NextRequest) {
    const forwarded = req.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getPublicBaseUrl(req: NextRequest) {
    const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');
    if (appUrl) return appUrl;

    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');

    if (!host) {
        throw new Error('No se pudo determinar el host público');
    }

    return `${proto}://${host}`;
}

export async function POST(req: NextRequest) {
    const ip = getClientIp(req);

    try {
        const byIp = await consumeRateLimit(
            'forgot_password_ip',
            ip,
            5,
            15 * 60,
            30 * 60
        );

        if (!byIp.ok) {
        return NextResponse.json(
            {
                error: `Demasiados intentos. Intenta en ${byIp.retryAfterSeconds} segundos.`,
            },
            { status: 429 }
        );
        }

        const body = await req.json();
        const email = String(body.email ?? '').trim().toLowerCase();

        if (!email || !isValidEmail(email)) {
            return NextResponse.json(
                { error: 'Ingresa un correo electrónico válido' },
                { status: 400 }
            );
        }

        const byEmail = await consumeRateLimit(
            'forgot_password_email',
            email,
            3,
            60 * 60,
            60 * 60
        );

        if (!byEmail.ok) {
            return NextResponse.json(
                { error: 'Demasiados intentos para este correo. Intenta más tarde.' },
                { status: 429 }
            );
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
            `SELECT id, username, email, activo
                FROM usuarios_clientes
                WHERE email = ?
                LIMIT 1`,
            [email]
        );

        if (!rows.length || Number(rows[0].activo) !== 1) {
        return NextResponse.json({
            ok: true,
            message:
            'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.',
        });
        }

        const user = rows[0];

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = hashToken(rawToken);

        await pool.execute<ResultSetHeader>(
            `UPDATE usuarios_clientes_password_resets
            SET used_at = NOW()
            WHERE usuario_id = ? AND used_at IS NULL`,
            [user.id]
        );

        await pool.execute<ResultSetHeader>(
            `INSERT INTO usuarios_clientes_password_resets
                (usuario_id, token_hash, expires_at, used_at)
            VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR), NULL)`,
            [user.id, tokenHash]
        );

        const BASE_PATH = '/CNTClientes';

        function getPublicAppUrl(req: NextRequest) {
            const appUrl = process.env.APP_URL?.trim().replace(/\/$/, '');

            if (appUrl) {
                return appUrl.endsWith(BASE_PATH) ? appUrl : `${appUrl}${BASE_PATH}`;
            }

            const proto = req.headers.get('x-forwarded-proto') ?? 'https';
            const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');

            if (!host) {
                throw new Error('No se pudo determinar el host público');
            }

            return `${proto}://${host}${BASE_PATH}`;
        }

        const baseUrl = getPublicAppUrl(req);
        const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;

        await sendPasswordResetEmail(user.email, user.username, resetUrl);

        await logAction(
            user.id,
            'solicitar_reset_password',
            'auth',
            `Solicitud de recuperación de contraseña | IP: ${ip}`,
            ip,
            'info'
        );

        return NextResponse.json({
            ok: true,
            message:
                'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.',
        });
    } catch (error) {
        console.error('[POST /api/auth/forgot-password]', error);

        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    }
}