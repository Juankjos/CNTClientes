// src/app/api/peticiones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';
import type { RowDataPacket } from 'mysql2';

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

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  let parsed = value;

  if (Buffer.isBuffer(parsed)) {
    parsed = parsed.toString('utf8');
  }

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as Record<string, unknown>;
}

function toBooleanDb(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function getSnapshotBoolean(
  snapshot: Record<string, unknown> | null,
  key: string
) {
  return toBooleanDb(snapshot?.[key]);
}

function getSnapshotFechasBloqueadas(snapshot: Record<string, unknown> | null) {
  const value =
    snapshot?.fechas_bloqueadas_json ??
    snapshot?.fechas_bloqueadas ??
    [];

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

  return Array.from(
    new Set(
      parsed
        .map((item) => String(item).trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item))
    )
  ).sort();
}

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    const user = session.user;

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;
    const peticionId = Number(id);

    if (!Number.isInteger(peticionId) || peticionId <= 0) {
      return NextResponse.json(
        { error: 'peticion_id inválido' },
        { status: 400 }
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
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

        COALESCE(pc.catalogo_titulo, p.catalogo_titulo, c.titulo) AS servicio,
        COALESCE(pc.categoria, p.catalogo_categoria, c.categoria) AS catalogo_categoria,

        pc.usa_rango_fechas,
        pc.rango_dias AS catalogo_rango_dias,
        pc.usa_hora_cita AS catalogo_usa_hora_cita,
        pc.catalogo_precio,
        pc.catalogo_snapshot,

        cc.domicilio_1,
        cc.domicilio_2,
        cc.domicilio_3
      FROM peticiones_clientes pc
      INNER JOIN clientes_clientes cc
        ON cc.id = pc.cliente_id
      LEFT JOIN pagos_clientes p
        ON p.id = pc.pago_id
      LEFT JOIN catalogo_clientes c
        ON c.id = pc.catalogo_id
      WHERE pc.id = ?
        AND cc.usuario_id = ?
      LIMIT 1
      `,
      [peticionId, user.id]
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Formulario no encontrado' },
        { status: 404 }
      );
    }

    const row = rows[0];
    const archivos = parseArchivosSubidos(row.archivos_subidos);
    const catalogoSnapshot = parseJsonObject(row.catalogo_snapshot);

    const bloqueaSabado = getSnapshotBoolean(catalogoSnapshot, 'bloquea_sabado');
    const bloqueaDomingo = getSnapshotBoolean(catalogoSnapshot, 'bloquea_domingo');
    const bloqueaDiasFestivos = getSnapshotBoolean(catalogoSnapshot, 'bloquea_dias_festivos');
    const bloqueaFechasPersonalizadas = getSnapshotBoolean(
      catalogoSnapshot,
      'bloquea_fechas_personalizadas'
    );

    const fechasBloqueadas = getSnapshotFechasBloqueadas(catalogoSnapshot);

    return NextResponse.json({
      ...row,
      archivos_subidos: archivos,
      archivos_count: archivos.length,

      bloquea_sabado: bloqueaSabado,
      bloquea_domingo: bloqueaDomingo,
      bloquea_dias_festivos: bloqueaDiasFestivos,
      bloquea_fechas_personalizadas: bloqueaFechasPersonalizadas,
      fechas_bloqueadas_json: fechasBloqueadas,
    });
  } catch (error) {
    console.error('[GET /api/peticiones/[id]]', error);

    return NextResponse.json(
      { error: 'Error interno al cargar formulario' },
      { status: 500 }
    );
  }
}