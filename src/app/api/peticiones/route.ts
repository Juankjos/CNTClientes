// src/app/api/peticiones/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { createNotification, notifyAdmins } from '@/lib/notificaciones';

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

const UPLOAD_ROOT = process.env.UPLOAD_DIR;

if (!UPLOAD_ROOT) {
  throw new Error('UPLOAD_DIR no está definido');
}

const MEDIA_ROOT = path.join(UPLOAD_ROOT, 'media');

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

  const safeFiles: UploadedPeticionFile[] = [];

  for (const item of value) {
    if (!isUploadedFile(item)) {
      throw new Error('Uno de los archivos subidos tiene formato inválido.');
    }

    const expectedPrefix = `peticiones/${clienteId}/`;

    if (!item.relativePath.startsWith(expectedPrefix)) {
      throw new Error('Uno de los archivos no pertenece al cliente actual.');
    }

    const fullPath = path.join(MEDIA_ROOT, item.relativePath);
    const safeRoot = `${path.join(MEDIA_ROOT, 'peticiones', String(clienteId))}${path.sep}`;

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

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    if (session.user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
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
        p.catalogo_titulo,
        p.catalogo_precio,
        p.categoria,
        p.motivo,
        p.descripcion,
        p.usar_domicilio,
        p.domicilio_slot,
        p.domicilio_texto,
        p.fecha_deseada,
        p.fecha_fin,
        p.usa_rango_fechas,
        p.rango_dias,
        p.usa_hora_cita,
        p.hora_cita,
        p.archivos_subidos,
        p.archivos_eliminados_at,
        p.archivos_limpieza_error,
        p.estatus,
        p.comentario_admin,
        p.created_at,
        p.updated_at,
        COALESCE(p.catalogo_titulo, c.titulo) AS titulo
      FROM peticiones_clientes p
      LEFT JOIN catalogo_clientes c ON c.id = p.catalogo_id
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

    const peticiones = rows.map((row) => ({
      ...row,
      archivos_subidos: parseArchivosSubidos(row.archivos_subidos),
    }));

    return NextResponse.json({
      peticiones,
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

    if (session.user.rol !== 'cliente') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
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
      hora_cita,
      archivos_subidos,
    } = body;

    const pagoId = Number(pago_id);
    const catalogoId = Number(catalogo_id);

    if (
      !Number.isInteger(pagoId) ||
      pagoId <= 0 ||
      !Number.isInteger(catalogoId) ||
      catalogoId <= 0 ||
      !motivo ||
      !descripcion ||
      !fecha_deseada
    ) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios.' },
        { status: 400 }
      );
    }

    const fechaInicio = toDateOnly(fecha_deseada);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
      return NextResponse.json(
        { error: 'fecha_deseada debe tener formato YYYY-MM-DD.' },
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

    let archivosSubidos: UploadedPeticionFile[] = [];

    try {
      archivosSubidos = await normalizeArchivosSubidos(archivos_subidos, clienteId);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : 'Archivos inválidos.',
        },
        { status: 400 }
      );
    }

    const [pagoRows] = await pool.execute<RowDataPacket[]>(
      `SELECT
          p.id,
          p.catalogo_id,
          p.estatus,
          p.monto,

          p.catalogo_titulo,
          p.catalogo_descripcion,
          p.catalogo_categoria,
          p.catalogo_imagen,
          p.catalogo_archivo,
          p.catalogo_snapshot,

          c.titulo AS live_titulo,
          c.descripcion AS live_descripcion,
          c.categoria AS live_categoria,
          c.precio AS live_precio,
          c.imagen AS live_imagen,
          c.archivo AS live_archivo,
          c.usa_rango_fechas AS live_usa_rango_fechas,
          c.rango_dias AS live_rango_dias,
          c.usa_hora_cita AS live_usa_hora_cita,
          c.bloquea_sabado AS live_bloquea_sabado,
          c.bloquea_domingo AS live_bloquea_domingo,
          c.bloquea_dias_festivos AS live_bloquea_dias_festivos,
          c.incluye_fines_semana AS live_incluye_fines_semana,
          c.incluye_dias_festivos AS live_incluye_dias_festivos,
          c.bloquea_fechas_personalizadas AS live_bloquea_fechas_personalizadas,
          c.fechas_bloqueadas_json AS live_fechas_bloqueadas_json
        FROM pagos_clientes p
        LEFT JOIN catalogo_clientes c ON c.id = p.catalogo_id
        WHERE p.id = ? AND p.cliente_id = ?
        LIMIT 1`,
      [pagoId, clienteId]
    );

    if (!pagoRows.length) {
      return NextResponse.json({ error: 'Pago no encontrado.' }, { status: 404 });
    }

    const pago = pagoRows[0];

    if (String(pago.estatus) !== 'pagado') {
      return NextResponse.json(
        { error: 'El formulario solo está disponible cuando el pago está aprobado.' },
        { status: 403 }
      );
    }

    if (Number(pago.catalogo_id) !== catalogoId) {
      return NextResponse.json(
        { error: 'El pago no corresponde al contenido seleccionado.' },
        { status: 400 }
      );
    }

    const [dupRows] = await pool.execute<RowDataPacket[]>(
      `SELECT id FROM peticiones_clientes WHERE pago_id = ? LIMIT 1`,
      [pagoId]
    );

    if (dupRows.length) {
      return NextResponse.json(
        {
          error: 'Ya existe una petición para este pago.',
          code: 'PETICION_YA_EXISTE',
          peticion_id: Number(dupRows[0].id),
        },
        { status: 409 }
      );
    }

    const pagoSnapshot = parseJsonObject(pago.catalogo_snapshot);

    const fromPagoSnapshot = (key: string, fallback: unknown = null) => {
      if (pagoSnapshot && Object.prototype.hasOwnProperty.call(pagoSnapshot, key)) {
        return pagoSnapshot[key];
      }

      return fallback;
    };

    const catalogoTitulo = String(
      pago.catalogo_titulo ??
        fromPagoSnapshot('titulo', pago.live_titulo) ??
        ''
    );

    const catalogoPrecio =
      pago.monto === null || pago.monto === undefined
        ? pago.live_precio === null || pago.live_precio === undefined
          ? null
          : Number(pago.live_precio)
        : Number(pago.monto);

    const categoria = String(
      pago.catalogo_categoria ??
        fromPagoSnapshot('categoria', pago.live_categoria) ??
        ''
    ).toLowerCase();

    const usaRangoFechas = toBool(
      fromPagoSnapshot('usa_rango_fechas', pago.live_usa_rango_fechas)
    );

    const rangoDiasRaw = fromPagoSnapshot('rango_dias', pago.live_rango_dias);

    const rangoDias =
      rangoDiasRaw === null || rangoDiasRaw === undefined || rangoDiasRaw === ''
        ? null
        : Number(rangoDiasRaw);

    const usaHoraCita = toBool(
      fromPagoSnapshot('usa_hora_cita', pago.live_usa_hora_cita)
    );

    const bloqueaSabado = toBool(
      fromPagoSnapshot('bloquea_sabado', pago.live_bloquea_sabado)
    );

    const bloqueaDomingo = toBool(
      fromPagoSnapshot('bloquea_domingo', pago.live_bloquea_domingo)
    );

    const bloqueaDiasFestivos = toBool(
      fromPagoSnapshot('bloquea_dias_festivos', pago.live_bloquea_dias_festivos)
    );

    const incluyeFinesSemana = toBool(
      fromPagoSnapshot('incluye_fines_semana', pago.live_incluye_fines_semana),
      true
    );

    const incluyeDiasFestivos = toBool(
      fromPagoSnapshot('incluye_dias_festivos', pago.live_incluye_dias_festivos),
      true
    );

    const bloqueaFechasPersonalizadas = toBool(
      fromPagoSnapshot(
        'bloquea_fechas_personalizadas',
        pago.live_bloquea_fechas_personalizadas
      )
    );

    const fechasBloqueadasArray = bloqueaFechasPersonalizadas
      ? parseJsonDates(
          fromPagoSnapshot(
            'fechas_bloqueadas_json',
            pago.live_fechas_bloqueadas_json
          )
        )
      : [];

    const fechasBloqueadas = new Set(fechasBloqueadasArray);

    const horaCita = usaHoraCita ? normalizeTime(hora_cita) : null;

    if (usaHoraCita && !horaCita) {
      return NextResponse.json(
        { error: 'hora_cita debe tener formato HH:mm o HH:mm:ss.' },
        { status: 400 }
      );
    }

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

    const usarDomicilio = toBool(usar_domicilio);
    let domicilioTexto: string | null = null;
    let domicilioSlotValue: number | null = null;

    if (usarDomicilio) {
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

    const catalogoSnapshotParaPeticion = {
      ...(pagoSnapshot ?? {}),
      catalogo_id: Number(pago.catalogo_id),
      titulo: catalogoTitulo,
      descripcion:
        pago.catalogo_descripcion ??
        fromPagoSnapshot('descripcion', pago.live_descripcion) ??
        null,
      categoria,
      precio: catalogoPrecio,
      imagen:
        pago.catalogo_imagen ??
        fromPagoSnapshot('imagen', pago.live_imagen) ??
        null,
      archivo:
        pago.catalogo_archivo ??
        fromPagoSnapshot('archivo', pago.live_archivo) ??
        null,
      usa_rango_fechas: usaRangoFechas,
      rango_dias: rangoDias,
      usa_hora_cita: usaHoraCita,
      bloquea_sabado: bloqueaSabado,
      bloquea_domingo: bloqueaDomingo,
      bloquea_dias_festivos: bloqueaDiasFestivos,
      incluye_fines_semana: incluyeFinesSemana,
      incluye_dias_festivos: incluyeDiasFestivos,
      bloquea_fechas_personalizadas: bloqueaFechasPersonalizadas,
      fechas_bloqueadas_json: fechasBloqueadasArray,
      snapshot_peticion_at: new Date().toISOString(),
    };

    const [insert] = await pool.execute<ResultSetHeader>(
      `
      INSERT INTO peticiones_clientes
      (
        cliente_id,
        catalogo_id,
        catalogo_titulo,
        catalogo_precio,
        catalogo_snapshot,
        pago_id,
        categoria,
        motivo,
        descripcion,
        usar_domicilio,
        domicilio_slot,
        domicilio_texto,
        fecha_deseada,
        fecha_fin,
        usa_rango_fechas,
        rango_dias,
        usa_hora_cita,
        hora_cita,
        archivos_subidos,
        estatus
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')
      `,
      [
        clienteId,
        Number(pago.catalogo_id),
        catalogoTitulo,
        catalogoPrecio,
        JSON.stringify(catalogoSnapshotParaPeticion),
        pagoId,
        categoria,
        String(motivo).trim(),
        String(descripcion).trim(),
        usarDomicilio ? 1 : 0,
        domicilioSlotValue,
        domicilioTexto,
        fechaInicio,
        fechaFin,
        usaRangoFechas ? 1 : 0,
        rangoDiasPeticion,
        usaHoraCita ? 1 : 0,
        horaCita,
        archivosSubidos.length ? JSON.stringify(archivosSubidos) : null,
      ]
    );

    const peticionId = Number(insert.insertId);
    const peticionTitulo = catalogoTitulo || String(motivo).trim() || `Petición ${peticionId}`;

    await pool.execute(
      `
      INSERT INTO peticiones_clientes_historial
      (peticion_id, accion, campo, valor_anterior, valor_nuevo)
      VALUES (?, 'crear', NULL, NULL, 'Petición creada')
      `,
      [peticionId]
    );

    await logAction(
      Number(session.user.id),
      'crear_peticion',
      'peticiones',
      `Petición ${peticionId} creada`
    );

    /**
     * Las notificaciones no deben bloquear la creación de la petición.
     * Si falla una notificación, la petición sigue siendo válida.
     */
    try {
      await notifyAdmins({
        actorUsuarioId: Number(session.user.id),
        peticionId,
        tipo: 'nueva_peticion',
        titulo: 'Nueva petición recibida',
        mensaje: `Se creó una nueva petición del servicio "${peticionTitulo}".`,
        url: `/admin?tab=peticiones&peticionId=${peticionId}`,
      });

      await createNotification({
        usuarioId: Number(session.user.id),
        actorUsuarioId: Number(session.user.id),
        peticionId,
        tipo: 'nueva_peticion',
        titulo: 'Petición creada',
        mensaje: `Tu petición para "${peticionTitulo}" fue creada correctamente.`,
        url: `/formularios/${peticionId}`,
      });
    } catch (notificationError) {
      console.error('[POST /api/peticiones] Error creando notificaciones:', notificationError);
    }

    return NextResponse.json(
      { ok: true, peticion_id: peticionId },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/peticiones]', error);

    if (error?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        {
          error: 'Ya existe una petición para este pago.',
          code: 'PETICION_YA_EXISTE',
        },
        { status: 409 }
      );
    }

    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}