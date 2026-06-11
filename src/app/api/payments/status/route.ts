// src/app/api/payments/status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

function parseJsonObject(value: unknown): Record<string, any> | null {
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

  return parsed as Record<string, any>;
}

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
      p.catalogo_titulo,
      p.catalogo_categoria,
      p.catalogo_snapshot,

      c.titulo AS live_servicio,
      c.categoria AS live_categoria,
      c.usa_rango_fechas AS live_usa_rango_fechas,
      c.rango_dias AS live_rango_dias,
      c.usa_hora_cita AS live_usa_hora_cita,
      c.incluye_fines_semana AS live_incluye_fines_semana,
      c.incluye_dias_festivos AS live_incluye_dias_festivos,
      c.bloquea_sabado AS live_bloquea_sabado,
      c.bloquea_domingo AS live_bloquea_domingo,
      c.bloquea_dias_festivos AS live_bloquea_dias_festivos,
      c.bloquea_fechas_personalizadas AS live_bloquea_fechas_personalizadas,
      c.fechas_bloqueadas_json AS live_fechas_bloqueadas_json,

      pc.id AS peticion_id
    FROM pagos_clientes p
    INNER JOIN clientes_clientes cc
      ON cc.id = p.cliente_id
    LEFT JOIN catalogo_clientes c
      ON c.id = p.catalogo_id
    LEFT JOIN peticiones_clientes pc
      ON pc.pago_id = p.id
    WHERE p.id = ?
      AND cc.usuario_id = ?
    LIMIT 1
    `,
    [pagoId, user.id]
  );

  function parseJsonDates(value: unknown): string[] {
    let parsed = value;

    if (Buffer.isBuffer(value)) {
      parsed = value.toString('utf8');
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

  function toBool(value: unknown, fallback = false) {
    if (value === undefined || value === null) return fallback;

    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;

    const text = String(value).trim().toLowerCase();

    return text === '1' || text === 'true' || text === 'sí' || text === 'si';
  }

  if (!rows.length) {
    return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 });
  }

  const row = rows[0];
  const snapshot = parseJsonObject(row.catalogo_snapshot);
  const fromSnapshot = (key: string, fallback: unknown = null) => {
    if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)) {
      return snapshot[key];
    }

    return fallback;
  };
  const fechasBloqueadas = parseJsonDates(
    fromSnapshot('fechas_bloqueadas_json', row.live_fechas_bloqueadas_json)
  );
  

  return NextResponse.json({
    id: row.id,
    catalogo_id: row.catalogo_id,
    estatus: row.estatus,

    servicio:
      row.catalogo_titulo ??
      fromSnapshot('titulo', row.live_servicio),

    categoria:
      row.catalogo_categoria ??
      fromSnapshot('categoria', row.live_categoria),

    usa_rango_fechas: toBool(
      fromSnapshot('usa_rango_fechas', row.live_usa_rango_fechas)
    ),

    rango_dias:
      fromSnapshot('rango_dias', row.live_rango_dias) === null
        ? null
        : Number(fromSnapshot('rango_dias', row.live_rango_dias)),

    usa_hora_cita: toBool(
      fromSnapshot('usa_hora_cita', row.live_usa_hora_cita)
    ),

    incluye_fines_semana: toBool(
      fromSnapshot('incluye_fines_semana', row.live_incluye_fines_semana),
      true
    ),

    incluye_dias_festivos: toBool(
      fromSnapshot('incluye_dias_festivos', row.live_incluye_dias_festivos),
      true
    ),

    bloquea_sabado: toBool(
      fromSnapshot('bloquea_sabado', row.live_bloquea_sabado)
    ),

    bloquea_domingo: toBool(
      fromSnapshot('bloquea_domingo', row.live_bloquea_domingo)
    ),

    bloquea_dias_festivos: toBool(
      fromSnapshot('bloquea_dias_festivos', row.live_bloquea_dias_festivos)
    ),

    bloquea_fechas_personalizadas: toBool(
      fromSnapshot(
        'bloquea_fechas_personalizadas',
        row.live_bloquea_fechas_personalizadas
      )
    ),

    fechas_bloqueadas: fechasBloqueadas,

    peticion_id: row.peticion_id,
    tiene_peticion: Boolean(row.peticion_id),
  });
}