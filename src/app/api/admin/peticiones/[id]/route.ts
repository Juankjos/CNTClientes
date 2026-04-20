// src/app/api/admin/peticiones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket } from 'mysql2';

const VALID_STATUS = new Set(['pendiente', 'aceptada', 'rechazada']);

const hasOwn = (obj: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const clean = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const formatDateValue = (value: unknown): string | null => {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const text = String(value);
  return text.length >= 10 ? text.slice(0, 10) : text;
};

const toHistoryValue = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  return String(value);
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await ctx.params;

    const [rows] = await pool.execute<RowDataPacket[]>(
        `
        SELECT
            p.*,
            c.titulo,
            c.categoria AS catalogo_categoria,
            cl.domicilio_1,
            cl.domicilio_2,
            cl.domicilio_3,
            COALESCE(
            NULLIF(TRIM(CONCAT_WS(' ', cl.nombre, cl.apellidos)), ''),
            u.username,
            cl.email,
            u.email
            ) AS cliente_nombre,
            cl.telefono AS cliente_telefono,
            u.username AS cliente_username,
            u.email AS cliente_email
        FROM peticiones_clientes p
        INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
        INNER JOIN usuarios_clientes u ON u.id = cl.usuario_id
        INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
        WHERE p.id = ?
        LIMIT 1
        `,
        [id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 });
    }

    const peticion = rows[0];

    const domiciliosDisponibles = [1, 2, 3]
      .map((slot) => ({
        slot,
        label: `Domicilio ${slot}`,
        value: peticion[`domicilio_${slot}`] ?? null,
      }))
      .filter((item) => Boolean(item.value));

    const [historial] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        h.*,
        ua.username AS admin_username
      FROM peticiones_clientes_historial h
      LEFT JOIN usuarios_clientes ua ON ua.id = h.admin_user_id
      WHERE h.peticion_id = ?
      ORDER BY h.created_at DESC, h.id DESC
      `,
      [id]
    );

    return NextResponse.json({
      peticion,
      historial,
      domiciliosDisponibles,
    });
  } catch (error) {
    console.error('[GET /api/admin/peticiones/[id]]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = (await req.json()) as Record<string, unknown>;

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        p.*,
        cl.domicilio_1,
        cl.domicilio_2,
        cl.domicilio_3
      FROM peticiones_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 });
    }

    const current = rows[0];

    const nextMotivo = hasOwn(body, 'motivo') ? clean(body.motivo) : current.motivo;
    const nextDescripcion = hasOwn(body, 'descripcion') ? clean(body.descripcion) : current.descripcion;
    const nextComentarioAdmin = hasOwn(body, 'comentario_admin')
      ? clean(body.comentario_admin)
      : current.comentario_admin;

    const nextFechaDeseada = hasOwn(body, 'fecha_deseada')
      ? formatDateValue(body.fecha_deseada)
      : formatDateValue(current.fecha_deseada);

    const nextEstatus = hasOwn(body, 'estatus')
      ? String(body.estatus)
      : String(current.estatus);

    if (!nextMotivo || !nextDescripcion || !nextFechaDeseada) {
      return NextResponse.json(
        { error: 'Motivo, descripción y fecha deseada son obligatorios.' },
        { status: 400 }
      );
    }

    if (!VALID_STATUS.has(nextEstatus)) {
      return NextResponse.json({ error: 'Estatus inválido.' }, { status: 400 });
    }

    const nextUsarDomicilio = hasOwn(body, 'usar_domicilio')
      ? Boolean(body.usar_domicilio)
      : Boolean(current.usar_domicilio);

    let nextDomicilioSlot = hasOwn(body, 'domicilio_slot')
      ? (body.domicilio_slot === null || body.domicilio_slot === '' ? null : Number(body.domicilio_slot))
      : (current.domicilio_slot === null ? null : Number(current.domicilio_slot));

    let nextDomicilioTexto: string | null = current.domicilio_texto ?? null;

    if (!nextUsarDomicilio) {
      nextDomicilioSlot = null;
      nextDomicilioTexto = null;
    } else {
      if (![1, 2, 3].includes(Number(nextDomicilioSlot))) {
        return NextResponse.json({ error: 'Domicilio inválido.' }, { status: 400 });
      }

      nextDomicilioTexto = current[`domicilio_${Number(nextDomicilioSlot)}`] ?? null;

      if (!nextDomicilioTexto) {
        return NextResponse.json(
          { error: 'El domicilio seleccionado no existe.' },
          { status: 400 }
        );
      }
    }

    const changes: Array<{ field: string; prev: unknown; next: unknown; action: string }> = [];
    const updates: string[] = [];
    const params: Array<string | number | null> = [];

    const maybePushChange = (
      field: string,
      prev: unknown,
      next: unknown,
      dbField = field,
      action = 'editar'
    ) => {
      const prevValue = toHistoryValue(prev);
      const nextValue = toHistoryValue(next);

      if (prevValue !== nextValue) {
        updates.push(`${dbField} = ?`);
        params.push(next as string | number | null);
        changes.push({ field, prev, next, action });
      }
    };

    maybePushChange('motivo', current.motivo, nextMotivo);
    maybePushChange('descripcion', current.descripcion, nextDescripcion);
    maybePushChange('comentario_admin', current.comentario_admin, nextComentarioAdmin);

    const currentFecha = formatDateValue(current.fecha_deseada);
    maybePushChange('fecha_deseada', currentFecha, nextFechaDeseada);

    maybePushChange(
      'usar_domicilio',
      Number(current.usar_domicilio),
      nextUsarDomicilio ? 1 : 0
    );

    maybePushChange('domicilio_slot', current.domicilio_slot, nextDomicilioSlot);
    maybePushChange('domicilio_texto', current.domicilio_texto, nextDomicilioTexto);

    const estatusAction =
      nextEstatus === 'aceptada'
        ? 'aceptar'
        : nextEstatus === 'rechazada'
          ? 'rechazar'
          : 'editar';

    maybePushChange('estatus', current.estatus, nextEstatus, 'estatus', estatusAction);

    if (updates.length) {
      await pool.execute(
        `
        UPDATE peticiones_clientes
        SET ${updates.join(', ')}
        WHERE id = ?
        `,
        [...params, id]
      );

      for (const change of changes) {
        await pool.execute(
          `
          INSERT INTO peticiones_clientes_historial
          (peticion_id, accion, campo, valor_anterior, valor_nuevo, admin_user_id)
          VALUES (?, ?, ?, ?, ?, ?)
          `,
          [
            id,
            change.action,
            change.field,
            toHistoryValue(change.prev),
            toHistoryValue(change.next),
            session.user.id,
          ]
        );
      }

      await logAction(
        Number(session.user.id),
        'actualizar_peticion',
        'peticiones',
        `Petición ${id} actualizada`
      );
    }

    const [updatedRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM peticiones_clientes WHERE id = ? LIMIT 1`,
      [id]
    );

    return NextResponse.json({
      ok: true,
      peticion: updatedRows[0] ?? null,
    });
  } catch (error) {
    console.error('[PATCH /api/admin/peticiones/[id]]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}