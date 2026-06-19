// src/app/api/auth/reset-password/route.ts
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
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
    const conn = await pool.getConnection();

    try {
        const body = await req.json();

        const token = String(body.token ?? '').trim();
        const password = String(body.password ?? '');
        const confirmPassword = String(body.confirmPassword ?? '');

        if (!token) {
            return NextResponse.json(
                { error: 'Token inválido' },
                { status: 400 }
            );
        }

        if (!password || !confirmPassword) {
            return NextResponse.json(
                { error: 'La nueva contraseña y su confirmación son obligatorias' },
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

        await conn.beginTransaction();

        const tokenHash = hashToken(token);

        const [rows] = await conn.execute<RowDataPacket[]>(
            `SELECT
                    r.id,
                    r.usuario_id,
                    r.expires_at,
                    r.used_at,
                    u.username,
                    u.activo
            FROM usuarios_clientes_password_resets r
            INNER JOIN usuarios_clientes u ON u.id = r.usuario_id
            WHERE r.token_hash = ?
            LIMIT 1
            FOR UPDATE`,
            [tokenHash]
        );

        if (!rows.length) {
            await conn.rollback();

            return NextResponse.json(
                { error: 'El enlace de recuperación no es válido' },
                { status: 400 }
            );
        }

        const row = rows[0];
        const expired = new Date(row.expires_at) < new Date();

        if (row.used_at) {
            await conn.rollback();

            return NextResponse.json(
                { error: 'Este enlace ya fue utilizado' },
                { status: 400 }
            );
        }

        if (expired) {
            await conn.rollback();

            return NextResponse.json(
                { error: 'El enlace de recuperación expiró' },
                { status: 400 }
            );
        }

        if (Number(row.activo) !== 1) {
            await conn.rollback();

            return NextResponse.json(
                { error: 'La cuenta no está activa' },
                { status: 400 }
            );
        }

        const passwordHash = await bcrypt.hash(password, 12);

        await conn.execute<ResultSetHeader>(
            `UPDATE usuarios_clientes
            SET password = ?,
                intentos_login = 0,
                bloqueado_hasta = NULL
            WHERE id = ?`,
            [passwordHash, row.usuario_id]
        );

        await conn.execute<ResultSetHeader>(
            `UPDATE usuarios_clientes_password_resets
                SET used_at = NOW()
                WHERE id = ?`,
            [row.id]
        );

        await conn.execute<ResultSetHeader>(
            `UPDATE usuarios_clientes_password_resets
                SET used_at = NOW()
                WHERE usuario_id = ? AND used_at IS NULL`,
            [row.usuario_id]
        );

        await conn.commit();

        await logAction(
            row.usuario_id,
            'reset_password',
            'auth',
            `Contraseña restablecida | IP: ${ip}`,
            ip,
            'warning'
        );

        return NextResponse.json({
            ok: true,
            message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
        });
    } catch (error) {
        await conn.rollback();

        console.error('[POST /api/auth/reset-password]', error);

        return NextResponse.json(
            { error: 'Error interno del servidor' },
            { status: 500 }
        );
    } finally {
        conn.release();
    }
}