// src/app/api/payments/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  const session = await getSession();
  const user = session.user;

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (user.rol !== 'cliente') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const pagoId = Number(req.nextUrl.searchParams.get('pago_id'));

  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return NextResponse.json({ error: 'pago_id inválido' }, { status: 400 });
  }

  const [rows]: any = await pool.query(
    `
    SELECT
      p.id,
      p.catalogo_id,
      p.estatus,
      c.titulo AS servicio,
      c.categoria,
      pc.id AS peticion_id
    FROM pagos_clientes p
    INNER JOIN clientes_clientes cc
      ON cc.id = p.cliente_id
    INNER JOIN catalogo_clientes c
      ON c.id = p.catalogo_id
    LEFT JOIN peticiones_clientes pc
      ON pc.pago_id = p.id
    WHERE p.id = ?
      AND cc.usuario_id = ?
    LIMIT 1
    `,
    [pagoId, user.id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  const row = rows[0];

  return NextResponse.json({
    id: row.id,
    catalogo_id: row.catalogo_id,
    estatus: row.estatus,
    servicio: row.servicio,
    categoria: row.categoria,
    peticion_id: row.peticion_id,
    tiene_peticion: Boolean(row.peticion_id),
  });
}