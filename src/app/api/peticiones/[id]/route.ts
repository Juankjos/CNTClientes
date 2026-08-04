// src/app/api/peticiones/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { logAction } from '@/lib/logger';
import { createNotification, notifyAdmins } from '@/lib/notificaciones';

type RouteContext = {
  params: Promise<{ id: string }>;
};

const FESTIVOS_MX_FIJOS = new Set([
  '01-01',
  '02-02',
  '03-16',
  '05-01',
  '09-16',
  '11-20',
  '12-25',
]);

type UploadedPeticionFile = {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'document' | 'video' | 'compressed';
  relativePath: string;
  url: string;
};

type PeticionEditableRow = RowDataPacket & {
  id: number;
  cliente_id: number;
  usuario_cliente_id: number;
  pago_id: number | null;
  catalogo_id: number;
  catalogo_titulo: string | null;
  catalogo_snapshot: unknown;

  categoria: string;
  motivo: string;
  descripcion: string;

  usar_domicilio: number | boolean;
  domicilio_slot: number | null;
  domicilio_texto: string | null;

  fecha_deseada: unknown;
  fecha_fin: unknown;
  usa_rango_fechas: number | boolean;
  rango_dias: number | null;
  usa_hora_cita: number | boolean;
  hora_cita: string | null;

  archivos_subidos: unknown;

  estatus: string;
  enviada_reporteros_at: unknown;
  noticia_id: number | null;

  domicilio_1?: string | null;
  domicilio_2?: string | null;
  domicilio_3?: string | null;

  live_titulo?: string | null;
  live_bloquea_sabado?: unknown;
  live_bloquea_domingo?: unknown;
  live_bloquea_dias_festivos?: unknown;
  live_bloquea_fechas_personalizadas?: unknown;
  live_fechas_bloqueadas_json?: unknown;
};

function hasOwn(obj: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function cleanText(value: unknown) {
  const text = String(value ?? '').trim();
  return text.length ? text : null;
}

function toHistoryValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
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

function toBool(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const text = String(value).trim().toLowerCase();

  return text === '1' || text === 'true' || text === 'sí' || text === 'si';
}

function normalizeDateOnly(value: unknown) {
  const text = String(value ?? '').trim();
  const dateOnly = text.length >= 10 ? text.slice(0, 10) : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValid ? dateOnly : null;
}

function normalizeTime(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] === undefined ? 0 : Number(match[3]);

  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function getDomicilioValue(row: PeticionEditableRow, slot: number) {
  if (![1, 2, 3].includes(slot)) return null;

  const key = `domicilio_${slot}` as 'domicilio_1' | 'domicilio_2' | 'domicilio_3';
  const value = row[key];

  return value ? String(value) : null;
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

  if (bloqueaSabado && day === 6) return true;
  if (bloqueaDomingo && day === 0) return true;
  if (bloqueaDiasFestivos && FESTIVOS_MX_FIJOS.has(getMonthDay(dateOnly))) return true;
  if (fechasBloqueadas.has(dateOnly)) return true;

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

function isUploadedFile(value: any): value is UploadedPeticionFile {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.originalName === 'string' &&
    typeof value.storedName === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.size === 'number' &&
    ['image', 'document', 'video', 'compressed'].includes(value.kind) &&
    typeof value.relativePath === 'string' &&
    typeof value.url === 'string'
  );
}

async function normalizeArchivosSubidos(value: unknown, clienteId: number) {
  if (value === undefined || value === null) return [];

  if (!Array.isArray(value)) {
    throw new Error('archivos_subidos debe ser un arreglo.');
  }

  const uploadRoot = process.env.UPLOAD_DIR;

  if (!uploadRoot) {
    throw new Error('UPLOAD_DIR no está definido.');
  }

  const mediaRoot = path.join(uploadRoot, 'media');
  const safeRoot = `${path.join(mediaRoot, 'peticiones', String(clienteId))}${path.sep}`;

  const safeFiles: UploadedPeticionFile[] = [];

  for (const item of value) {
    if (!isUploadedFile(item)) {
      throw new Error('Uno de los archivos subidos tiene formato inválido.');
    }

    const expectedPrefix = `peticiones/${clienteId}/`;

    if (!item.relativePath.startsWith(expectedPrefix)) {
      throw new Error('Uno de los archivos no pertenece al cliente actual.');
    }

    const fullPath = path.join(mediaRoot, item.relativePath);

    if (!fullPath.startsWith(safeRoot)) {
      throw new Error('Ruta de archivo inválida.');
    }

    const info = await stat(fullPath);

    if (!info.isFile()) {
      throw new Error('Uno de los archivos subidos no existe.');
    }

    if (info.size !== item.size) {
      throw new Error('Uno de los archivos subidos tiene tamaño inconsistente.');
    }

    safeFiles.push({
      id: item.id,
      originalName: item.originalName,
      storedName: item.storedName,
      mimeType: item.mimeType,
      size: item.size,
      kind: item.kind,
      relativePath: item.relativePath,
      url: item.url,
    });
  }

  return safeFiles;
}

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

function parseJsonObject(value: unknown): Record<string, unknown> | null {
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

  return parsed as Record<string, unknown>;
}

function toBooleanDb(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function getSnapshotBoolean(
  snapshot: Record<string, unknown> | null,
  key: string
) {
  return toBooleanDb(snapshot?.[key]);
}

function getSnapshotFechasBloqueadas(snapshot: Record<string, unknown> | null) {
  const value =
    snapshot?.fechas_bloqueadas_json ??
    snapshot?.fechas_bloqueadas ??
    [];

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

export async function GET(_req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    const user = session.user;

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;
    const peticionId = Number(id);

    if (!Number.isInteger(peticionId) || peticionId <= 0) {
      return NextResponse.json(
        { error: 'peticion_id inválido' },
        { status: 400 }
      );
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `
      SELECT
        pc.id,
        pc.pago_id,
        pc.catalogo_id,
        pc.categoria,
        pc.motivo,
        pc.descripcion,

        pc.usar_domicilio,
        pc.domicilio_slot,
        pc.domicilio_texto,

        pc.fecha_deseada,
        pc.fecha_fin,
        pc.rango_dias,

        pc.usa_hora_cita,
        pc.hora_cita,

        pc.archivos_subidos,
        pc.archivos_eliminados_at,
        pc.archivos_limpieza_error,

        pc.estatus AS peticion_estatus,
        pc.comentario_admin,
        pc.created_at,
        pc.updated_at,

        p.estatus AS pago_estatus,
        p.referencia,
        p.monto,
        p.pagado_at,

        COALESCE(pc.catalogo_titulo, p.catalogo_titulo, c.titulo) AS servicio,
        COALESCE(pc.categoria, p.catalogo_categoria, c.categoria) AS catalogo_categoria,

        pc.usa_rango_fechas,
        pc.rango_dias AS catalogo_rango_dias,
        pc.usa_hora_cita AS catalogo_usa_hora_cita,
        pc.catalogo_precio,
        pc.catalogo_snapshot,

        cc.domicilio_1,
        cc.domicilio_2,
        cc.domicilio_3
      FROM peticiones_clientes pc
      INNER JOIN clientes_clientes cc
        ON cc.id = pc.cliente_id
      LEFT JOIN pagos_clientes p
        ON p.id = pc.pago_id
      LEFT JOIN catalogo_clientes c
        ON c.id = pc.catalogo_id
      WHERE pc.id = ?
        AND cc.usuario_id = ?
      LIMIT 1
      `,
      [peticionId, user.id]
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Formulario no encontrado' },
        { status: 404 }
      );
    }

    const row = rows[0];
    const archivos = parseArchivosSubidos(row.archivos_subidos);
    const catalogoSnapshot = parseJsonObject(row.catalogo_snapshot);

    const bloqueaSabado = getSnapshotBoolean(catalogoSnapshot, 'bloquea_sabado');
    const bloqueaDomingo = getSnapshotBoolean(catalogoSnapshot, 'bloquea_domingo');
    const bloqueaDiasFestivos = getSnapshotBoolean(catalogoSnapshot, 'bloquea_dias_festivos');
    const bloqueaFechasPersonalizadas = getSnapshotBoolean(
      catalogoSnapshot,
      'bloquea_fechas_personalizadas'
    );

    const fechasBloqueadas = getSnapshotFechasBloqueadas(catalogoSnapshot);

    return NextResponse.json({
      ...row,
      archivos_subidos: archivos,
      archivos_count: archivos.length,

      bloquea_sabado: bloqueaSabado,
      bloquea_domingo: bloqueaDomingo,
      bloquea_dias_festivos: bloqueaDiasFestivos,
      bloquea_fechas_personalizadas: bloqueaFechasPersonalizadas,
      fechas_bloqueadas_json: fechasBloqueadas,
    });
  } catch (error) {
    console.error('[GET /api/peticiones/[id]]', error);

    return NextResponse.json(
      { error: 'Error interno al cargar formulario' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  try {
    const session = await getSession();
    const user = session.user;

    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const { id } = await params;
    const peticionId = Number(id);

    if (!Number.isInteger(peticionId) || peticionId <= 0) {
      return NextResponse.json(
        { error: 'peticion_id inválido' },
        { status: 400 }
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    const [rows] = await pool.execute<PeticionEditableRow[]>(
      `
      SELECT
        pc.*,
        cc.usuario_id AS usuario_cliente_id,
        cc.domicilio_1,
        cc.domicilio_2,
        cc.domicilio_3,
        c.titulo AS live_titulo,
        c.bloquea_sabado AS live_bloquea_sabado,
        c.bloquea_domingo AS live_bloquea_domingo,
        c.bloquea_dias_festivos AS live_bloquea_dias_festivos,
        c.bloquea_fechas_personalizadas AS live_bloquea_fechas_personalizadas,
        c.fechas_bloqueadas_json AS live_fechas_bloqueadas_json
      FROM peticiones_clientes pc
      INNER JOIN clientes_clientes cc
        ON cc.id = pc.cliente_id
      LEFT JOIN catalogo_clientes c
        ON c.id = pc.catalogo_id
      WHERE pc.id = ?
        AND cc.usuario_id = ?
      LIMIT 1
      `,
      [peticionId, user.id]
    );

    if (!rows.length) {
      return NextResponse.json(
        { error: 'Formulario no encontrado' },
        { status: 404 }
      );
    }

    const current = rows[0];

    if (String(current.estatus) !== 'pendiente') {
      return NextResponse.json(
        {
          error:
            'Esta petición ya fue aceptada o rechazada, por lo tanto ya no puede editarse.',
        },
        { status: 400 }
      );
    }

    if (current.enviada_reporteros_at || current.noticia_id) {
      return NextResponse.json(
        {
          error:
            'Esta petición ya fue enviada a reporteros, por lo tanto ya no puede editarse.',
        },
        { status: 400 }
      );
    }

    const snapshot = parseJsonObject(current.catalogo_snapshot);

    const fromSnapshot = (key: string, fallback: unknown = null) => {
      if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, key)) {
        return snapshot[key];
      }

      return fallback;
    };

    const nextMotivo = hasOwn(body, 'motivo')
      ? cleanText(body.motivo)
      : cleanText(current.motivo);

    const nextDescripcion = hasOwn(body, 'descripcion')
      ? cleanText(body.descripcion)
      : cleanText(current.descripcion);

    const nextFechaDeseada = hasOwn(body, 'fecha_deseada')
      ? normalizeDateOnly(body.fecha_deseada)
      : normalizeDateOnly(current.fecha_deseada);

    if (!nextMotivo || !nextDescripcion || !nextFechaDeseada) {
      return NextResponse.json(
        { error: 'Motivo, descripción y fecha deseada son obligatorios.' },
        { status: 400 }
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = dateOnlyToDate(nextFechaDeseada);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate.getTime() < today.getTime()) {
      return NextResponse.json(
        { error: 'La fecha deseada no puede ser anterior al día actual.' },
        { status: 400 }
      );
    }

    const usaRangoFechas = toBool(
      current.usa_rango_fechas ?? fromSnapshot('usa_rango_fechas')
    );

    const rangoDiasRaw =
      current.rango_dias ?? fromSnapshot('rango_dias');

    const rangoDias =
      rangoDiasRaw === null || rangoDiasRaw === undefined || rangoDiasRaw === ''
        ? null
        : Number(rangoDiasRaw);

    const tieneRangoFechas =
      usaRangoFechas &&
      Number.isInteger(rangoDias) &&
      Number(rangoDias) > 0;

    const usaHoraCita = toBool(
      current.usa_hora_cita ?? fromSnapshot('usa_hora_cita')
    );

    const nextHoraCita = usaHoraCita
      ? normalizeTime(hasOwn(body, 'hora_cita') ? body.hora_cita : current.hora_cita)
      : null;

    if (usaHoraCita && !nextHoraCita) {
      return NextResponse.json(
        { error: 'hora_cita debe tener formato HH:mm o HH:mm:ss.' },
        { status: 400 }
      );
    }

    if (usaHoraCita && nextHoraCita) {
      const [hh, mm, ss] = nextHoraCita.split(':').map(Number);
      const dateTime = dateOnlyToDate(nextFechaDeseada);
      dateTime.setHours(hh, mm, ss ?? 0, 0);

      if (dateTime.getTime() < Date.now()) {
        return NextResponse.json(
          { error: 'La fecha y hora deseada debe ser posterior al momento actual.' },
          { status: 400 }
        );
      }
    }

    const bloqueaSabado = toBool(
      fromSnapshot('bloquea_sabado', current.live_bloquea_sabado)
    );

    const bloqueaDomingo = toBool(
      fromSnapshot('bloquea_domingo', current.live_bloquea_domingo)
    );

    const bloqueaDiasFestivos = toBool(
      fromSnapshot('bloquea_dias_festivos', current.live_bloquea_dias_festivos)
    );

    const bloqueaFechasPersonalizadas = toBool(
      fromSnapshot(
        'bloquea_fechas_personalizadas',
        current.live_bloquea_fechas_personalizadas
      )
    );

    const fechasBloqueadasArray = bloqueaFechasPersonalizadas
      ? parseJsonDates(
          fromSnapshot(
            'fechas_bloqueadas_json',
            current.live_fechas_bloqueadas_json
          )
        )
      : [];

    const fechasBloqueadas = new Set(fechasBloqueadasArray);

    let nextFechaFin: string | null = null;
    let nextRangoDias: number | null = null;

    if (tieneRangoFechas) {
      if (
        shouldSkipDate({
          dateOnly: nextFechaDeseada,
          bloqueaSabado,
          bloqueaDomingo,
          bloqueaDiasFestivos,
          fechasBloqueadas,
        })
      ) {
        return NextResponse.json(
          {
            error:
              'La fecha inicial seleccionada no está disponible para este paquete.',
          },
          { status: 400 }
        );
      }

      nextFechaFin = calculateFechaFin({
        fechaInicio: nextFechaDeseada,
        rangoDias: Number(rangoDias),
        bloqueaSabado,
        bloqueaDomingo,
        bloqueaDiasFestivos,
        fechasBloqueadas,
      });

      nextRangoDias = Number(rangoDias);
    }

    const nextUsarDomicilio = hasOwn(body, 'usar_domicilio')
      ? toBool(body.usar_domicilio)
      : toBool(current.usar_domicilio);

    let nextDomicilioSlot = hasOwn(body, 'domicilio_slot')
      ? body.domicilio_slot === null || body.domicilio_slot === ''
        ? null
        : Number(body.domicilio_slot)
      : current.domicilio_slot === null
        ? null
        : Number(current.domicilio_slot);

    let nextDomicilioTexto: string | null = current.domicilio_texto ?? null;

    if (!nextUsarDomicilio) {
      nextDomicilioSlot = null;
      nextDomicilioTexto = null;
    } else {
      if (![1, 2, 3].includes(Number(nextDomicilioSlot))) {
        return NextResponse.json(
          { error: 'Domicilio inválido.' },
          { status: 400 }
        );
      }

      nextDomicilioTexto = getDomicilioValue(current, Number(nextDomicilioSlot));

      if (!nextDomicilioTexto) {
        return NextResponse.json(
          { error: 'El domicilio seleccionado no existe.' },
          { status: 400 }
        );
      }
    }

    let nextArchivos = parseArchivosSubidos(current.archivos_subidos);

    if (hasOwn(body, 'archivos_subidos')) {
      try {
        nextArchivos = await normalizeArchivosSubidos(
          body.archivos_subidos,
          Number(current.cliente_id)
        );
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : 'Archivos inválidos.',
          },
          { status: 400 }
        );
      }
    }

    const changes: Array<{ field: string; prev: unknown; next: unknown }> = [];

    const trackChange = (field: string, prev: unknown, next: unknown) => {
      if (toHistoryValue(prev) !== toHistoryValue(next)) {
        changes.push({ field, prev, next });
      }
    };

    trackChange('motivo', current.motivo, nextMotivo);
    trackChange('descripcion', current.descripcion, nextDescripcion);
    trackChange('fecha_deseada', normalizeDateOnly(current.fecha_deseada), nextFechaDeseada);
    trackChange('fecha_fin', normalizeDateOnly(current.fecha_fin), nextFechaFin);
    trackChange('usar_domicilio', Number(current.usar_domicilio), nextUsarDomicilio ? 1 : 0);
    trackChange('domicilio_slot', current.domicilio_slot, nextDomicilioSlot);
    trackChange('domicilio_texto', current.domicilio_texto, nextDomicilioTexto);
    trackChange('hora_cita', current.hora_cita, nextHoraCita);

    const currentArchivos = parseArchivosSubidos(current.archivos_subidos);

    if (JSON.stringify(currentArchivos) !== JSON.stringify(nextArchivos)) {
      changes.push({
        field: 'archivos_subidos',
        prev: `${currentArchivos.length} archivo(s)`,
        next: `${nextArchivos.length} archivo(s)`,
      });
    }

    if (!changes.length) {
      return NextResponse.json({
        ok: true,
        unchanged: true,
      });
    }

    const [updateResult] = await pool.execute<ResultSetHeader>(
      `
      UPDATE peticiones_clientes
      SET
        motivo = ?,
        descripcion = ?,
        usar_domicilio = ?,
        domicilio_slot = ?,
        domicilio_texto = ?,
        fecha_deseada = ?,
        fecha_fin = ?,
        rango_dias = ?,
        usa_hora_cita = ?,
        hora_cita = ?,
        archivos_subidos = ?,
        updated_at = NOW()
      WHERE id = ?
        AND cliente_id = ?
        AND estatus = 'pendiente'
      `,
      [
        nextMotivo,
        nextDescripcion,
        nextUsarDomicilio ? 1 : 0,
        nextDomicilioSlot,
        nextDomicilioTexto,
        nextFechaDeseada,
        nextFechaFin,
        nextRangoDias,
        usaHoraCita ? 1 : 0,
        nextHoraCita,
        nextArchivos.length ? JSON.stringify(nextArchivos) : null,
        peticionId,
        current.cliente_id,
      ]
    );

    if (updateResult.affectedRows < 1) {
      return NextResponse.json(
        {
          error:
            'No se pudo actualizar la petición. Es posible que ya no esté pendiente.',
        },
        { status: 409 }
      );
    }

    for (const change of changes) {
      await pool.execute(
        `
        INSERT INTO peticiones_clientes_historial
          (peticion_id, accion, campo, valor_anterior, valor_nuevo, admin_user_id)
        VALUES (?, 'editar_cliente', ?, ?, ?, NULL)
        `,
        [
          peticionId,
          change.field,
          toHistoryValue(change.prev),
          toHistoryValue(change.next),
        ]
      );
    }

    await logAction(
      Number(user.id),
      'editar_peticion_cliente',
      'peticiones',
      `Cliente actualizó la petición ${peticionId}`
    );

    const peticionTitulo = String(
      current.catalogo_titulo ||
        current.live_titulo ||
        nextMotivo ||
        `Petición ${peticionId}`
    );

    try {
      await notifyAdmins({
        actorUsuarioId: Number(user.id),
        peticionId,
        tipo: 'peticion_actualizada',
        titulo: 'Petición actualizada por cliente',
        mensaje: `El cliente actualizó la petición "${peticionTitulo}".`,
        url: `/admin?tab=peticiones&peticionId=${peticionId}`,
      });

      await createNotification({
        usuarioId: Number(user.id),
        actorUsuarioId: Number(user.id),
        peticionId,
        tipo: 'peticion_actualizada',
        titulo: 'Petición actualizada',
        mensaje: `Actualizaste correctamente tu petición "${peticionTitulo}".`,
        url: `/formularios/${peticionId}`,
      });
    } catch (notificationError) {
      console.error(
        '[PATCH /api/peticiones/[id]] Error creando notificaciones:',
        notificationError
      );
    }

    const [updatedRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM peticiones_clientes WHERE id = ? LIMIT 1`,
      [peticionId]
    );

    return NextResponse.json({
      ok: true,
      peticion: updatedRows[0]
        ? {
            ...updatedRows[0],
            archivos_subidos: parseArchivosSubidos(updatedRows[0].archivos_subidos),
          }
        : null,
    });
  } catch (error) {
    console.error('[PATCH /api/peticiones/[id]]', error);

    return NextResponse.json(
      { error: 'Error interno al actualizar formulario' },
      { status: 500 }
    );
  }
}