// src/app/api/peticiones/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

const VALID_STATUS = new Set(['pendiente', 'aceptada', 'rechazada']);

function toDateOnly(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length >= 10 ? text.slice(0, 10) : '';
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
      `SELECT categoria, usa_rango_fechas, rango_dias
        FROM catalogo_clientes
        WHERE id = ?`,
      [catalogo_id]
    );

    if (!catalogRows.length) {
      return NextResponse.json({ error: 'Catálogo no encontrado.' }, { status: 404 });
    }

    const categoria = String(catalogRows[0].categoria ?? '').toLowerCase();
    const usaRangoFechas = Boolean(catalogRows[0].usa_rango_fechas);
    const rangoDias = catalogRows[0].rango_dias === null
      ? null
      : Number(catalogRows[0].rango_dias);
    const fechaInicio = toDateOnly(fecha_deseada);

    if (!['noticia', 'reportaje', 'especial'].includes(categoria)) {
      return NextResponse.json(
        { error: 'Este contenido no requiere petición.' },
        { status: 400 }
      );
    }

    if (
      categoria === 'especial' &&
      usaRangoFechas &&
      (!Number.isInteger(rangoDias) || Number(rangoDias) <= 0)
    ) {
      return NextResponse.json(
        { error: 'El catálogo especial no tiene un rango de días válido.' },
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

    const fechaFin =
      categoria === 'especial' && usaRangoFechas && rangoDias
        ? addDaysToDateOnly(fechaInicio, rangoDias - 1)
        : null;

    const rangoDiasPeticion =
      categoria === 'especial' && usaRangoFechas && rangoDias
        ? rangoDias
        : null;

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