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

type PeticionRecordatorioRow = RowDataPacket & {
  id: number;
  cliente_usuario_id: number;
  catalogo_titulo: string | null;
  motivo: string | null;
  fecha_deseada: string;
  fecha_fin: string;
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

function diffDays(startDateOnly: string, endDateOnly: string) {
  const start = dateOnlyToUtcMs(startDateOnly);
  const end = dateOnlyToUtcMs(endDateOnly);

  return Math.floor((end - start) / 86_400_000);
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

function buildNotification(input: {
  today: string;
  peticionId: number;
  catalogoTitulo: string;
  fechaInicio: string;
  fechaFin: string;
}) {
  const { today, peticionId, catalogoTitulo, fechaInicio, fechaFin } = input;

  const fechaInicioTexto = formatDateMx(fechaInicio);
  const fechaFinTexto = formatDateMx(fechaFin);

  const totalDias = diffDays(fechaInicio, fechaFin) + 1;
  const diaActual = diffDays(fechaInicio, today) + 1;
  const diasRestantes = Math.max(0, diffDays(today, fechaFin));

  let tipo: NotificationType;
  let titulo: string;
  let mensaje: string;

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
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization');

    if (auth !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    /**
     * Permite probar manualmente:
     * /api/cron/peticiones/notificaciones-paquetes?date=2026-07-01
     */
    const today = normalizeDateParam(req.nextUrl.searchParams.get('date'));

    const [rows] = await pool.execute<PeticionRecordatorioRow[]>(
      `
      SELECT
        p.id,
        cl.usuario_id AS cliente_usuario_id,
        p.catalogo_titulo,
        p.motivo,
        DATE_FORMAT(p.fecha_deseada, '%Y-%m-%d') AS fecha_deseada,
        DATE_FORMAT(COALESCE(p.fecha_fin, p.fecha_deseada), '%Y-%m-%d') AS fecha_fin
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

        const notification = buildNotification({
          today,
          peticionId,
          catalogoTitulo,
          fechaInicio,
          fechaFin,
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