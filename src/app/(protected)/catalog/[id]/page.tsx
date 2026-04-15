// src/app/(protected)/catalog/[id]/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';
import Image from 'next/image';

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

  useEffect(() => {
    fetch(apiPath(`/api/catalog/${id}`))
      .then(r => r.ok ? r.json() : null)
      .then(d => { setItem(d); setLoading(false); });
  }, [id]);

  async function handlePay() {
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

      setMsg({
        type: 'ok',
        text: `Pago registrado — Referencia: ${data.referencia}`,
      });

      setTimeout(() => {
        router.push(`/payments/${data.pago_id}`);
      }, 1500);
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
      <Link href="/catalog" className="text-cnt-red hover:underline text-sm">← Volver al catálogo</Link>
    </div>
  );

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
          <span className={`px-2.5 py-1 rounded text-xs uppercase tracking-wider font-semibold ${BADGES[item.categoria] ?? 'bg-gray-800 text-gray-300'}`}>
            {item.categoria}
          </span>
          {/* <span className="text-gray-600 text-xs">
            {new Date(item.fecha_publicacion).toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span> */}
        </div>
        <h1 className="font-display text-3xl text-white mb-3">{item.titulo}</h1>
        {item.descripcion && (
          <p className="text-gray-400 leading-relaxed">{item.descripcion}</p>
        )}
      </div>

      {/* Panel de compra */}
      <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-1">Precio</p>
            <p className="font-display text-3xl text-white">
              {item.precio === 0 || item.precio === '0.00'
                ? <span className="text-green-400">Gratuito</span>
                : `$${Number(item.precio).toFixed(2)} MXN`}
            </p>
          </div>
          {item.ya_pagado > 0 && (
            <span className="px-3 py-1.5 bg-green-900/50 text-green-400 border border-green-800 rounded-lg text-sm">
              ✓ Ya adquirido
            </span>
          )}
        </div>

        {item.ya_pagado > 0 ? (
          <div>
            {item.archivo && (
              <a href={item.archivo} target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 bg-green-800 hover:bg-green-700 text-white py-3 rounded-lg text-sm font-semibold transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Descargar contenido
              </a>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Método de pago */}
            {/* {Number(item.precio) > 0 && (
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Método de pago</p>
                <div className="grid grid-cols-3 gap-2">
                  {['transferencia','tarjeta'].map(m => (
                    <button key={m} onClick={() => setMethod(m)}
                      className={`py-2.5 px-3 rounded-lg border text-xs capitalize transition-colors ${
                        method === m
                          ? 'border-cnt-red bg-red-950/30 text-white'
                          : 'border-cnt-border text-gray-500 hover:text-white hover:border-gray-500'
                      }`}>
                      {m === 'transferencia' ? '🏦 Transferencia' : '💳 Tarjeta'}
                    </button>
                  ))}
                </div>
              </div>
            )} */}

            {msg && (
              <div className={`px-4 py-3 rounded-lg text-sm ${
                msg.type === 'ok' ? 'bg-green-950 text-green-300 border border-green-800' : 'bg-red-950 text-red-300 border border-cnt-red'
              }`}>
                {msg.text}
              </div>
            )}

            <button onClick={handlePay} disabled={paying}
              className="cursor-pointer w-full bg-red-700 hover:bg-red-800 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2">
              {paying ? (
                <><svg className="bg-cnt-red hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed cursor-pointer text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                </svg>Procesando...</>
              ) : Number(item.precio) === 0 ? 'Acceder gratis' : `Pagar $${Number(item.precio).toFixed(2)} MXN`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
