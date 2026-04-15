// src/app/api/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { randomBytes } from 'crypto';

// GET /api/payments — Historial de pagos del usuario
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const rawPage = req.nextUrl.searchParams.get('page');
    const parsedPage = Number.parseInt(rawPage ?? '1', 10);
    const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

    const limit = 10;
    const offset = (page - 1) * limit;

    const isAdmin = session.user.rol === 'admin';
    const userId = Number(session.user.id);

    if (!isAdmin && !Number.isInteger(userId)) {
      return NextResponse.json(
        { error: 'Sesión inválida: user.id no es un entero válido' },
        { status: 500 }
      );
    }

    const where = isAdmin ? '' : 'WHERE cl.usuario_id = ?';

    const rowsSql = `
      SELECT
        p.*,
        c.titulo,
        c.categoria,
        c.imagen,
        cl.nombre,
        cl.apellidos,
        cl.email
      FROM pagos_clientes p
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const rowsParams: (string | number)[] = isAdmin ? [] : [userId];

    const [rows] = await pool.execute<RowDataPacket[]>(rowsSql, rowsParams);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM pagos_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      ${where}
    `;

    const countParams: (string | number)[] = isAdmin ? [] : [userId];

    const [countRows] = await pool.execute<RowDataPacket[]>(countSql, countParams);

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

    const body = await req.json();
    const { catalogo_id, metodo_pago } = body;

    if (!catalogo_id || !metodo_pago) {
      return NextResponse.json(
        { error: 'catalogo_id y metodo_pago requeridos' },
        { status: 400 }
      );
    }

    let [clienteRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM clientes_clientes WHERE usuario_id = ?`,
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
    } else {
      clienteId = clienteRows[0].id;
    }

    const [catRows] = await pool.execute<RowDataPacket[]>(
      `SELECT precio
        FROM catalogo_clientes
        WHERE id = ? AND activo = 1`,
      [catalogo_id]
    );

    if (!catRows.length) {
      return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });
    }

    const [yaP] = await pool.execute<RowDataPacket[]>(
      `SELECT id
        FROM pagos_clientes
        WHERE cliente_id = ? AND catalogo_id = ? AND estatus = 'pagado'`,
      [clienteId, catalogo_id]
    );

    if (yaP.length) {
      return NextResponse.json({ error: 'Ya pagaste este contenido' }, { status: 409 });
    }

    const referencia = `CNT-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
    const monto = catRows[0].precio;

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO pagos_clientes
          (cliente_id, catalogo_id, referencia, monto, metodo_pago, estatus)
        VALUES (?, ?, ?, ?, ?, 'pendiente')`,
      [clienteId, catalogo_id, referencia, monto, metodo_pago]
    );

    await logAction(session.user.id, 'crear_pago', 'pagos', `Ref: ${referencia} | Monto: ${monto}`);

    return NextResponse.json(
      { ok: true, pago_id: result.insertId, referencia, monto },
      { status: 201 }
    );
  } catch (error) {
    console.error('[POST /api/payments]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}