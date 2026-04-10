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
  const { id } = await params;

  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.*, c.titulo, c.descripcion, c.categoria, c.imagen, c.archivo,
            cl.nombre, cl.apellidos, cl.email
     FROM pagos_clientes p
     INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
     INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
     WHERE p.id = ? ${session.user.rol !== 'admin' ? 'AND cl.usuario_id = ?' : ''}`,
    session.user.rol !== 'admin' ? [id, session.user.id] : [id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
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