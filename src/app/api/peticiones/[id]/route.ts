// src/app/api/peticiones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseArchivosSubidos(value: unknown) {
  let parsed = value;

  if (Buffer.isBuffer(parsed)) {
    parsed = parsed.toString('utf8');
  }

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  return parsed;
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getSession();
  const user = session.user;

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  if (user.rol !== 'cliente') {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const { id } = await params;
  const pagoId = Number(id);

  if (!Number.isInteger(pagoId) || pagoId <= 0) {
    return NextResponse.json({ error: 'pago_id inválido' }, { status: 400 });
  }

  const [rows]: any = await pool.query(
    `
    SELECT
      pc.id,
      pc.pago_id,
      pc.catalogo_id,
      pc.categoria,
      pc.motivo,
      pc.descripcion,

      pc.usar_domicilio,
      pc.domicilio_slot,
      pc.domicilio_texto,

      pc.fecha_deseada,
      pc.fecha_fin,
      pc.rango_dias,

      pc.usa_hora_cita,
      pc.hora_cita,

      pc.archivos_subidos,
      pc.archivos_eliminados_at,
      pc.archivos_limpieza_error,

      pc.estatus AS peticion_estatus,
      pc.comentario_admin,
      pc.created_at,
      pc.updated_at,

      p.estatus AS pago_estatus,
      p.referencia,
      p.monto,
      p.pagado_at,

      c.titulo AS servicio,
      c.categoria AS catalogo_categoria,
      c.usa_rango_fechas,
      c.rango_dias AS catalogo_rango_dias,
      c.usa_hora_cita AS catalogo_usa_hora_cita,

      cc.domicilio_1,
      cc.domicilio_2,
      cc.domicilio_3
    FROM peticiones_clientes pc
    INNER JOIN pagos_clientes p
      ON p.id = pc.pago_id
    INNER JOIN clientes_clientes cc
      ON cc.id = p.cliente_id
    INNER JOIN catalogo_clientes c
      ON c.id = pc.catalogo_id
    WHERE pc.pago_id = ?
      AND cc.usuario_id = ?
    LIMIT 1
    `,
    [pagoId, user.id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Formulario no encontrado' }, { status: 404 });
  }

  const row = rows[0];
  const archivos = parseArchivosSubidos(row.archivos_subidos);

  return NextResponse.json({
    ...row,
    archivos_subidos: archivos,
    archivos_count: archivos.length,
  });
}