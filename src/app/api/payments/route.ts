import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { randomBytes } from 'crypto';

// GET /api/payments — Historial de pagos del usuario
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page  = Math.max(1, parseInt(searchParams.get('page') ?? '1'));
  const limit = 10;
  const offset = (page - 1) * limit;

  // Admin ve todos, cliente solo los suyos
  const isAdmin = session.user.rol === 'admin';
  const where   = isAdmin ? '' : 'WHERE cl.usuario_id = ?';
  const params: (string | number)[] = isAdmin ? [limit, offset] : [session.user.id, limit, offset];

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.*, c.titulo, c.categoria, c.imagen,
            cl.nombre, cl.apellidos, cl.email
     FROM pagos_clientes p
     INNER JOIN catalogo_clientes c  ON c.id = p.catalogo_id
     INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
     ${where}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    params
  );

  const [[{ total }]] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) as total FROM pagos_clientes p
     INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id ${where}`,
    isAdmin ? [] : [session.user.id]
  );

  return NextResponse.json({
    pagos: rows,
    pagination: { page, limit, total: Number(total), pages: Math.ceil(Number(total) / limit) },
  });
}

// POST /api/payments — Crear pago
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session.user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const body = await req.json();
  const { catalogo_id, metodo_pago } = body;

  if (!catalogo_id || !metodo_pago) {
    return NextResponse.json({ error: 'catalogo_id y metodo_pago requeridos' }, { status: 400 });
  }

  // Obtener o crear perfil de cliente
  let [clienteRows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM clientes_clientes WHERE usuario_id = ?`,
    [session.user.id]
  );

  let clienteId: number;
  if (!clienteRows.length) {
    const [ins] = await pool.execute<ResultSetHeader>(
      `INSERT INTO clientes_clientes (usuario_id, nombre, email)
       SELECT id, username, email FROM usuarios_clientes WHERE id = ?`,
      [session.user.id]
    );
    clienteId = ins.insertId;
  } else {
    clienteId = clienteRows[0].id;
  }

  // Verificar que el ítem existe y no fue pagado ya
  const [catRows] = await pool.execute<RowDataPacket[]>(
    `SELECT precio FROM catalogo_clientes WHERE id = ? AND activo = 1`,
    [catalogo_id]
  );
  if (!catRows.length) return NextResponse.json({ error: 'Ítem no encontrado' }, { status: 404 });

  const [yaP] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM pagos_clientes WHERE cliente_id = ? AND catalogo_id = ? AND estatus = 'pagado'`,
    [clienteId, catalogo_id]
  );
  if (yaP.length) return NextResponse.json({ error: 'Ya pagaste este contenido' }, { status: 409 });

  const referencia = `CNT-${Date.now()}-${randomBytes(4).toString('hex').toUpperCase()}`;
  const monto      = catRows[0].precio;

  const [result] = await pool.execute<ResultSetHeader>(
    `INSERT INTO pagos_clientes (cliente_id, catalogo_id, referencia, monto, metodo_pago, estatus)
     VALUES (?, ?, ?, ?, ?, 'pendiente')`,
    [clienteId, catalogo_id, referencia, monto, metodo_pago]
  );

  await logAction(session.user.id, 'crear_pago', 'pagos', `Ref: ${referencia} | Monto: ${monto}`);

  return NextResponse.json({ ok: true, pago_id: result.insertId, referencia, monto }, { status: 201 });
}
