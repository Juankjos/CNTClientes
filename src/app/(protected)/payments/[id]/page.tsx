'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';
import Image from 'next/image';

const ESTATUS_STYLE: Record<string, string> = {
  pendiente:   'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  pagado:      'bg-green-900/50 text-green-300 border-green-800',
  cancelado:   'bg-gray-800 text-gray-400 border-gray-700',
  reembolsado: 'bg-blue-900/50 text-blue-300 border-blue-800',
};

const ESTATUS_ICON: Record<string, string> = {
  pendiente:   '⏳',
  pagado:      '✅',
  cancelado:   '❌',
  reembolsado: '↩️',
};

export default function PaymentDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const [pago, setPago]     = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiPath(`/api/payments/${id}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { setPago(d); setLoading(false); });
  }, [id]);

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 bg-cnt-surface rounded w-1/2" />
      <div className="h-48 bg-cnt-surface rounded-xl" />
      <div className="h-32 bg-cnt-surface rounded-xl" />
    </div>
  );

  if (!pago) return (
    <div className="text-center py-24">
      <p className="text-5xl mb-4">🔍</p>
      <p className="text-gray-400 mb-4">Pago no encontrado</p>
      <Link href="/payments/history" className="text-cnt-red hover:underline text-sm">
        ← Ver historial
      </Link>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <Link href="/payments/history"
        className="inline-flex items-center gap-2 text-gray-500 hover:text-white text-sm mb-6 transition-colors">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
        Historial de pagos
      </Link>

      {/* Card principal */}
      <div className="bg-cnt-surface border border-cnt-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-5 border-b border-cnt-border flex items-start justify-between gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Referencia de pago</p>
            <p className="font-mono text-cnt-red text-sm">{pago.referencia}</p>
          </div>
          <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm ${ESTATUS_STYLE[pago.estatus] ?? 'bg-gray-800 text-gray-400'}`}>
            {ESTATUS_ICON[pago.estatus]} {pago.estatus.charAt(0).toUpperCase() + pago.estatus.slice(1)}
          </span>
        </div>

        {/* Contenido */}
        <div className="p-6 space-y-6">
          {/* Info del ítem */}
          <div className="flex gap-4">
            {pago.imagen && (
              <div className="w-20 h-20 rounded-lg overflow-hidden bg-cnt-dark shrink-0">
                <Image
                  src={pago.imagen}
                  alt={pago.titulo}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Contenido</p>
              <p className="text-white font-semibold">{pago.titulo}</p>
              <p className="text-gray-500 text-sm capitalize">{pago.categoria}</p>
            </div>
          </div>

          {/* Detalles */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-cnt-dark rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Monto</p>
              <p className="text-white font-semibold text-lg">${Number(pago.monto).toFixed(2)} <span className="text-gray-500 text-sm font-normal">MXN</span></p>
            </div>
            <div className="bg-cnt-dark rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Método</p>
              <p className="text-white font-semibold capitalize">{pago.metodo_pago}</p>
            </div>
            <div className="bg-cnt-dark rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Fecha</p>
              <p className="text-white text-sm">
                {new Date(pago.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="bg-cnt-dark rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Cliente</p>
              <p className="text-white text-sm">{pago.nombre ?? '—'} {pago.apellidos ?? ''}</p>
            </div>
          </div>

          {/* Respuesta / comprobante */}
          {pago.respuesta && (
            <div className="bg-cnt-dark rounded-lg p-4">
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Respuesta del sistema</p>
              <p className="text-gray-300 text-sm">{pago.respuesta}</p>
            </div>
          )}

          {/* Acceso al contenido si está pagado */}
          {pago.estatus === 'pagado' && pago.archivo && (
            <a href={pago.archivo} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full bg-green-800 hover:bg-green-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
              </svg>
              Descargar contenido
            </a>
          )}

          {pago.estatus === 'pendiente' && (
            <div className="bg-yellow-950/30 border border-yellow-800/50 rounded-lg p-4 text-sm text-yellow-300">
              ⏳ Tu pago está pendiente de confirmación. Te notificaremos cuando sea verificado por nuestro equipo.
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 text-center">
        <Link href="/catalog" className="text-gray-500 hover:text-white text-sm transition-colors">
          ← Volver al catálogo
        </Link>
      </div>
    </div>
  );
}
