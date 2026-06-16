// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { randomBytes } from 'crypto';
import { createBbvaRedirectCharge } from '@/lib/payments/bbva-api';

function normalizeJsonValue(value: unknown) {
  if (Buffer.isBuffer(value)) {
    const text = value.toString('utf8');

    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }

  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  return value ?? null;
}

function buildCatalogoSnapshot(catalogo: RowDataPacket) {
  return {
    catalogo_id: Number(catalogo.id),
    titulo: catalogo.titulo,
    descripcion: catalogo.descripcion,
    categoria: catalogo.categoria,
    precio: String(catalogo.precio),
    imagen: catalogo.imagen,
    archivo: catalogo.archivo,
    usa_rango_fechas: Number(catalogo.usa_rango_fechas) === 1,
    rango_dias: catalogo.rango_dias === null ? null : Number(catalogo.rango_dias),
    usa_hora_cita: Number(catalogo.usa_hora_cita) === 1,
    bloquea_sabado: Number(catalogo.bloquea_sabado) === 1,
    bloquea_domingo: Number(catalogo.bloquea_domingo) === 1,
    bloquea_dias_festivos: Number(catalogo.bloquea_dias_festivos) === 1,
    incluye_fines_semana: Number(catalogo.incluye_fines_semana) === 1,
    incluye_dias_festivos: Number(catalogo.incluye_dias_festivos) === 1,
    bloquea_fechas_personalizadas: Number(catalogo.bloquea_fechas_personalizadas) === 1,
    fechas_bloqueadas_json: normalizeJsonValue(catalogo.fechas_bloqueadas_json),
    snapshot_at: new Date().toISOString(),
  };
}

function getPublicBaseUrl(req: NextRequest) {
  const configuredUrl =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (configuredUrl?.trim()) {
    return configuredUrl.trim().replace(/\/+$/, '');
  }

  const pathname = req.nextUrl.pathname;
  const apiIndex = pathname.indexOf('/api/');

  const detectedBasePath =
    apiIndex > 0
      ? pathname.slice(0, apiIndex)
      : process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

  return `${req.nextUrl.origin}${detectedBasePath}`.replace(/\/+$/, '');
}

function cleanPhone(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function getClientIp(req: NextRequest) {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-forwarded-for'),
    req.headers.get('x-real-ip'),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    const ip = candidate.split(',')[0]?.trim();

    if (ip) return ip;
  }

  return null;
}

function parseSettingBoolean(value: unknown, fallback = true) {
  let parsed = value;

  if (Buffer.isBuffer(parsed)) {
    parsed = parsed.toString('utf8');
  }

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return fallback;
    }
  }

  if (typeof parsed === 'boolean') return parsed;
  if (typeof parsed === 'number') return parsed === 1;

  return fallback;
}

async function arePaymentsEnabled() {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT value FROM app_settings WHERE \`key\` = 'payments_enabled' LIMIT 1`
  );

  if (!rows.length) return true;

  return parseSettingBoolean(rows[0].value, true);
}

// GET /api/payments — Historial de pagos del usuario
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'cliente') {
      return NextResponse.json(
        { error: 'Historial de pagos reservado para clientes' },
        { status: 403 }
      );
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const limit = 10;
    const offset = (page - 1) * limit;

    const userId = Number(session.user.id);

    if (!Number.isInteger(userId)) {
      return NextResponse.json(
        { error: 'Sesión inválida: user.id no es un entero válido' },
        { status: 500 }
      );
    }

    const rowsSql = `
      SELECT
        p.*,
        COALESCE(p.catalogo_titulo, c.titulo) AS titulo,
        COALESCE(p.catalogo_categoria, c.categoria) AS categoria,
        COALESCE(p.catalogo_imagen, c.imagen) AS imagen,
        cl.nombre,
        cl.apellidos,
        cl.email
      FROM pagos_clientes p
      LEFT JOIN catalogo_clientes c ON c.id = p.catalogo_id
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      WHERE cl.usuario_id = ?
        AND p.estatus IN ('pagado', 'reembolsado')
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(rowsSql, [userId]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM pagos_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      WHERE cl.usuario_id = ?
        AND p.estatus IN ('pagado', 'reembolsado')
    `;

    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, [userId]);

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      pagos: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/payments] error:', error);

    return NextResponse.json(
      {
        error: 'Error interno al obtener pagos',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'cliente') {
      return NextResponse.json(
        { error: 'Solo los clientes pueden generar pagos' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { catalogo_id, metodo_pago } = body;

    if (!catalogo_id || !metodo_pago) {
      return NextResponse.json(
        { error: 'catalogo_id y metodo_pago requeridos' },
        { status: 400 }
      );
    }

    let [clienteRows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        cc.id,
        cc.nombre,
        cc.apellidos,
        cc.email,
        cc.telefono,
        u.username,
        u.email AS usuario_email
      FROM clientes_clientes cc
      INNER JOIN usuarios_clientes u ON u.id = cc.usuario_id
      WHERE cc.usuario_id = ?
      LIMIT 1
      `,
      [session.user.id]
    );

    let clienteId: number;

    if (!clienteRows.length) {
      const [ins] = await pool.execute<ResultSetHeader>(
        `INSERT INTO clientes_clientes (usuario_id, nombre, email)
        SELECT id, username, email
        FROM usuarios_clientes
        WHERE id = ?`,
        [session.user.id]
      );

      clienteId = ins.insertId;

      const [newClienteRows] = await pool.execute<RowDataPacket[]>(
        `
        SELECT
          cc.id,
          cc.nombre,
          cc.apellidos,
          cc.email,
          cc.telefono,
          u.username,
          u.email AS usuario_email
        FROM clientes_clientes cc
        INNER JOIN usuarios_clientes u ON u.id = cc.usuario_id
        WHERE cc.id = ?
        LIMIT 1
        `,
        [clienteId]
      );

      clienteRows = newClienteRows;
    } else {
      clienteId = Number(clienteRows[0].id);
    }

    const [catRows] = await pool.execute<RowDataPacket[]>(
        `SELECT
            id,
            titulo,
            descripcion,
            categoria,
            precio,
            imagen,
            archivo,
            usa_rango_fechas,
            rango_dias,
            usa_hora_cita,
            bloquea_sabado,
            bloquea_domingo,
            bloquea_dias_festivos,
            incluye_fines_semana,
            incluye_dias_festivos,
            bloquea_fechas_personalizadas,
            fechas_bloqueadas_json
        FROM catalogo_clientes
        WHERE id = ? AND activo = 1
        LIMIT 1`,
      [catalogo_id]
    );

    if (!catRows.length) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }


    const referencia = `CNT-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const catalogo = catRows[0];
    const monto = catalogo.precio;
    const catalogoSnapshot = buildCatalogoSnapshot(catalogo);

    const montoNumber = Number(monto);

    if (!Number.isFinite(montoNumber) || montoNumber < 0) {
      return NextResponse.json(
        { error: 'El monto del ítem no es válido.' },
        { status: 400 }
      );
    }

    const metodoPago = String(metodo_pago ?? '').trim().toLowerCase();
    const cliente = clienteRows[0];

    const clienteNombre =
      String(cliente?.nombre ?? '').trim() ||
      String(cliente?.username ?? '').trim() ||
      'Cliente';

    const clienteApellidos =
      String(cliente?.apellidos ?? '').trim() || '';

    const clienteEmail =
      String(cliente?.email ?? '').trim() ||
      String(cliente?.usuario_email ?? '').trim();

    if (metodoPago === 'bbva' && !clienteEmail) {
      return NextResponse.json(
        { error: 'El cliente no tiene correo electrónico para generar el pago BBVA.' },
        { status: 400 }
      );
    }

    if (montoNumber === 0) {
      const [freeResult] = await pool.execute<ResultSetHeader>(
        `
        INSERT INTO pagos_clientes
          (
            cliente_id,
            catalogo_id,
            catalogo_titulo,
            catalogo_descripcion,
            catalogo_categoria,
            catalogo_imagen,
            catalogo_archivo,
            catalogo_snapshot,
            referencia,
            monto,
            metodo_pago,
            moneda,
            proveedor,
            estatus,
            respuesta,
            pagado_at
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, 0, 'gratis', 'MXN', 'sistema', 'pagado', ?, NOW())
        `,
        [
          clienteId,
          catalogo.id,
          catalogo.titulo,
          catalogo.descripcion ?? null,
          catalogo.categoria,
          catalogo.imagen ?? null,
          catalogo.archivo ?? null,
          JSON.stringify(catalogoSnapshot),
          referencia,
          JSON.stringify({
            tipo: 'gratuito',
            motivo: 'Ítem de catálogo con precio 0',
            catalogo_id: Number(catalogo.id),
            created_at: new Date().toISOString(),
          }),
        ]
      );

      const pagoId = freeResult.insertId;

      await logAction(
        session.user.id,
        'crear_pago_gratuito',
        'pagos',
        `Pago gratuito ${pagoId} | Ref: ${referencia} | Catálogo: ${catalogo.id}`
      );

      return NextResponse.json(
        {
          ok: true,
          provider: 'sistema',
          free_payment: true,
          pago_id: pagoId,
          referencia,
          monto: 0,
          metodo_pago: 'gratis',
          estatus: 'pagado',
        },
        { status: 201 }
      );
    }

    const paymentsEnabled = await arePaymentsEnabled();

    if (!paymentsEnabled) {
      return NextResponse.json(
        {
          error: 'Lo sentimos, los pagos están deshabilitados por el momento. Contáctate con un asesor para notificar el problema.',
          code: 'PAYMENTS_DISABLED',
        },
        { status: 503 }
      );
    }

    if (metodoPago !== 'bbva') {
      return NextResponse.json(
        { error: 'Método de pago no soportado.' },
        { status: 400 }
      );
    }

    const checkoutRequestPayload = {
      catalogo_id: Number(catalogo.id),
      metodo_pago: metodoPago,
      referencia,
      monto: Number(monto),
    };

    const [checkoutResult] = await pool.execute<ResultSetHeader>(
      `
      INSERT INTO pagos_checkout_bbva
      (
        cliente_id,
        catalogo_id,
        referencia,
        monto,
        moneda,

        catalogo_titulo,
        catalogo_descripcion,
        catalogo_categoria,
        catalogo_imagen,
        catalogo_archivo,
        catalogo_snapshot,

        estatus,
        request_payload
      )
      VALUES (?, ?, ?, ?, 'MXN', ?, ?, ?, ?, ?, ?, 'creado', ?)
      `,
      [
        clienteId,
        Number(catalogo.id),
        referencia,
        Number(monto),

        catalogo.titulo,
        catalogo.descripcion ?? null,
        catalogo.categoria,
        catalogo.imagen ?? null,
        catalogo.archivo ?? null,
        JSON.stringify(catalogoSnapshot),

        JSON.stringify(checkoutRequestPayload),
      ]
    );

    const checkoutId = Number(checkoutResult.insertId);

    try {
      const baseUrl = getPublicBaseUrl(req);

      const bbvaCharge = await createBbvaRedirectCharge({
        amount: Number(monto),
        currency: 'MXN',
        description: `CNT - ${String(catalogo.titulo).slice(0, 120)}`,
        orderId: referencia,
        redirectUrl: `${baseUrl}/api/payments/bbva/return?checkout_id=${checkoutId}`,
        clientIp: getClientIp(req),
        customer: {
          name: clienteNombre,
          lastName: clienteApellidos || 'Cliente',
          email: clienteEmail,
          phone: cleanPhone(cliente?.telefono),
        },
      });

      await pool.execute(
        `
        UPDATE pagos_checkout_bbva
        SET
          provider_transaction_id = ?,
          provider_status = ?,
          payment_url = ?,
          provider_response = ?,
          estatus = 'pendiente'
        WHERE id = ?
        `,
        [
          bbvaCharge.transactionId,
          String(bbvaCharge.charge?.status ?? 'charge_pending'),
          bbvaCharge.paymentUrl,
          JSON.stringify({
            ...bbvaCharge.charge,
            payment_url: bbvaCharge.paymentUrl,
          }),
          checkoutId,
        ]
      );

      await logAction(
        session.user.id,
        'crear_checkout_bbva',
        'pagos',
        `Checkout BBVA ${checkoutId} | Ref: ${referencia} | Monto: ${monto}`
      );

      return NextResponse.json(
        {
          ok: true,
          provider: 'bbva',
          checkout_id: checkoutId,
          referencia,
          monto,
          payment_url: bbvaCharge.paymentUrl,
          transaccion_externa: bbvaCharge.transactionId,
        },
        { status: 201 }
      );
    } catch (error) {
      await pool.execute(
        `
        UPDATE pagos_checkout_bbva
        SET
          estatus = 'fallido',
          error = ?,
          provider_response = ?
        WHERE id = ?
        `,
        [
          error instanceof Error ? error.message : String(error),
          JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
          checkoutId,
        ]
      );

      console.error('[POST /api/payments] BBVA checkout error:', {
        checkoutId,
        referencia,
        monto,
        metodoPago,
        baseUrl: getPublicBaseUrl(req),
        redirectUrl: `${getPublicBaseUrl(req)}/api/payments/bbva/return?checkout_id=${checkoutId}`,
        error: error instanceof Error ? error.message : String(error),
      });

      return NextResponse.json(
        {
          error: 'No se pudo generar la ventana de pago BBVA. Intenta nuevamente o contacta a un asesor.',
          detail: error instanceof Error ? error.message : String(error),
        },
        { status: 502 }
      );
    }

  } catch (error) {
    console.error('[POST /api/payments]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}