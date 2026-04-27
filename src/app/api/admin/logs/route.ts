// src/app/api/admin/logs/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit  = 20;
  const nivel  = searchParams.get('nivel') ?? '';
  const offset = (page - 1) * limit;

  const where  = nivel ? 'WHERE l.nivel = ?' : '';
  const params = nivel ? [nivel, limit, offset] : [limit, offset];

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT l.*, u.username
     FROM logs_clientes l
     LEFT JOIN usuarios_clientes u ON u.id = l.usuario_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  const [[{ total }]] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM logs_clientes ${where}`,
    nivel ? [nivel] : []
  );

  return NextResponse.json({
    logs: rows,
    pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  });
}
