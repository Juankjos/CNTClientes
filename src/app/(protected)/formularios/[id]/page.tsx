// src/app/(protected)/formularios/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';
import Swal from 'sweetalert2';
import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';

registerLocale('es', es);

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

type FormularioDetalle = {
  id: number;
  pago_id: number;
  catalogo_id: number;
  categoria: string;
  motivo: string;
  descripcion: string;

  usar_domicilio: number | boolean;
  domicilio_slot: number | null;
  domicilio_texto?: string | null;

  fecha_deseada: string;
  fecha_fin?: string | null;
  rango_dias?: number | null;

  usa_hora_cita?: number | boolean;
  hora_cita?: string | null;

  bloquea_sabado?: number | boolean;
  bloquea_domingo?: number | boolean;
  bloquea_dias_festivos?: number | boolean;
  bloquea_fechas_personalizadas?: number | boolean;
  fechas_bloqueadas_json?: string[] | string | null;

  archivos_subidos?: UploadedPeticionFile[];
  archivos_count?: number;
  archivos_eliminados_at?: string | null;
  archivos_limpieza_error?: string | null;

  peticion_estatus: string;
  comentario_admin?: string | null;

  created_at: string;
  updated_at: string;

  pago_estatus: string;
  referencia: string;
  monto: string | number;
  pagado_at: string | null;

  servicio: string;
  catalogo_categoria: string;
  usa_rango_fechas?: number | boolean;
  catalogo_rango_dias?: number | null;
  catalogo_usa_hora_cita?: number | boolean;

  domicilio_1?: string | null;
  domicilio_2?: string | null;
  domicilio_3?: string | null;
};

function formatFechaAmPm(value?: string | null) {
  if (!value) return '—';

  const iso = value.includes('T') ? value : value.replace(' ', 'T');
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(date);
}

function isUploadedPeticionFile(value: any): value is UploadedPeticionFile {
  return (
    value &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    typeof value.originalName === 'string' &&
    typeof value.storedName === 'string' &&
    typeof value.mimeType === 'string' &&
    typeof value.size === 'number' &&
    typeof value.url === 'string'
  );
}

function getArchivosPeticion(item: FormularioDetalle | null): UploadedPeticionFile[] {
  const archivos = item?.archivos_subidos;

  if (!Array.isArray(archivos)) return [];

  return archivos.filter(isUploadedPeticionFile);
}

function formatBytes(bytes: number) {
  const KB = 1024;
  const MB = 1024 * KB;
  const GB = 1024 * MB;

  if (bytes >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(2)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(2)} KB`;

  return `${bytes} B`;
}

function iconForArchivo(kind: UploadedPeticionFile['kind']) {
  if (kind === 'image') return '🖼️';
  if (kind === 'video') return '🎬';
  if (kind === 'document') return '📄';
  if (kind === 'compressed') return '🗜️';

  return '📎';
}

function canPreviewInline(archivo: UploadedPeticionFile) {
  const mime = String(archivo.mimeType ?? '').toLowerCase();
  const name = String(archivo.originalName ?? '').toLowerCase();

  return (
    mime.startsWith('image/') ||
    mime.startsWith('video/') ||
    mime === 'application/pdf' ||
    name.endsWith('.pdf') ||
    mime.startsWith('text/') ||
    name.endsWith('.txt') ||
    name.endsWith('.csv')
  );
}

function archivoUrl(archivo: UploadedPeticionFile) {
  return apiPath(archivo.url);
}

function archivoDownloadUrl(archivo: UploadedPeticionFile) {
  return `${apiPath(archivo.url)}?download=1`;
}

function toBooleanDb(value: unknown) {
  return value === true || value === 1 || value === '1';
}

function formatDias(value: unknown) {
  const dias = Number(value);

  if (!Number.isInteger(dias) || dias <= 0) return null;

  return `${dias} día${dias === 1 ? '' : 's'}`;
}

function parseFechasBloqueadas(value: unknown): string[] {
  let parsed = value;

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

function formatDiasBloqueados({
  bloqueaSabado,
  bloqueaDomingo,
}: {
  bloqueaSabado: boolean;
  bloqueaDomingo: boolean;
}) {
  const dias = [
    bloqueaSabado ? 'Sábados' : null,
    bloqueaDomingo ? 'Domingos' : null,
  ].filter(Boolean);

  return dias.join(' y ');
}

function peticionEstatusColor(estatus?: string | null) {
  const value = String(estatus ?? '').trim().toLowerCase();

  if (value === 'aceptada') return 'text-green-300';
  if (value === 'pendiente') return 'text-yellow-300';
  if (value === 'rechazada') return 'text-red-300';

  return 'text-white';
}

function toDateOnlyDisplay(value?: string | null) {
  if (!value) return '—';

  const text = String(value).trim();
  const dateOnly = text.length >= 10 ? text.slice(0, 10) : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return '—';

  const [year, month, day] = dateOnly.split('-').map(Number);

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return '—';
  }

  const meses = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ];

  return `${day} de ${meses[month - 1]} del ${year}`;
}

function formatHoraDb(value?: string | null) {
  const text = String(value ?? '').trim();

  const match = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return '';

  const [, hh, mm] = match;

  const date = new Date();
  date.setHours(Number(hh), Number(mm), 0, 0);

  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function formatFechaPeticion(
  fechaValue?: string | null,
  horaValue?: string | null,
  usaHora?: unknown
) {
  const fecha = toDateOnlyDisplay(fechaValue);
  const hora = toBooleanDb(usaHora) ? formatHoraDb(horaValue) : '';

  if (fecha === '—') return '—';
  if (!hora) return fecha;

  return `${fecha} · ${hora}`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toSqlDateOnlyFromDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());

  return `${yyyy}-${mm}-${dd}`;
}

function toSqlTimeFromDate(date: Date) {
  const hh = pad(date.getHours());
  const mi = pad(date.getMinutes());

  return `${hh}:${mi}`;
}

function dateOnlyToLocalDate(value?: string | null) {
  const text = String(value ?? '').trim();
  const dateOnly = text.length >= 10 ? text.slice(0, 10) : '';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;

  const [year, month, day] = dateOnly.split('-').map(Number);
  const date = new Date(year, month - 1, day);

  const isValidDate =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValidDate ? date : null;
}

function buildEditDateValue(
  dateOnly: string,
  timeValue: string,
  usaHora: unknown
) {
  const date = dateOnlyToLocalDate(dateOnly);

  if (!date) return null;

  if (!toBooleanDb(usaHora)) {
    date.setHours(0, 0, 0, 0);
    return date;
  }

  const match = String(timeValue ?? '').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) {
    date.setHours(9, 0, 0, 0);
    return date;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = match[3] ? Number(match[3]) : 0;

  date.setHours(hour, minute, second, 0);

  return date;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function isInsideDateRange(day: Date, start: Date, end: Date) {
  const current = startOfDay(day).getTime();
  const rangeStart = startOfDay(start).getTime();
  const rangeEnd = startOfDay(end).getTime();

  return current >= rangeStart && current <= rangeEnd;
}

function formatFechaSoloDate(value: Date | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
  }).format(value);
}

function formatHoraDate(value: Date | null) {
  if (!value) return '';

  return new Intl.DateTimeFormat('es-MX', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(value);
}

export default function VerFormularioPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const peticionId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<FormularioDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [editForm, setEditForm] = useState({
    motivo: '',
    descripcion: '',
    usar_domicilio: false,
    domicilio_slot: '',
    fecha_deseada: '',
    hora_cita: '',
  });

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiPath(`/api/peticiones/${peticionId}`));
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error ?? 'No se pudo cargar el formulario.');
          setLoading(false);
          return;
        }

        setItem(data);
        setEditForm({
          motivo: String(data.motivo ?? ''),
          descripcion: String(data.descripcion ?? ''),
          usar_domicilio: toBooleanDb(data.usar_domicilio),
          domicilio_slot: data.domicilio_slot ? String(data.domicilio_slot) : '',
          fecha_deseada: String(data.fecha_deseada ?? '').slice(0, 10),
          hora_cita: data.hora_cita ? String(data.hora_cita).slice(0, 5) : '',
        });
        setLoading(false);
      } catch {
        setError('No se pudo cargar el formulario.');
        setLoading(false);
      }
    }

    if (!Number.isInteger(peticionId) || peticionId <= 0) {
      setError('Petición inválida.');
      setLoading(false);
      return;
    }

    load();
    }, [peticionId]);

  const domicilioTexto = useMemo(() => {
    if (!item) return 'No aplica';
    if (!item.usar_domicilio || !item.domicilio_slot) return 'No aplica';

    const slot = item.domicilio_slot;
    return item[`domicilio_${slot}` as keyof FormularioDetalle] ?? 'No disponible';
  }, [item]);

  const domicilioOpciones = useMemo(() => {
  if (!item) return [];

  return [1, 2, 3]
    .map((slot) => {
      const value = item[`domicilio_${slot}` as keyof FormularioDetalle];

      return {
        slot,
        label: `Domicilio ${slot}`,
        value: typeof value === 'string' ? value.trim() : '',
      };
    })
    .filter((domicilio) => domicilio.value.length > 0);
  }, [item]);

  function getDomicilioResumen(value: string) {
    const cleanValue = String(value ?? '').trim();

    if (!cleanValue) return 'Domicilio sin información';
    if (cleanValue.length <= 120) return cleanValue;

    return `${cleanValue.slice(0, 120)}...`;
  }

  const rangoDiasTexto = useMemo(() => {
    if (!item) return null;

    return formatDias(item.rango_dias ?? item.catalogo_rango_dias);
  }, [item]);

  const bloqueaSabado = toBooleanDb(item?.bloquea_sabado);
  const bloqueaDomingo = toBooleanDb(item?.bloquea_domingo);
  const bloqueaDiasFestivos = toBooleanDb(item?.bloquea_dias_festivos);
  const bloqueaFechasPersonalizadas = toBooleanDb(item?.bloquea_fechas_personalizadas);

  const fechasBloqueadas = useMemo(() => {
    return parseFechasBloqueadas(item?.fechas_bloqueadas_json);
  }, [item]);

  const diasFinSemanaBloqueados = formatDiasBloqueados({
    bloqueaSabado,
    bloqueaDomingo,
  });

  const tieneRestriccionesRango =
    bloqueaSabado ||
    bloqueaDomingo ||
    bloqueaDiasFestivos ||
    (bloqueaFechasPersonalizadas && fechasBloqueadas.length > 0);

  const itemTieneRango =
    toBooleanDb(item?.usa_rango_fechas) &&
    Boolean(rangoDiasTexto);

  const puedeEditarCliente =
    String(item?.peticion_estatus ?? '').toLowerCase() === 'pendiente';

  const fechasBloqueadasSet = useMemo(() => {
    return new Set(
      fechasBloqueadas
        .map((fecha) => String(fecha).trim())
        .filter((fecha) => /^\d{4}-\d{2}-\d{2}$/.test(fecha))
    );
  }, [fechasBloqueadas]);

  function getMonthDayFromDate(date: Date) {
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function getMotivosSaltoEdicion(date: Date) {
    const dateOnly = toSqlDateOnlyFromDate(date);
    const day = date.getDay();

    const motivos: string[] = [];

    const isSaturday = day === 6;
    const isSunday = day === 0;
    const isHoliday = ['01-01', '02-02', '03-16', '05-01', '09-16', '11-20', '12-25']
      .includes(getMonthDayFromDate(date));
    const isCustomBlocked = fechasBloqueadasSet.has(dateOnly);

    if (bloqueaSabado && isSaturday) {
      motivos.push('Sábado omitido');
    }

    if (bloqueaDomingo && isSunday) {
      motivos.push('Domingo omitido');
    }

    if (bloqueaDiasFestivos && isHoliday) {
      motivos.push('Día festivo');
    }

    if (bloqueaFechasPersonalizadas && isCustomBlocked) {
      motivos.push('Fecha omitida por el administrador');
    }

    return motivos;
  }

  function isFechaBloqueadaPorAdminEdicion(date: Date) {
    return getMotivosSaltoEdicion(date).length > 0;
  }

  function calcularFechaFinEdicion(start: Date, totalDias: number) {
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);

    let counted = 0;
    let guard = 0;

    while (counted < totalDias) {
      if (!isFechaBloqueadaPorAdminEdicion(current)) {
        counted += 1;

        if (counted === totalDias) {
          return new Date(current);
        }
      }

      current.setDate(current.getDate() + 1);
      guard += 1;

      if (guard > 730) {
        return null;
      }
    }

    return null;
  }

  function calcularDetalleRangoEdicion(start: Date, totalDias: number) {
    const current = new Date(start);
    current.setHours(0, 0, 0, 0);

    let counted = 0;
    let guard = 0;

    const detalles: Array<{
      fecha: Date;
      fechaTexto: string;
      aplica: boolean;
      motivos: string[];
      numeroAplicable: number | null;
    }> = [];

    while (counted < totalDias) {
      const fecha = new Date(current);
      const motivos = getMotivosSaltoEdicion(fecha);
      const aplica = motivos.length === 0;

      let numeroAplicable: number | null = null;

      if (aplica) {
        counted += 1;
        numeroAplicable = counted;
      }

      detalles.push({
        fecha,
        fechaTexto: toSqlDateOnlyFromDate(fecha),
        aplica,
        motivos,
        numeroAplicable,
      });

      if (counted === totalDias) {
        return detalles;
      }

      current.setDate(current.getDate() + 1);
      guard += 1;

      if (guard > 730) {
        return detalles;
      }
    }

    return detalles;
  }

  const totalDiasRangoEdicion = Number(item?.rango_dias ?? item?.catalogo_rango_dias ?? 0);

  const tieneRangoFechasEdicion =
    itemTieneRango &&
    Number.isInteger(totalDiasRangoEdicion) &&
    totalDiasRangoEdicion > 0;

  const editFechaDeseadaDate = useMemo(() => {
    return buildEditDateValue(
      editForm.fecha_deseada,
      editForm.hora_cita,
      item?.usa_hora_cita
    );
  }, [editForm.fecha_deseada, editForm.hora_cita, item?.usa_hora_cita]);

  const editFechaFinCalculada =
    tieneRangoFechasEdicion && editFechaDeseadaDate
      ? calcularFechaFinEdicion(editFechaDeseadaDate, totalDiasRangoEdicion)
      : null;

  const editDetalleRango =
    tieneRangoFechasEdicion && editFechaDeseadaDate
      ? calcularDetalleRangoEdicion(editFechaDeseadaDate, totalDiasRangoEdicion)
      : [];

  const editFechasSaltadas = editDetalleRango.filter((detalle) => !detalle.aplica);

  function getEditRangeDayClassName(day: Date) {
    if (!tieneRangoFechasEdicion || !editFechaDeseadaDate || !editFechaFinCalculada) {
      return '';
    }

    if (!isInsideDateRange(day, editFechaDeseadaDate, editFechaFinCalculada)) {
      return '';
    }

    const dateOnly = toSqlDateOnlyFromDate(day);
    const detalle = editDetalleRango.find((item) => item.fechaTexto === dateOnly);

    if (detalle && !detalle.aplica) {
      return 'cnt-special-range-skipped';
    }

    const isStart = isSameDay(day, editFechaDeseadaDate);
    const isEnd = isSameDay(day, editFechaFinCalculada);

    if (isStart && isEnd) return 'cnt-special-range-single';
    if (isStart) return 'cnt-special-range-start';
    if (isEnd) return 'cnt-special-range-end';

    return 'cnt-special-range-middle';
  }

  function resetEditFormFromItem(currentItem: FormularioDetalle) {
    setEditForm({
      motivo: String(currentItem.motivo ?? ''),
      descripcion: String(currentItem.descripcion ?? ''),
      usar_domicilio: toBooleanDb(currentItem.usar_domicilio),
      domicilio_slot: currentItem.domicilio_slot ? String(currentItem.domicilio_slot) : '',
      fecha_deseada: String(currentItem.fecha_deseada ?? '').slice(0, 10),
      hora_cita: currentItem.hora_cita ? String(currentItem.hora_cita).slice(0, 5) : '',
    });
  }

  function cancelEdit() {
    if (item) {
      resetEditFormFromItem(item);
    }

    setEditing(false);
  }

  async function saveClienteEdit() {
    if (!item) return;

    if (!editForm.motivo.trim()) {
      await Swal.fire('Falta información', 'Debes escribir el motivo.', 'warning');
      return;
    }

    if (!editForm.descripcion.trim()) {
      await Swal.fire('Falta información', 'Debes escribir la descripción.', 'warning');
      return;
    }

    if (!editForm.fecha_deseada) {
      await Swal.fire('Falta información', 'Debes elegir una fecha.', 'warning');
      return;
    }

    if (!editFechaDeseadaDate) {
      await Swal.fire('Fecha inválida', 'Debes elegir una fecha válida.', 'warning');
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selected = new Date(editFechaDeseadaDate);
    selected.setHours(0, 0, 0, 0);

    if (selected.getTime() < today.getTime()) {
      await Swal.fire(
        'Fecha inválida',
        tieneRangoFechasEdicion
          ? 'Debes elegir una fecha inicial de hoy o posterior.'
          : 'Debes elegir una fecha de hoy o posterior.',
        'warning'
      );
      return;
    }

    if (isFechaBloqueadaPorAdminEdicion(selected)) {
      await Swal.fire(
        'Fecha no disponible',
        tieneRangoFechasEdicion
          ? 'La fecha inicial seleccionada no aplica.'
          : 'La fecha seleccionada fue bloqueada por el administrador.',
        'warning'
      );
      return;
    }

    if (tieneRangoFechasEdicion && !editFechaFinCalculada) {
      await Swal.fire(
        'Rango inválido',
        'No se pudo calcular la fecha final del rango. Revisa las fechas bloqueadas.',
        'warning'
      );
      return;
    }

    if (toBooleanDb(item.usa_hora_cita) && editFechaDeseadaDate.getTime() < Date.now()) {
      await Swal.fire(
        'Fecha inválida',
        'Debes elegir una fecha y hora posterior al momento actual.',
        'warning'
      );
      return;
    }

    if (toBooleanDb(item.usa_hora_cita) && !editForm.hora_cita) {
      await Swal.fire('Falta información', 'Debes elegir una hora.', 'warning');
      return;
    }

    if (editForm.usar_domicilio && !editForm.domicilio_slot) {
      await Swal.fire('Falta información', 'Debes elegir un domicilio.', 'warning');
      return;
    }

    const confirm = await Swal.fire({
      title: '¿Guardar cambios?',
      text: 'El administrador será notificado de la actualización.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#16a34a',
      cancelButtonColor: '#374151',
      background: '#111827',
      color: '#ffffff',
    });

    if (!confirm.isConfirmed) return;

    try {
      setSavingEdit(true);

      const res = await fetch(apiPath(`/api/peticiones/${item.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo: editForm.motivo.trim(),
          descripcion: editForm.descripcion.trim(),
          usar_domicilio: editForm.usar_domicilio,
          domicilio_slot: editForm.usar_domicilio
            ? Number(editForm.domicilio_slot)
            : null,
          fecha_deseada: toSqlDateOnlyFromDate(editFechaDeseadaDate),
          hora_cita: toBooleanDb(item.usa_hora_cita)
            ? `${toSqlTimeFromDate(editFechaDeseadaDate)}:00`
            : null,

          archivos_subidos: getArchivosPeticion(item),
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        await Swal.fire(
          'Error',
          data.error ?? 'No se pudo actualizar la petición.',
          'error'
        );

        return;
      }

      await Swal.fire({
        title: 'Petición actualizada',
        text: 'Los cambios se guardaron correctamente.',
        icon: 'success',
        confirmButtonColor: '#dc2626',
        background: '#111827',
        color: '#ffffff',
      });

      setEditing(false);

      const reload = await fetch(apiPath(`/api/peticiones/${item.id}`));
      const reloadData = await reload.json().catch(() => null);

      if (reload.ok && reloadData) {
        setItem(reloadData);
      }
    } finally {
      setSavingEdit(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-cnt-surface rounded w-1/3" />
        <div className="h-80 bg-cnt-surface rounded-xl" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 text-red-300">
          {error ?? 'No se encontró el formulario.'}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
          Formulario enviado
        </p>
        <h1 className="font-display text-3xl text-white">Ver Formulario</h1>
      </div>

      <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 space-y-5">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Servicio</p>
          <div className="text-white px-1 py-1 text-sm">
            {item.servicio}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Estatus de pago</p>
          <div className="text-white px-1 py-1 text-sm uppercase">
            {item.pago_estatus}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
            Estatus de petición
          </p>
          <div className={`px-1 py-1 text-sm uppercase ${peticionEstatusColor(item.peticion_estatus)}`}>
            {item.peticion_estatus}
          </div>
        </div>

        {puedeEditarCliente ? (
          <div className="rounded-lg border border-blue-900/60 bg-blue-950/20 px-4 py-3">
            <p className="text-sm text-blue-200">
              Esta petición aún está pendiente. Puedes editarla antes de que sea aceptada o rechazada.
            </p>

            <button
              type="button"
              onClick={() => {
                if (editing) {
                  cancelEdit();
                } else {
                  setEditing(true);
                }
              }}
              className="mt-3 cursor-pointer rounded-lg border border-blue-800 bg-blue-950/40 px-4 py-2 text-sm text-blue-300 hover:text-white"
            >
              {editing ? 'Cancelar edición' : 'Editar petición'}
            </button>
          </div>
        ) : (
          <div className="rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-gray-400">
            Esta petición ya fue {item.peticion_estatus}. Ya no puede editarse.
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
            Comentario del administrador
          </p>

          {item.comentario_admin ? (
            <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-300 whitespace-pre-wrap">
              {item.comentario_admin}
            </div>
          ) : (
            <div className="rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-gray-500">
              Aún no hay comentarios del administrador.
            </div>
          )}
        </div>

        {editing && puedeEditarCliente && (
          <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4 space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Motivo
              </label>
              <textarea
                value={editForm.motivo}
                onChange={(e) =>
                  setEditForm((form) => ({
                    ...form,
                    motivo: e.target.value,
                  }))
                }
                rows={3}
                className="w-full resize-none rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-white focus:border-cnt-red focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Descripción
              </label>
              <textarea
                value={editForm.descripcion}
                onChange={(e) =>
                  setEditForm((form) => ({
                    ...form,
                    descripcion: e.target.value,
                  }))
                }
                rows={5}
                className="w-full resize-none rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-white focus:border-cnt-red focus:outline-none"
              />
            </div>

            <div>
              <div className="flex items-center justify-between gap-4 mb-3">
                <label className="text-xs text-gray-400 uppercase tracking-widest">
                  ¿Usar domicilio?
                </label>

                <button
                  type="button"
                  onClick={() =>
                    setEditForm((form) => ({
                      ...form,
                      usar_domicilio: !form.usar_domicilio,
                      domicilio_slot: !form.usar_domicilio ? form.domicilio_slot : '',
                    }))
                  }
                  className={`cursor-pointer rounded-lg border px-3 py-2 text-sm ${
                    editForm.usar_domicilio
                      ? 'border-cnt-red bg-cnt-red text-white'
                      : 'border-cnt-border bg-cnt-dark text-gray-300'
                  }`}
                >
                  {editForm.usar_domicilio ? 'Sí' : 'No'}
                </button>
              </div>

              {editForm.usar_domicilio && (
                <div className="space-y-3">
                  {domicilioOpciones.length === 0 ? (
                    <div className="rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-300">
                      No tienes domicilios registrados disponibles.
                    </div>
                  ) : (
                    domicilioOpciones.map((domicilio) => {
                      const selected = editForm.domicilio_slot === String(domicilio.slot);

                      return (
                        <button
                          key={domicilio.slot}
                          type="button"
                          onClick={() =>
                            setEditForm((form) => ({
                              ...form,
                              domicilio_slot: String(domicilio.slot),
                            }))
                          }
                          className={`w-full cursor-pointer rounded-xl border px-4 py-3 text-left transition-all ${
                            selected
                              ? 'border-cnt-red bg-red-950/30 ring-1 ring-cnt-red/60'
                              : 'border-cnt-border bg-cnt-dark hover:border-gray-500'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-white">
                                {domicilio.label}
                              </p>

                              <p className="mt-1 text-xs leading-relaxed text-gray-400">
                                {getDomicilioResumen(domicilio.value)}
                              </p>
                            </div>

                            <span
                              className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                                selected
                                  ? 'border-cnt-red bg-cnt-red text-white'
                                  : 'border-gray-600 text-transparent'
                              }`}
                            >
                              ✓
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}

                  {editForm.domicilio_slot && (
                    <div className="rounded-lg border border-cnt-border bg-black/20 px-4 py-3">
                      <p className="text-xs uppercase tracking-widest text-gray-500">
                        Domicilio seleccionado
                      </p>

                      <p className="mt-1 whitespace-pre-wrap text-sm text-white">
                        {
                          domicilioOpciones.find(
                            (domicilio) => String(domicilio.slot) === editForm.domicilio_slot
                          )?.value ?? 'No disponible'
                        }
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                {tieneRangoFechasEdicion
                  ? toBooleanDb(item.usa_hora_cita)
                    ? 'Elegir fecha inicial y hora'
                    : 'Elegir fecha inicial'
                  : toBooleanDb(item.usa_hora_cita)
                    ? 'Elegir fecha y hora deseada'
                    : 'Elegir fecha deseada'}

                <span className="block normal-case tracking-normal text-gray-500 mt-1">
                  {tieneRangoFechasEdicion
                    ? toBooleanDb(item.usa_hora_cita)
                      ? `Selecciona la fecha inicial y la hora. Cubrirá ${totalDiasRangoEdicion} día${totalDiasRangoEdicion === 1 ? '' : 's'} aplicable${totalDiasRangoEdicion === 1 ? '' : 's'} con el mismo horario.`
                      : `Selecciona la fecha inicial. Cubrirá ${totalDiasRangoEdicion} día${totalDiasRangoEdicion === 1 ? '' : 's'}.`
                    : toBooleanDb(item.usa_hora_cita)
                      ? 'La hora seleccionada se mostrará en formato AM/PM.'
                      : 'Selecciona la fecha deseada.'}
                </span>
              </label>

              <DatePicker
                id="fecha_deseada_edicion"
                selected={editFechaDeseadaDate}
                onChange={(date: Date | null) => {
                  if (!date) {
                    setEditForm((form) => ({
                      ...form,
                      fecha_deseada: '',
                      hora_cita: '',
                    }));
                    return;
                  }

                  const next = new Date(date);

                  if (!toBooleanDb(item.usa_hora_cita)) {
                    next.setHours(0, 0, 0, 0);
                  }

                  setEditForm((form) => ({
                    ...form,
                    fecha_deseada: toSqlDateOnlyFromDate(next),
                    hora_cita: toBooleanDb(item.usa_hora_cita)
                      ? toSqlTimeFromDate(next)
                      : '',
                  }));
                }}
                filterDate={(date: Date) => !isFechaBloqueadaPorAdminEdicion(date)}
                showTimeSelect={toBooleanDb(item.usa_hora_cita)}
                locale="es"
                minDate={new Date()}
                filterTime={
                  toBooleanDb(item.usa_hora_cita)
                    ? (time: Date) => {
                        const selectedDate = editFechaDeseadaDate ?? new Date();

                        const selectedDay = startOfDay(selectedDate).getTime();
                        const today = startOfDay(new Date()).getTime();

                        if (selectedDay !== today) return true;

                        return time.getTime() >= Date.now();
                      }
                    : undefined
                }
                timeIntervals={30}
                timeCaption="Hora"
                dateFormat={toBooleanDb(item.usa_hora_cita) ? 'dd/MM/yyyy h:mm aa' : 'dd/MM/yyyy'}
                placeholderText={
                  tieneRangoFechasEdicion
                    ? toBooleanDb(item.usa_hora_cita)
                      ? 'Selecciona fecha inicial y hora'
                      : 'Selecciona fecha inicial'
                    : toBooleanDb(item.usa_hora_cita)
                      ? 'Selecciona fecha y hora'
                      : 'Selecciona fecha'
                }
                dayClassName={tieneRangoFechasEdicion ? getEditRangeDayClassName : undefined}
                calendarClassName="cnt-datepicker-calendar"
                popperClassName="cnt-datepicker-popper"
                wrapperClassName="w-full"
                className="w-full rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 text-sm text-white focus:border-cnt-red focus:outline-none cursor-pointer"
              />

              {tieneRangoFechasEdicion && (
                <div className="mt-3 rounded-lg border border-blue-900/60 bg-blue-950/20 px-4 py-3 text-sm">
                  {editFechaDeseadaDate && (
                    <div className="mb-3 flex flex-wrap gap-3 text-xs">
                      <div className="flex items-center gap-2 text-gray-400">
                        <span className="h-3 w-3 rounded bg-blue-700" />
                        Día aplicable
                      </div>

                      <div className="flex items-center gap-2 text-gray-400">
                        <span className="h-3 w-3 rounded bg-yellow-700" />
                        Día omitido
                      </div>
                    </div>
                  )}

                  <p className="text-blue-200 font-semibold">
                    Reglas del rango
                  </p>

                  <ul className="mt-2 space-y-1 text-gray-400 text-xs">
                    <li>
                      Total aplicable: {totalDiasRangoEdicion} día
                      {totalDiasRangoEdicion === 1 ? '' : 's'}
                    </li>

                    {(bloqueaSabado || bloqueaDomingo) && (
                      <li>
                        Se omiten:{' '}
                        {[
                          bloqueaSabado ? 'sábados' : null,
                          bloqueaDomingo ? 'domingos' : null,
                        ]
                          .filter(Boolean)
                          .join(' y ')}
                        .
                      </li>
                    )}

                    {bloqueaDiasFestivos && (
                      <li>
                        Se omiten los días festivos.
                      </li>
                    )}

                    {bloqueaFechasPersonalizadas && fechasBloqueadas.length > 0 && (
                      <li>
                        NO aplicable: {fechasBloqueadas.length} fecha
                        {fechasBloqueadas.length === 1 ? '' : 's'}.
                      </li>
                    )}
                  </ul>
                </div>
              )}

              {editFechaDeseadaDate && (
                <div className="mt-3 rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3">
                  <p className="text-xs uppercase tracking-widest text-gray-400 mb-1">
                    {tieneRangoFechasEdicion ? 'Rango seleccionado' : 'Fecha seleccionada'}
                  </p>

                  {tieneRangoFechasEdicion ? (
                    <div className="space-y-1">
                      <p className="text-white">
                        Inicio:{' '}
                        <span className="font-semibold">
                          {formatFechaSoloDate(editFechaDeseadaDate)}
                        </span>
                      </p>

                      <p className="text-white">
                        Fin:{' '}
                        <span className="font-semibold">
                          {formatFechaSoloDate(editFechaFinCalculada)}
                        </span>
                      </p>

                      {toBooleanDb(item.usa_hora_cita) && (
                        <p className="text-white">
                          Hora:{' '}
                          <span className="font-semibold">
                            {formatHoraDate(editFechaDeseadaDate)}
                          </span>
                        </p>
                      )}

                      <p className="text-xs text-gray-500">
                        Se usarán {totalDiasRangoEdicion} día
                        {totalDiasRangoEdicion === 1 ? '' : 's'} aplicable
                        {totalDiasRangoEdicion === 1 ? '' : 's'}. Las fechas no disponibles se omiten automáticamente.
                        {toBooleanDb(item.usa_hora_cita) && ' La hora seleccionada aplicará a todas las fechas aplicables.'}
                      </p>

                      {editFechasSaltadas.length > 0 && (
                        <div className="mt-4 rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-4 py-3">
                          <p className="text-sm font-semibold text-yellow-300">
                            Fechas omitidas:
                          </p>

                          <p className="text-xs text-gray-400 mt-1">
                            El rango se extendió porque las siguientes fechas no son aplicables:
                          </p>

                          <div className="mt-3 space-y-2">
                            {editFechasSaltadas.map((detalle) => (
                              <div
                                key={detalle.fechaTexto}
                                className="rounded-md border border-yellow-900/60 bg-cnt-dark px-3 py-2"
                              >
                                <p className="text-sm text-white">
                                  {formatFechaSoloDate(detalle.fecha)}
                                </p>

                                <p className="text-xs text-yellow-300 mt-0.5">
                                  {detalle.motivos.join(' | ')}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="text-lg font-semibold text-white">
                      {toBooleanDb(item.usa_hora_cita)
                        ? `${formatFechaSoloDate(editFechaDeseadaDate)} · ${formatHoraDate(editFechaDeseadaDate)}`
                        : formatFechaSoloDate(editFechaDeseadaDate)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={savingEdit}
                onClick={cancelEdit}
                className="cursor-pointer rounded-lg border border-cnt-border px-4 py-2 text-sm text-gray-300 hover:text-white disabled:opacity-60"
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={savingEdit}
                onClick={saveClienteEdit}
                className="cursor-pointer rounded-lg border border-green-800 bg-green-950/40 px-4 py-2 text-sm text-green-300 hover:text-white disabled:opacity-60"
              >
                {savingEdit ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        )}

    {!editing && (
      <>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Motivo</p>
          <div className="text-white px-1 py-1 text-sm whitespace-pre-wrap">
            {item.motivo}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Descripción</p>
          <div className="text-white px-1 py-1 text-sm whitespace-pre-wrap">
            {item.descripcion}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Ubicación elegida</p>
          <div className="text-gray-400 px-1 py-1 text-sm">
            {item.usar_domicilio && item.domicilio_slot
              ? `Domicilio ${item.domicilio_slot}:`
              : 'No aplica'}
          </div>
          <div className="text-white px-1 py-1 text-sm whitespace-pre-wrap">
            {String(domicilioTexto || 'No aplica')}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
            Fecha y hora deseada
          </p>
          <div className="text-white px-1 py-1 text-sm">
            {formatFechaPeticion(item.fecha_deseada, item.hora_cita, item.usa_hora_cita)}
          </div>
        </div>

        {item.fecha_fin && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
              Fecha fin
            </p>
            <div className="text-white px-1 py-1 text-sm">
              {toDateOnlyDisplay(item.fecha_fin)}
            </div>
          </div>
        )}

        {itemTieneRango && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
              Rango de fechas
            </p>

            <div className="rounded-xl border border-blue-900/60 bg-blue-950/20 p-4">
              <p className="text-white font-semibold">
                Cubre {rangoDiasTexto}.
              </p>

              {item.fecha_fin && (
                <p className="text-sm text-gray-400 mt-1">
                  Fecha final calculada: {toDateOnlyDisplay(item.fecha_fin)}
                </p>
              )}

              {tieneRestriccionesRango && (
                <div className="mt-4 rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-4 py-3">
                  <p className="text-xs text-yellow-300 uppercase tracking-widest mb-2">
                    El paquete omitió las siguientes fechas
                  </p>

                  <p className="text-xs text-gray-400 mb-3">
                    Se conserva la cantidad de {rangoDiasTexto} contratados. Las fechas omitidas no cuentan dentro del rango aplicable.
                  </p>

                  <div className="space-y-3 text-sm">
                    {(bloqueaSabado || bloqueaDomingo) && (
                      <div>
                        <p className="text-white font-semibold">
                          Se omiten los días:
                        </p>
                        <p className="text-gray-400">
                          {diasFinSemanaBloqueados}
                        </p>
                      </div>
                    )}

                    {bloqueaDiasFestivos && (
                      <div>
                        <p className="text-white font-semibold">
                          Se omiten días festivos:
                        </p>
                        <p className="text-gray-400">
                          1 de enero, 2 de febrero, 16 de marzo, 1 de mayo, 16 de septiembre, 20 de noviembre y 25 de diciembre.
                        </p>
                      </div>
                    )}

                    {bloqueaFechasPersonalizadas && fechasBloqueadas.length > 0 && (
                      <div>
                        <p className="text-white font-semibold">
                          Se omitieron fechas personalizadas:
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          {fechasBloqueadas.map((fecha) => (
                            <span
                              key={fecha}
                              className="rounded-full border border-yellow-800/70 bg-cnt-dark px-3 py-1 text-xs text-yellow-200"
                            >
                              {toDateOnlyDisplay(fecha)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-yellow-300 mt-3">
                    Las fechas no incluidas se omitieron y el rango se extendió hasta completar los días aplicables.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Enviado el</p>
          <div className="text-white px-1 py-1 text-sm">
            {toDateOnlyDisplay(item.created_at)}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
            Archivos adjuntos
          </p>

          {item.archivos_eliminados_at ? (
            <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3">
              <p className="text-sm text-yellow-300">
                Los archivos de este formulario ya fueron eliminados por limpieza automática.
              </p>

              <p className="text-xs text-gray-500 mt-1">
                Eliminados el {formatFechaAmPm(item.archivos_eliminados_at)}
              </p>

              {item.archivos_limpieza_error && (
                <p className="text-xs text-red-300 mt-2">
                  Error de limpieza: {item.archivos_limpieza_error}
                </p>
              )}
            </div>
          ) : getArchivosPeticion(item).length === 0 ? (
            <p className="text-sm text-gray-500">No se adjuntaron archivos.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {getArchivosPeticion(item).map((archivo) => (
                <div
                  key={archivo.id}
                  className="rounded-xl border border-cnt-border bg-cnt-dark overflow-hidden"
                >
                  <div className="p-4 flex items-start gap-3">
                    <div className="text-3xl shrink-0">
                      {iconForArchivo(archivo.kind)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-white font-medium truncate">
                        {archivo.originalName}
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        {archivo.kind} · {formatBytes(Number(archivo.size))}
                      </p>

                      <p className="text-[10px] text-gray-600 mt-1 truncate">
                        {archivo.mimeType}
                      </p>
                    </div>
                  </div>

                  {canPreviewInline(archivo) && (
                    <div className="border-t border-cnt-border bg-black/30">
                      {archivo.mimeType.startsWith('image/') ? (
                        <a
                          href={archivoUrl(archivo)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir imagen"
                        >
                          <img
                            src={archivoUrl(archivo)}
                            alt={archivo.originalName}
                            className="h-56 w-full object-contain bg-black/40"
                          />
                        </a>
                      ) : archivo.mimeType.startsWith('video/') ? (
                        <video
                          controls
                          preload="metadata"
                          className="h-56 w-full bg-black"
                        >
                          <source src={archivoUrl(archivo)} type={archivo.mimeType} />
                          Tu navegador no puede reproducir este video.
                        </video>
                      ) : (
                        <iframe
                          src={archivoUrl(archivo)}
                          title={archivo.originalName}
                          className="h-56 w-full bg-white"
                        />
                      )}
                    </div>
                  )}

                  <div className="p-3 border-t border-cnt-border flex flex-wrap gap-2">
                    <a
                      href={archivoUrl(archivo)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg border border-cnt-border text-xs text-gray-300 hover:text-white hover:border-cnt-red"
                    >
                      Ver
                    </a>

                    <a
                      href={archivoDownloadUrl(archivo)}
                      className="px-3 py-1.5 rounded-lg border border-cnt-border text-xs text-gray-300 hover:text-white hover:border-cnt-red"
                    >
                      Descargar
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    )}

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">¿Tienes dudas?</p>
          <div className="text-white px-1 py-1 text-sm">
            Contáctanos a través de nuestro WhatsApp: <a href="https://wa.me/3781495047" target="_blank" rel="noopener noreferrer" className="text-cnt-red hover:underline">378 149 5047</a>
          </div>
        </div>

        <button
          type="button"
          onClick={() => router.push('/formularios')}
          className="cursor-pointer mt-2 w-full bg-cnt-red border border-cnt-border hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all"
        >
          Volver a Mis Formularios
        </button>
      </div>
    </div>
  );
}