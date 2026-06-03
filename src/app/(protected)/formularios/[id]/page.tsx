// src/app/(protected)/formularios/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

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

export default function VerFormularioPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const pagoId = Number(params.id);

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<FormularioDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiPath(`/api/peticiones/${pagoId}`));
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(data.error ?? 'No se pudo cargar el formulario.');
          setLoading(false);
          return;
        }

        setItem(data);
        setLoading(false);
      } catch {
        setError('No se pudo cargar el formulario.');
        setLoading(false);
      }
    }

    if (!Number.isInteger(pagoId) || pagoId <= 0) {
      setError('Pago inválido.');
      setLoading(false);
      return;
    }

    load();
  }, [pagoId]);

  const domicilioTexto = useMemo(() => {
    if (!item) return 'No aplica';
    if (!item.usar_domicilio || !item.domicilio_slot) return 'No aplica';

    const slot = item.domicilio_slot;
    return item[`domicilio_${slot}` as keyof FormularioDetalle] ?? 'No disponible';
  }, [item]);

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

        {Number(item.rango_dias) > 0 && (
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
              Total de días
            </p>
            <div className="text-white px-1 py-1 text-sm">
              {Number(item.rango_dias)} día{Number(item.rango_dias) === 1 ? '' : 's'}
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