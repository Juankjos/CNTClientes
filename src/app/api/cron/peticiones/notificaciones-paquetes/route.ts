//src/app/api/cron/peticiones/notificaciones-paquetes/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { createNotification, type NotificationType } from '@/lib/notificaciones';
import type { RowDataPacket } from 'mysql2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CRON_SECRET = process.env.CRON_SECRET;

if (!CRON_SECRET) {
  throw new Error('CRON_SECRET no está definido');
}

const FESTIVOS_MX_FIJOS = new Set([
  '01-01',
  '02-02',
  '03-16',
  '05-01',
  '09-16',
  '11-20',
  '12-25',
]);

type CatalogoSnapshot = {
  bloquea_sabado?: unknown;
  bloquea_domingo?: unknown;
  bloquea_dias_festivos?: unknown;
  bloquea_fechas_personalizadas?: unknown;
  fechas_bloqueadas_json?: unknown;
};

type PeticionRecordatorioRow = RowDataPacket & {
  id: number;
  cliente_usuario_id: number;
  catalogo_titulo: string | null;
  motivo: string | null;
  fecha_deseada: string;
  fecha_fin: string;
  rango_dias: number | null;
  catalogo_snapshot: unknown;
};

type SkipConfig = {
  bloqueaSabado: boolean;
  bloqueaDomingo: boolean;
  bloqueaDiasFestivos: boolean;
  fechasBloqueadas: Set<string>;
};

function getMexicoTodayDateOnly() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

function normalizeDateParam(value: unknown) {
  const text = String(value ?? '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  return getMexicoTodayDateOnly();
}

function dateOnlyToUtcMs(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  return Date.UTC(year, month - 1, day);
}

function dateOnlyToDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, month - 1, day);
}

function dateToDateOnly(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

function addDays(dateOnly: string, days: number) {
  const date = dateOnlyToDate(dateOnly);
  date.setDate(date.getDate() + days);

  return dateToDateOnly(date);
}

function diffDays(startDateOnly: string, endDateOnly: string) {
  const start = dateOnlyToUtcMs(startDateOnly);
  const end = dateOnlyToUtcMs(endDateOnly);

  return Math.floor((end - start) / 86_400_000);
}

function getMonthDay(dateOnly: string) {
  return dateOnly.slice(5, 10);
}

function formatDateMx(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'America/Mexico_City',
  }).format(date);
}

function pluralDias(value: number) {
  return value === 1 ? 'día' : 'días';
}

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const text = String(value).trim().toLowerCase();

  return text === '1' || text === 'true' || text === 'sí' || text === 'si';
}

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

function parseJsonDates(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item).trim())
      .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parseJsonDates(parsed);
    } catch {
      return [];
    }
  }

  return [];
}

function getSkipConfig(snapshotValue: unknown): SkipConfig {
  const snapshot = parseJsonObject(snapshotValue) as CatalogoSnapshot | null;

  const bloqueaFechasPersonalizadas = toBool(
    snapshot?.bloquea_fechas_personalizadas
  );

  const fechasBloqueadas = bloqueaFechasPersonalizadas
    ? new Set(parseJsonDates(snapshot?.fechas_bloqueadas_json))
    : new Set<string>();

  return {
    bloqueaSabado: toBool(snapshot?.bloquea_sabado),
    bloqueaDomingo: toBool(snapshot?.bloquea_domingo),
    bloqueaDiasFestivos: toBool(snapshot?.bloquea_dias_festivos),
    fechasBloqueadas,
  };
}

function getSkipReasons(dateOnly: string, config: SkipConfig) {
  const date = dateOnlyToDate(dateOnly);
  const day = date.getDay();

  const reasons: string[] = [];

  if (config.bloqueaSabado && day === 6) {
    reasons.push('sábado');
  }

  if (config.bloqueaDomingo && day === 0) {
    reasons.push('domingo');
  }

  if (config.bloqueaDiasFestivos && FESTIVOS_MX_FIJOS.has(getMonthDay(dateOnly))) {
    reasons.push('día festivo');
  }

  if (config.fechasBloqueadas.has(dateOnly)) {
    reasons.push('fecha bloqueada');
  }

  return reasons;
}

function shouldSkipDate(dateOnly: string, config: SkipConfig) {
  return getSkipReasons(dateOnly, config).length > 0;
}

function countValidDaysUntil(input: {
  fechaInicio: string;
  targetDate: string;
  config: SkipConfig;
}) {
  const { fechaInicio, targetDate, config } = input;

  let current = fechaInicio;
  let count = 0;
  let guard = 0;

  while (current <= targetDate) {
    if (!shouldSkipDate(current, config)) {
      count += 1;
    }

    current = addDays(current, 1);
    guard += 1;

    if (guard > 1000) {
      throw new Error('No se pudo contar los días válidos del paquete.');
    }
  }

  return count;
}

function countValidDaysBetween(input: {
  fechaInicio: string;
  fechaFin: string;
  config: SkipConfig;
}) {
  return countValidDaysUntil({
    fechaInicio: input.fechaInicio,
    targetDate: input.fechaFin,
    config: input.config,
  });
}

function buildNotification(input: {
  today: string;
  peticionId: number;
  catalogoTitulo: string;
  fechaInicio: string;
  fechaFin: string;
  rangoDias: number | null;
  config: SkipConfig;
}) {
  const {
    today,
    peticionId,
    catalogoTitulo,
    fechaInicio,
    fechaFin,
    rangoDias,
    config,
  } = input;

  const fechaInicioTexto = formatDateMx(fechaInicio);
  const fechaFinTexto = formatDateMx(fechaFin);

  const skipReasons = getSkipReasons(today, config);
  const totalDiasCalculado = countValidDaysBetween({
    fechaInicio,
    fechaFin,
    config,
  });

  const totalDias =
    Number.isInteger(rangoDias) && Number(rangoDias) > 0
      ? Number(rangoDias)
      : totalDiasCalculado;

  let tipo: NotificationType;
  let titulo: string;
  let mensaje: string;

  if (skipReasons.length > 0) {
    tipo = 'paquete_omitido';
    titulo = 'Día omitido de tu paquete';
    mensaje = `Hoy se omite el día de tu paquete "${catalogoTitulo}" porque no entra dentro de los días contratados. Proseguiremos posteriormente con regularidad.`;

    return {
      tipo,
      titulo,
      mensaje,
      dedupeKey: `paquete:${tipo}:${peticionId}:${today}`,
      debug: {
        skipReasons,
        totalDias,
        diaActual: null,
        diasRestantes: null,
      },
    };
  }

  const diaActual = countValidDaysUntil({
    fechaInicio,
    targetDate: today,
    config,
  });

  const diasRestantes = Math.max(0, totalDias - diaActual);

  if (fechaInicio === fechaFin && today === fechaInicio) {
    tipo = 'paquete_fin';
    titulo = 'Tu paquete inicia y culmina hoy';
    mensaje = `¡Hoy inicia y culmina tu paquete "${catalogoTitulo}"! El cual se tomó del día ${fechaInicioTexto} a ${fechaFinTexto} con un total de ${totalDias} ${pluralDias(totalDias)}.`;
  } else if (today === fechaInicio) {
    tipo = 'paquete_inicio';
    titulo = 'Tu paquete empieza hoy';
    mensaje = `¡Hoy empieza el primer día de tu paquete "${catalogoTitulo}"! Te recordamos que culmina el día ${fechaFinTexto}.`;
  } else if (today === fechaFin) {
    tipo = 'paquete_fin';
    titulo = 'Tu paquete culmina hoy';
    mensaje = `¡Hoy culmina tu paquete "${catalogoTitulo}"! El cual se tomó del día ${fechaInicioTexto} a ${fechaFinTexto} con un total de ${totalDias} ${pluralDias(totalDias)}.`;
  } else {
    tipo = 'paquete_dia';
    titulo = `Día #${diaActual} de tu paquete`;
    mensaje = `¡Hoy es el día #${diaActual} de tu paquete "${catalogoTitulo}"! Te recordamos que restan ${diasRestantes} ${pluralDias(diasRestantes)} y culminará el día ${fechaFinTexto}.`;
  }

  return {
    tipo,
    titulo,
    mensaje,
    dedupeKey: `paquete:${tipo}:${peticionId}:${today}`,
    debug: {
      skipReasons,
      totalDias,
      diaActual,
      diasRestantes,
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization');

    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const today = normalizeDateParam(req.nextUrl.searchParams.get('date'));

    const [rows] = await pool.execute<PeticionRecordatorioRow[]>(
      `
      SELECT
        p.id,
        cl.usuario_id AS cliente_usuario_id,
        p.catalogo_titulo,
        p.motivo,
        DATE_FORMAT(p.fecha_deseada, '%Y-%m-%d') AS fecha_deseada,
        DATE_FORMAT(COALESCE(p.fecha_fin, p.fecha_deseada), '%Y-%m-%d') AS fecha_fin,
        p.rango_dias,
        p.catalogo_snapshot
      FROM peticiones_clientes p
      INNER JOIN clientes_clientes cl
        ON cl.id = p.cliente_id
      WHERE p.estatus = 'aceptada'
        AND ? BETWEEN p.fecha_deseada AND COALESCE(p.fecha_fin, p.fecha_deseada)
      ORDER BY p.fecha_deseada ASC, p.id ASC
      LIMIT 500
      `,
      [today]
    );

    let creadas = 0;
    let duplicadas = 0;
    let errores = 0;

    const detalles: Array<{
      peticion_id: number;
      usuario_id: number;
      tipo?: string;
      ok: boolean;
      duplicated?: boolean;
      error?: string;
      debug?: unknown;
    }> = [];

    for (const row of rows) {
      try {
        const peticionId = Number(row.id);
        const usuarioId = Number(row.cliente_usuario_id);

        if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
          throw new Error('La petición no tiene usuario de cliente válido.');
        }

        const catalogoTitulo = String(
          row.catalogo_titulo || row.motivo || `Petición ${peticionId}`
        );

        const fechaInicio = row.fecha_deseada;
        const fechaFin = row.fecha_fin;
        const rangoDias =
          row.rango_dias === null || row.rango_dias === undefined
            ? null
            : Number(row.rango_dias);

        const config = getSkipConfig(row.catalogo_snapshot);

        const notification = buildNotification({
          today,
          peticionId,
          catalogoTitulo,
          fechaInicio,
          fechaFin,
          rangoDias,
          config,
        });

        const result = await createNotification({
          usuarioId,
          actorUsuarioId: null,
          peticionId,
          tipo: notification.tipo,
          titulo: notification.titulo,
          mensaje: notification.mensaje,
          url: `/formularios/${peticionId}`,
          dedupeKey: notification.dedupeKey,
        });

        if (result.duplicated) {
          duplicadas += 1;
        } else {
          creadas += 1;
        }

        detalles.push({
          peticion_id: peticionId,
          usuario_id: usuarioId,
          tipo: notification.tipo,
          ok: true,
          duplicated: result.duplicated,
          debug: notification.debug,
        });
      } catch (error) {
        errores += 1;

        detalles.push({
          peticion_id: Number(row.id),
          usuario_id: Number(row.cliente_usuario_id),
          ok: false,
          error: error instanceof Error ? error.message : 'Error desconocido',
        });
      }
    }

    return NextResponse.json({
      ok: true,
      fecha: today,
      candidatas: rows.length,
      creadas,
      duplicadas,
      errores,
      detalles,
    });
  } catch (error) {
    console.error('[GET /api/cron/peticiones/notificaciones-paquetes]', error);

    return NextResponse.json(
      { error: 'Error interno generando notificaciones de paquetes' },
      { status: 500 }
    );
  }
}