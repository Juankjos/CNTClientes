// src/app/(protected)/catalog/[id]/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';
import Image from 'next/image';
import { formatMoney } from '@/lib/formatters';

const BADGES: Record<string, string> = {
  reportaje:  'bg-blue-900 text-blue-300',
  noticia:    'bg-green-900 text-green-300',
  entrevista: 'bg-purple-900 text-purple-300',
  especial:   'bg-yellow-900 text-yellow-300',
};

export default function CatalogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const [item, setItem]     = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying]   = useState(false);
  const [method, setMethod]   = useState('transferencia');
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const BADGES: Record<string, string> = {
    reportaje:  'bg-blue-900 text-blue-300',
    noticia:    'bg-green-900 text-green-300',
    entrevista: 'bg-purple-900 text-purple-300',
    especial:   'bg-yellow-900 text-yellow-300',
  };

  function normalizeCategoria(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
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

  function formatFechaSolo(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);

    const isValidDate =
      date.getFullYear() === year &&
      date.getMonth() === month - 1 &&
      date.getDate() === day;

    if (!isValidDate) return value;

    const parts = new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).formatToParts(date);

    const dia = parts.find((part) => part.type === 'day')?.value;
    const mes = parts.find((part) => part.type === 'month')?.value;
    const anio = parts.find((part) => part.type === 'year')?.value;

    if (!dia || !mes || !anio) return value;

    const mesCapitalizado = mes.charAt(0).toUpperCase() + mes.slice(1);

    return `${dia} de ${mesCapitalizado} del ${anio}`;
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

  useEffect(() => {
    fetch(apiPath(`/api/catalog/${id}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { setItem(d); setLoading(false); });
  }, [id]);

  async function handlePay() {
    const result = await Swal.fire({
      title: '¿Continuar?',
      text: 'Estás a punto de proceder al pago de este producto. ¿Continuar?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, continuar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      background: '#111827',
      color: '#ffffff',
      confirmButtonColor: '#b91c1c',
      cancelButtonColor: '#374151',
    });

    if (!result.isConfirmed) return;

    try {
      setPaying(true);
      setMsg(null);

      const res = await fetch(apiPath('/api/payments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogo_id: Number(id),
          metodo_pago: method,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMsg({
          type: 'err',
          text: data?.error ?? `Error ${res.status} procesando el pago`,
        });
        return;
      }

      const categoria = normalizeCategoria(item?.categoria);
      const requierePeticion =
        categoria === 'noticia' ||
        categoria === 'reportaje' ||
        categoria === 'entrevista' ||
        categoria === 'especial';

      await Swal.fire({
        title: 'Pago registrado',
        text: `Referencia: ${data.referencia}`,
        icon: 'success',
        background: '#111827',
        color: '#ffffff',
        confirmButtonColor: '#16a34a',
      });

      if (requierePeticion) {
        router.push(`/peticiones/nueva?pago_id=${data.pago_id}&catalogo_id=${id}`);
        return;
      }

      router.push(`/payments/${data.pago_id}`);
    } catch (error) {
      setMsg({
        type: 'err',
        text: error instanceof Error ? error.message : 'Error inesperado',
      });
    } finally {
      setPaying(false);
    }
  }

  if (loading) return (
    <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
      <div className="h-64 bg-cnt-surface rounded-xl" />
      <div className="h-8 bg-cnt-surface rounded w-2/3" />
      <div className="h-4 bg-cnt-surface rounded w-full" />
    </div>
  );

  if (!item) return (
    <div className="text-center py-24">
      <p className="text-5xl mb-4">🔍</p>
      <p className="text-gray-400 mb-4">Contenido no encontrado</p>
      <Link href="/catalog" className="text-cnt-red hover:underline text-sm">
        ← Volver al catálogo
      </Link>
    </div>
  );

  const categoria = normalizeCategoria(item.categoria);
  const usaRangoFechas = toBooleanDb(item.usa_rango_fechas);
  const rangoDiasTexto = formatDias(item.rango_dias);

  const bloqueaSabado = toBooleanDb(item.bloquea_sabado);
  const bloqueaDomingo = toBooleanDb(item.bloquea_domingo);
  const bloqueaDiasFestivos = toBooleanDb(item.bloquea_dias_festivos);
  const bloqueaFechasPersonalizadas = toBooleanDb(item.bloquea_fechas_personalizadas);
  const fechasBloqueadas = parseFechasBloqueadas(item.fechas_bloqueadas_json);

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
    usaRangoFechas &&
    Boolean(rangoDiasTexto);

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/catalog" className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
        Volver al catálogo
      </Link>

      {/* Imagen */}
      {item.imagen && (
        <div className="relative h-64 sm:h-80 rounded-xl overflow-hidden mb-6 bg-cnt-surface">
          <Image
            src={item.imagen}
            alt={item.titulo}
            fill
            sizes="(max-width: 640px) 100vw, 768px"
            className="object-cover"
          />
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <span
            className={`px-2.5 py-1 rounded text-xs uppercase tracking-wider font-semibold ${
              BADGES[categoria] ?? 'bg-gray-800 text-gray-300'
            }`}
          >
            {categoria}
          </span>
          {/* <span className="text-gray-600 text-xs">
            {new Date(item.fecha_publicacion).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span> */}
        </div>
        <h1 className="font-display text-3xl text-white mb-3">{item.titulo}</h1>
        {item.descripcion && (
          <p className="text-gray-400 leading-relaxed">{item.descripcion}</p>
        )}
        {itemTieneRango && (
          <div className="mt-5 rounded-xl border border-blue-900/60 bg-blue-950/20 p-4">
            <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">
              Rango de fechas incluido
            </p>

            <p className="text-white font-semibold">
              Cubre {rangoDiasTexto}.
            </p>

            <p className="text-sm text-gray-400 mt-1">
              Al llenar el formulario, elegirás una fecha inicial y el sistema calculará automáticamente la fecha final.
            </p>

            {tieneRestriccionesRango && (
              <div className="mt-4 rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-4 py-3">
                <p className="text-xs text-yellow-300 uppercase tracking-widest mb-2">
                  El paquete omite las siguientes fechas:
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
                        Se omiten las siguientes fechas:
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {fechasBloqueadas.map((fecha) => (
                          <span
                            key={fecha}
                            className="rounded-full border border-yellow-800/70 bg-cnt-dark px-3 py-1 text-xs text-yellow-200"
                          >
                            {formatFechaSolo(fecha)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-3">
                  Las fechas no incluidas se omiten y el rango se extiende hasta completar los días aplicables.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Panel de compra */}
      <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Precio</p>
            <p className="font-display text-3xl text-white">
              {Number(item.precio) === 0
                ? <span className="text-green-400">Gratuito</span>
                : `$${formatMoney(item.precio)} MXN`}
            </p>
          </div>

          {itemTieneRango && (
              <div className="mb-4 rounded-lg border border-yellow-800/60 bg-yellow-950/30 px-4 py-3">
                <p className="text-sm text-white">
                  Total de días aplicables: <span className="font-semibold">{rangoDiasTexto}</span>
                </p>
              </div>
          )}

          {item.ya_pagado > 0 && (
            <span className="px-3 py-1.5 bg-green-900/50 text-green-400 border border-green-800 rounded-lg text-sm">
              ✓ Ya adquirido
            </span>
          )}
        </div>

        <div className="space-y-4">
          {item.ya_pagado > 0 && item.archivo && (
            <a
              href={item.archivo}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Descargar contenido
            </a>
          )}

          {msg && (
            <div
              className={`px-4 py-3 rounded-lg text-sm ${
                msg.type === 'ok'
                  ? 'bg-green-950 text-green-300 border border-green-800'
                  : 'bg-red-950 text-red-300 border border-cnt-red'
              }`}
            >
              {msg.text}
            </div>
          )}

          <button
            onClick={handlePay}
            disabled={paying}
            className="cursor-pointer w-full bg-red-700 hover:bg-red-800 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2"
          >
            {paying ? (
              'Procesando...'
            ) : item.ya_pagado > 0 ? (
              Number(item.precio) === 0
                ? 'Acceder nuevamente'
                : `Comprar nuevamente por $${formatMoney(item.precio)} MXN`
            ) : Number(item.precio) === 0 ? (
              'Obtener e ingresar a Formulario'
            ) : (
              `Ir al pago $${formatMoney(item.precio)} MXN`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
