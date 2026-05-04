// src/app/api/peticiones/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const VALID_STATUS = new Set(['pendiente', 'aceptada', 'rechazada']);

const FESTIVOS_MX_FIJOS = new Set([
  '01-01',
  '02-02',
  '03-16',
  '05-01',
  '09-16',
  '11-20',
  '12-25',
]);

function toDateOnly(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length >= 10 ? text.slice(0, 10) : '';
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

function getMonthDay(dateOnly: string) {
  return dateOnly.slice(5, 10);
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

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const text = String(value).trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'sí' || text === 'si';
}

function shouldSkipDate({
  dateOnly,
  bloqueaSabado,
  bloqueaDomingo,
  bloqueaDiasFestivos,
  fechasBloqueadas,
}: {
  dateOnly: string;
  bloqueaSabado: boolean;
  bloqueaDomingo: boolean;
  bloqueaDiasFestivos: boolean;
  fechasBloqueadas: Set<string>;
}) {
  const date = dateOnlyToDate(dateOnly);
  const day = date.getDay();

  const isSaturday = day === 6;
  const isSunday = day === 0;
  const isHoliday = FESTIVOS_MX_FIJOS.has(getMonthDay(dateOnly));
  const isCustomBlocked = fechasBloqueadas.has(dateOnly);

  if (bloqueaSabado && isSaturday) return true;
  if (bloqueaDomingo && isSunday) return true;
  if (bloqueaDiasFestivos && isHoliday) return true;
  if (isCustomBlocked) return true;

  return false;
}

function calculateFechaFin({
  fechaInicio,
  rangoDias,
  bloqueaSabado,
  bloqueaDomingo,
  bloqueaDiasFestivos,
  fechasBloqueadas,
}: {
  fechaInicio: string;
  rangoDias: number;
  bloqueaSabado: boolean;
  bloqueaDomingo: boolean;
  bloqueaDiasFestivos: boolean;
  fechasBloqueadas: Set<string>;
}) {
  let current = dateOnlyToDate(fechaInicio);
  let counted = 0;
  let guard = 0;

  while (counted < rangoDias) {
    const currentText = dateToDateOnly(current);

    if (
      !shouldSkipDate({
        dateOnly: currentText,
        bloqueaSabado,
        bloqueaDomingo,
        bloqueaDiasFestivos,
        fechasBloqueadas,
      })
    ) {
      counted += 1;

      if (counted === rangoDias) {
        return currentText;
      }
    }

    current.setDate(current.getDate() + 1);
    guard += 1;

    if (guard > 730) {
      throw new Error('No se pudo calcular el rango de fechas. Revisa las fechas bloqueadas.');
    }
  }

  return fechaInicio;
}

function addDaysToDateOnly(dateText: string, days: number) {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}`;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const estatus = req.nextUrl.searchParams.get('estatus') ?? '';
    const limit = 10;
    const offset = (page - 1) * limit;

    const [clienteRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM clientes_clientes WHERE usuario_id = ?`,
      [session.user.id]
    );

    if (!clienteRows.length) {
      return NextResponse.json({
        peticiones: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    const clienteId = Number(clienteRows[0].id);
    const whereParts = ['p.cliente_id = ?'];
    const params: Array<string | number> = [clienteId];

    if (VALID_STATUS.has(estatus)) {
      whereParts.push('p.estatus = ?');
      params.push(estatus);
    }

    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        p.id,
        p.pago_id,
        p.catalogo_id,
        p.categoria,
        p.motivo,
        p.descripcion,
        p.usar_domicilio,
        p.domicilio_slot,
        p.domicilio_texto,
        p.fecha_deseada,
        p.fecha_fin,
        p.rango_dias,
        p.estatus,
        p.comentario_admin,
        p.created_at,
        p.updated_at,
        c.titulo
      FROM peticiones_clientes p
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
      `,
      params
    );

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT COUNT(*) AS total
      FROM peticiones_clientes p
      ${whereSql}
      `,
      params
    );

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      peticiones: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/peticiones]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json();

    const {
      pago_id,
      catalogo_id,
      motivo,
      descripcion,
      usar_domicilio,
      domicilio_slot,
      fecha_deseada,
    } = body;

    if (!pago_id || !catalogo_id || !motivo || !descripcion || !fecha_deseada) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios.' },
        { status: 400 }
      );
    }

    const [clienteRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, domicilio_1, domicilio_2, domicilio_3
       FROM clientes_clientes
       WHERE usuario_id = ?`,
      [session.user.id]
    );

    if (!clienteRows.length) {
      return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
    }

    const cliente = clienteRows[0];
    const clienteId = Number(cliente.id);

    const [pagoRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id, catalogo_id, estatus
        FROM pagos_clientes
        WHERE id = ? AND cliente_id = ?`,
      [pago_id, clienteId]
    );

    if (!pagoRows.length) {
      return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    }

    if (String(pagoRows[0].estatus) !== 'pagado') {
      return NextResponse.json(
        { error: 'El formulario solo está disponible cuando el pago está aprobado.' },
        { status: 403 }
      );
    }

    if (Number(pagoRows[0].catalogo_id) !== Number(catalogo_id)) {
      return NextResponse.json(
        { error: 'El pago no corresponde al contenido seleccionado.' },
        { status: 400 }
      );
    }

    const [dupRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM peticiones_clientes WHERE pago_id = ?`,
      [pago_id]
    );

    if (dupRows.length) {
      return NextResponse.json(
        {
          error: 'Ya existe una petición para este pago.',
          code: 'PETICION_YA_EXISTE',
        },
        { status: 409 }
      );
    }

    const [catalogRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          categoria,
          usa_rango_fechas,
          rango_dias,
          bloquea_sabado,
          bloquea_domingo,
          bloquea_dias_festivos,
          bloquea_fechas_personalizadas,
          fechas_bloqueadas_json
        FROM catalogo_clientes
        WHERE id = ?`,
      [catalogo_id]
    );

    if (!catalogRows.length) {
      return NextResponse.json({ error: 'Catálogo no encontrado.' }, { status: 404 });
    }

    const categoria = String(catalogRows[0].categoria ?? '').toLowerCase();
    const bloqueaSabado = toBool(catalogRows[0].bloquea_sabado);
    const bloqueaDomingo = toBool(catalogRows[0].bloquea_domingo);
    const bloqueaDiasFestivos = toBool(catalogRows[0].bloquea_dias_festivos);
    const usaRangoFechas = toBool(catalogRows[0].usa_rango_fechas);
    const bloqueaFechasPersonalizadas = toBool(catalogRows[0].bloquea_fechas_personalizadas);

    const fechasBloqueadas = new Set(
      bloqueaFechasPersonalizadas
        ? parseJsonDates(catalogRows[0].fechas_bloqueadas_json)
        : []
    );
    const rangoDias = catalogRows[0].rango_dias === null
      ? null
      : Number(catalogRows[0].rango_dias);
    const fechaInicio = toDateOnly(fecha_deseada);

    if (!['noticia', 'reportaje', 'entrevista', 'especial'].includes(categoria)) {
      return NextResponse.json(
        { error: 'Este contenido no requiere petición.' },
        { status: 400 }
      );
    }

    const tieneRangoFechas =
      usaRangoFechas &&
      Number.isInteger(rangoDias) &&
      Number(rangoDias) > 0;

    if (usaRangoFechas && !tieneRangoFechas) {
      return NextResponse.json(
        { error: 'El catálogo no tiene un rango de días válido.' },
        { status: 400 }
      );
    }

    let domicilioTexto: string | null = null;
    let domicilioSlotValue: number | null = null;

    if (usar_domicilio) {
      const slot = Number(domicilio_slot);

      if (![1, 2, 3].includes(slot)) {
        return NextResponse.json({ error: 'Domicilio inválido.' }, { status: 400 });
      }

      domicilioTexto = cliente[`domicilio_${slot}`] ?? null;

      if (!domicilioTexto) {
        return NextResponse.json(
          { error: 'El domicilio seleccionado no existe.' },
          { status: 400 }
        );
      }

      domicilioSlotValue = slot;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
      return NextResponse.json(
        { error: 'fecha_deseada debe tener formato YYYY-MM-DD.' },
        { status: 400 }
      );
    }

    let fechaFin: string | null = null;
    let rangoDiasPeticion: number | null = null;

    if (tieneRangoFechas) {
      if (
        shouldSkipDate({
          dateOnly: fechaInicio,
          bloqueaSabado,
          bloqueaDomingo,
          bloqueaDiasFestivos,
          fechasBloqueadas,
        })
      ) {
        return NextResponse.json(
          {
            error: 'La fecha inicial seleccionada no está disponible para este paquete.',
          },
          { status: 400 }
        );
      }

      fechaFin = calculateFechaFin({
        fechaInicio,
        rangoDias: Number(rangoDias),
        bloqueaSabado,
        bloqueaDomingo,
        bloqueaDiasFestivos,
        fechasBloqueadas,
      });

      rangoDiasPeticion = Number(rangoDias);
    }

    const [insert] = await pool.execute<ResultSetHeader>(
      `
      INSERT INTO peticiones_clientes
      (
        cliente_id,
        catalogo_id,
        pago_id,
        categoria,
        motivo,
        descripcion,
        usar_domicilio,
        domicilio_slot,
        domicilio_texto,
        fecha_deseada,
        fecha_fin,
        rango_dias,
        estatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
      `,
      [
        clienteId,
        catalogo_id,
        pago_id,
        categoria,
        String(motivo).trim(),
        String(descripcion).trim(),
        usar_domicilio ? 1 : 0,
        domicilioSlotValue,
        domicilioTexto,
        fechaInicio,
        fechaFin,
        rangoDiasPeticion,
      ]
    );

    await pool.execute(
      `
      INSERT INTO peticiones_clientes_historial
      (peticion_id, accion, campo, valor_anterior, valor_nuevo)
      VALUES (?, 'crear', NULL, NULL, 'Petición creada')
      `,
      [insert.insertId]
    );

    await logAction(
      Number(session.user.id),
      'crear_peticion',
      'peticiones',
      `Petición ${insert.insertId} creada`
    );

    return NextResponse.json(
      { ok: true, peticion_id: insert.insertId },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/peticiones]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}