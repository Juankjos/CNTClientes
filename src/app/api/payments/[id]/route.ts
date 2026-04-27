// src/app/api/payments/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket } from 'mysql2';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/payments/[id]
export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const pagoId = Number(id);

    if (!Number.isInteger(pagoId) || pagoId <= 0) {
      return NextResponse.json({ error: 'ID de pago inválido' }, { status: 400 });
    }

    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'cliente') {
      return NextResponse.json(
        { error: 'Detalle de pago reservado para clientes' },
        { status: 403 }
      );
    }

    const userId = Number(session.user.id);

    if (!Number.isInteger(userId)) {
      return NextResponse.json(
        { error: 'Sesión inválida: user.id no es un entero válido' },
        { status: 500 }
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          p.*,
          c.titulo,
          c.descripcion,
          c.categoria,
          c.imagen,
          c.archivo,
          cl.nombre,
          cl.apellidos,
          cl.email
        FROM pagos_clientes p
        INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
        INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
        WHERE p.id = ?
          AND cl.usuario_id = ?
        LIMIT 1`,
      [pagoId, userId]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
    }

    return NextResponse.json(rows[0]);
  } catch (error) {
    console.error('[GET /api/payments/[id]] error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al obtener pago',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

// PATCH /api/payments/[id]
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const session = await getSession();
  if (!session.user || session.user.rol !== 'admin') {
    return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
  }

  const { estatus, respuesta } = await req.json();
  const valid = ['pendiente', 'pagado', 'cancelado', 'reembolsado'];

  if (!valid.includes(estatus)) {
    return NextResponse.json({ error: 'Estatus inválido' }, { status: 400 });
  }

  await pool.execute(
    `UPDATE pagos_clientes SET estatus = ?, respuesta = ? WHERE id = ?`,
    [estatus, respuesta ?? null, id]
  );

  await logAction(session.user.id, 'actualizar_pago', 'pagos', `ID: ${id} → ${estatus}`);
  return NextResponse.json({ ok: true });
}