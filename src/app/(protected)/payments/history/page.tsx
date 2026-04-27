// src/app/(protected)/payments/history/page.tsx
'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPath } from '@/lib/api-path';
import Image from 'next/image';

const ESTATUS_STYLE: Record<string, string> = {
  pendiente: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  pagado: 'bg-green-900/50 text-green-300 border-green-800',
  cancelado: 'bg-gray-800 text-gray-400 border-gray-700',
  reembolsado: 'bg-blue-900/50 text-blue-300 border-blue-800',
};

export default function PaymentHistoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') ?? '1', 10);

  const [data, setData] = useState<{ pagos: any[]; pagination: any }>({
    pagos: [],
    pagination: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError('');

        const res = await fetch(apiPath(`/api/payments?page=${page}`));
        const body = await res.json().catch(() => null);

        if (res.status === 403) {
          router.replace('/admin');
          return;
        }

        if (!res.ok) {
          throw new Error(body?.detail || body?.error || `HTTP ${res.status}`);
        }

        if (!cancelled) {
          setData(body);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar el historial');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [page]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-cnt-red font-mono text-xs tracking-widest uppercase mb-1">Mi cuenta</p>
        <h1 className="font-display text-3xl text-white">Historial de Pagos</h1>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-20 bg-cnt-surface rounded-xl animate-pulse border border-cnt-border"
            />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-24 bg-cnt-surface rounded-xl border border-cnt-border">
          <p className="text-5xl mb-4">⚠️</p>
          <p className="text-red-400 mb-2">No se pudo cargar el historial</p>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      ) : data.pagos.length === 0 ? (
        <div className="text-center py-24 bg-cnt-surface rounded-xl border border-cnt-border">
          <p className="text-5xl mb-4">🧾</p>
          <p className="text-gray-400 mb-2">Aún no tienes pagos registrados</p>
          <Link href="/catalog" className="text-cnt-red text-sm hover:underline">
            Explorar catálogo →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {data.pagos.map((pago: any) => (
            <Link
              key={pago.id}
              href={`/payments/${pago.id}`}
              className="group flex items-center gap-4 bg-cnt-surface border border-cnt-border hover:border-gray-600 rounded-xl p-4 transition-all"
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-cnt-dark shrink-0">
                {pago.imagen ? (
                  <Image
                    src={pago.imagen}
                    alt={pago.titulo}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl text-gray-600">
                    📰
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{pago.titulo}</p>
                <p className="text-gray-500 text-xs capitalize">
                  {pago.categoria} · {pago.metodo_pago}
                </p>
                <p className="text-gray-600 text-xs mt-0.5">{pago.referencia}</p>
              </div>

              <div className="text-right shrink-0">
                <p className="text-white font-semibold text-sm">
                  ${Number(pago.monto).toFixed(2)}
                </p>
                <span
                  className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${
                    ESTATUS_STYLE[pago.estatus] ?? 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {pago.estatus}
                </span>
                <p className="text-gray-600 text-xs mt-1">
                  {new Date(pago.created_at).toLocaleDateString('es-MX', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>
              </div>

              <svg
                className="w-4 h-4 text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>
      )}

      {data.pagination?.pages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <button
            disabled={page <= 1}
            onClick={() => router.push(`?page=${page - 1}`)}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
          >
            ← Anterior
          </button>
          <span className="px-4 py-2 text-gray-500 text-sm">
            {page} / {data.pagination.pages}
          </span>
          <button
            disabled={page >= data.pagination.pages}
            onClick={() => router.push(`?page=${page + 1}`)}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
