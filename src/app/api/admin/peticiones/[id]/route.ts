// src/app/api/admin/peticiones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket } from 'mysql2';
import { createNotification } from '@/lib/notificaciones';

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

const hasOwn = (obj: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const clean = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

const toBoolDb = (value: unknown) => {
  return value === true || value === 1 || value === '1';
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

type DomicilioKey = 'domicilio_1' | 'domicilio_2' | 'domicilio_3';

type AdminPeticionRow = RowDataPacket & {
  domicilio_1?: string | null;
  domicilio_2?: string | null;
  domicilio_3?: string | null;
  archivos_subidos?: unknown;

  fecha_deseada?: unknown;
  fecha_fin?: unknown;
  rango_dias?: number | string | null;

  catalogo_usa_rango_fechas?: unknown;
  catalogo_rango_dias?: number | string | null;
  catalogo_bloquea_sabado?: unknown;
  catalogo_bloquea_domingo?: unknown;
  catalogo_bloquea_dias_festivos?: unknown;
  catalogo_bloquea_fechas_personalizadas?: unknown;
  catalogo_fechas_bloqueadas_json?: unknown;
  enviada_reporteros_at?: unknown;
  noticia_id?: number | null;
};

function getDomicilioValue(row: AdminPeticionRow, slot: number): string | null {
  if (![1, 2, 3].includes(slot)) return null;

  const key = `domicilio_${slot}` as DomicilioKey;
  const value = row[key];

  return value ? String(value) : null;
}

function toDateOnlyText(value: unknown): string | null {
  if (!value) return null;

  if (value instanceof Date) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');

    return `${yyyy}-${mm}-${dd}`;
  }

  const text = String(value).trim();

  if (!text) return null;

  return text.length >= 10 ? text.slice(0, 10) : null;
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

function getMotivosOmitidos(row: AdminPeticionRow, dateOnly: string) {
  const motivos: string[] = [];
  const date = dateOnlyToDate(dateOnly);
  const day = date.getDay();

  const bloqueaSabado = toBoolDb(row.catalogo_bloquea_sabado);
  const bloqueaDomingo = toBoolDb(row.catalogo_bloquea_domingo);
  const bloqueaDiasFestivos = toBoolDb(row.catalogo_bloquea_dias_festivos);
  const bloqueaFechasPersonalizadas = toBoolDb(row.catalogo_bloquea_fechas_personalizadas);

  const fechasBloqueadas = new Set(
    bloqueaFechasPersonalizadas
      ? parseJsonDates(row.catalogo_fechas_bloqueadas_json)
      : []
  );

  if (bloqueaSabado && day === 6) {
    motivos.push('Sábado omitido');
  }

  if (bloqueaDomingo && day === 0) {
    motivos.push('Domingo omitido');
  }

  if (bloqueaDiasFestivos && FESTIVOS_MX_FIJOS.has(getMonthDay(dateOnly))) {
    motivos.push('Día festivo');
  }

  if (bloqueaFechasPersonalizadas && fechasBloqueadas.has(dateOnly)) {
    motivos.push('Fecha omitida por el administrador');
  }

  return motivos;
}

function calcularFechasOmitidas(row: AdminPeticionRow) {
  const fechaInicio = toDateOnlyText(row.fecha_deseada);
  const fechaFin = toDateOnlyText(row.fecha_fin);

  if (!fechaInicio || !fechaFin) return [];

  const rangoDias = Number(row.rango_dias ?? row.catalogo_rango_dias ?? 0);

  if (!Number.isInteger(rangoDias) || rangoDias <= 1) {
    return [];
  }

  const current = dateOnlyToDate(fechaInicio);
  const end = dateOnlyToDate(fechaFin);

  const omitidas: Array<{
    fecha: string;
    motivos: string[];
  }> = [];

  let guard = 0;

  while (current.getTime() <= end.getTime()) {
    const dateOnly = dateToDateOnly(current);
    const motivos = getMotivosOmitidos(row, dateOnly);

    if (motivos.length > 0) {
      omitidas.push({
        fecha: dateOnly,
        motivos,
      });
    }

    current.setDate(current.getDate() + 1);
    guard += 1;

    if (guard > 730) break;
  }

  return omitidas;
}

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

    const [rows] = await pool.execute<AdminPeticionRow[]>(
        `
        SELECT
            p.*,
            c.titulo,
            c.categoria AS catalogo_categoria,
            c.usa_rango_fechas AS catalogo_usa_rango_fechas,
            c.rango_dias AS catalogo_rango_dias,
            c.bloquea_sabado AS catalogo_bloquea_sabado,
            c.bloquea_domingo AS catalogo_bloquea_domingo,
            c.bloquea_dias_festivos AS catalogo_bloquea_dias_festivos,
            c.bloquea_fechas_personalizadas AS catalogo_bloquea_fechas_personalizadas,
            c.fechas_bloqueadas_json AS catalogo_fechas_bloqueadas_json,
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

    const rawPeticion = rows[0];

    const peticion = {
      ...rawPeticion,
      archivos_subidos: parseArchivosSubidos(rawPeticion.archivos_subidos),
      fechas_omitidas: calcularFechasOmitidas(rawPeticion),
    };

    const domiciliosDisponibles = [1, 2, 3]
      .map((slot) => ({
        slot,
        label: `Domicilio ${slot}`,
        value: getDomicilioValue(rawPeticion, slot),
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

    const [rows] = await pool.execute<AdminPeticionRow[]>(
      `
      SELECT
        p.*,
        cl.domicilio_1,
        cl.domicilio_2,
        cl.domicilio_3,
        cl.usuario_id AS usuario_cliente_id,
        pc.created_at AS fecha_pago,
        c.titulo AS catalogo_titulo,
        c.categoria AS catalogo_categoria,
        c.usa_rango_fechas AS catalogo_usa_rango_fechas,
        c.rango_dias AS catalogo_rango_dias
      FROM peticiones_clientes p
      INNER JOIN clientes_clientes cl ON cl.id = p.cliente_id
      LEFT JOIN pagos_clientes pc ON pc.id = p.pago_id
      INNER JOIN catalogo_clientes c ON c.id = p.catalogo_id
      WHERE p.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'Petición no encontrada' }, { status: 404 });
    }

    const current = rows[0];

    const yaEnviadaReporteros = Boolean(current.enviada_reporteros_at || current.noticia_id);

    const intentaEditarContenido =
      hasOwn(body, 'motivo') ||
      hasOwn(body, 'descripcion') ||
      hasOwn(body, 'fecha_deseada') ||
      hasOwn(body, 'usar_domicilio') ||
      hasOwn(body, 'domicilio_slot');

    const intentaCambiarEstatus =
      hasOwn(body, 'estatus') && String(body.estatus) !== String(current.estatus);

    if (yaEnviadaReporteros && (intentaEditarContenido || intentaCambiarEstatus)) {
      return NextResponse.json(
        { error: 'No puedes modificar una petición que ya fue enviada a reporteros.' },
        { status: 400 }
      );
    }

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

      nextDomicilioTexto = getDomicilioValue(current, Number(nextDomicilioSlot));

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

      const clienteUsuarioId = Number(current.usuario_cliente_id);
      const peticionId = Number(id);
      const actorUsuarioId = Number(session.user.id);
      const peticionTitulo = String(
        current.catalogo_titulo || current.motivo || `Petición ${id}`
      );

      if (Number.isInteger(clienteUsuarioId) && clienteUsuarioId > 0) {
        const comentarioChanged = changes.some(
          (change) => change.field === 'comentario_admin'
        );

        const estatusChanged = changes.some(
          (change) => change.field === 'estatus'
        );

        const fechaChanged = changes.some(
          (change) => change.field === 'fecha_deseada'
        );

        if (comentarioChanged) {
          await createNotification({
            usuarioId: clienteUsuarioId,
            actorUsuarioId,
            peticionId,
            tipo: 'comentario_admin',
            titulo: 'Comentario del administrador',
            mensaje: `El administrador agregó / actualizó un comentario en tu petición "${peticionTitulo}".`,
            url: `/formularios/${peticionId}`,
          });
        }

        if (estatusChanged) {
          await createNotification({
            usuarioId: clienteUsuarioId,
            actorUsuarioId,
            peticionId,
            tipo: 'cambio_estatus',
            titulo: 'Estatus actualizado',
            mensaje: `El estatus de tu petición "${peticionTitulo}" cambió a "${nextEstatus}".`,
            url: `/formularios/${peticionId}`,
          });
        }

        if (fechaChanged) {
          await createNotification({
            usuarioId: clienteUsuarioId,
            actorUsuarioId,
            peticionId,
            tipo: 'cambio_fecha',
            titulo: 'Fecha actualizada',
            mensaje: `La fecha de tu petición "${peticionTitulo}" fue actualizada. Revisa los detalles.`,
            url: `/formularios/${peticionId}`,
          });
        }
      }
    }

    const [updatedRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM peticiones_clientes WHERE id = ? LIMIT 1`,
      [id]
    );

    const updatedPeticion = updatedRows[0]
      ? {
          ...updatedRows[0],
          archivos_subidos: parseArchivosSubidos(updatedRows[0].archivos_subidos),
        }
      : null;

    return NextResponse.json({
      ok: true,
      peticion: updatedPeticion,
    });
  } catch (error) {
    console.error('[PATCH /api/admin/peticiones/[id]]', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}