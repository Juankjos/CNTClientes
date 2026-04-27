// src/app/(protected)/peticiones/page.tsx
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-path';

const STATUS_LABEL: Record<string, string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
};

const STATUS_STYLE: Record<string, string> = {
  pendiente: 'bg-yellow-900/50 text-yellow-300 border-yellow-800',
  aceptada: 'bg-green-900/50 text-green-300 border-green-800',
  rechazada: 'bg-red-950 text-red-300 border-cnt-red',
};

export default function MisPeticionesPage() {
  const [peticiones, setPeticiones] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [estatus, setEstatus] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const fetchPeticiones = useCallback(async () => {
    setLoading(true);

    const params = new URLSearchParams({ page: String(page) });
    if (estatus) params.set('estatus', estatus);

    const res = await fetch(apiPath(`/api/peticiones?${params.toString()}`));
    const data = await res.json().catch(() => ({}));

    setPeticiones(data.peticiones ?? []);
    setTotal(data.pagination?.total ?? 0);
    setLoading(false);
  }, [page, estatus]);

  useEffect(() => {
    fetchPeticiones();
  }, [fetchPeticiones]);

  return (
    <div>
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Solicitudes</p>
        <h1 className="font-display text-3xl text-white">Mis Peticiones</h1>
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {[
          { value: '', label: 'Todas' },
          { value: 'pendiente', label: 'Pendientes' },
          { value: 'aceptada', label: 'Aceptadas' },
          { value: 'rechazada', label: 'Rechazadas' },
        ].map((item) => (
          <button
            key={item.value || 'all'}
            onClick={() => {
              setEstatus(item.value);
              setPage(1);
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs transition-colors border ${
              estatus === item.value
                ? 'border-cnt-red bg-red-950/30 text-white'
                : 'border-cnt-border text-gray-500 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}

        <span className="px-3 py-1.5 text-gray-600 text-xs">{total} registros</span>
      </div>

      <div className="space-y-4">
        {loading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="rounded-xl border border-cnt-border bg-cnt-surface p-5 animate-pulse">
              <div className="h-5 bg-cnt-dark rounded w-1/3 mb-3" />
              <div className="h-4 bg-cnt-dark rounded w-full mb-2" />
              <div className="h-4 bg-cnt-dark rounded w-2/3" />
            </div>
          ))
        ) : peticiones.length === 0 ? (
          <div className="rounded-xl border border-cnt-border bg-cnt-surface p-6 text-gray-500">
            No tienes peticiones registradas.
          </div>
        ) : (
          peticiones.map((p) => (
            <div key={p.id} className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <p className="text-white font-semibold">{p.titulo}</p>
                  <p className="text-gray-500 text-sm mt-1">
                    Categoría: {p.categoria}
                  </p>
                  <p className="text-gray-600 text-xs mt-2">
                    Solicitud creada: {new Date(p.created_at).toLocaleDateString('es-MX')}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded border text-[10px] uppercase tracking-wider ${
                    STATUS_STYLE[p.estatus] ?? 'bg-gray-800 text-gray-400 border-gray-700'
                  }`}>
                    {STATUS_LABEL[p.estatus] ?? p.estatus}
                  </span>

                  <button
                    type="button"
                    onClick={() => setExpandedId((prev) => (prev === p.id ? null : p.id))}
                    className="cursor-pointer px-3 py-2 rounded-lg border border-cnt-border text-white hover:border-cnt-red text-sm transition-colors"
                  >
                    {expandedId === p.id ? 'Ocultar' : 'Ver detalle'}
                  </button>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="mt-5 pt-5 border-t border-cnt-border space-y-4">
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Motivo
                    </p>
                    <p className="text-white text-sm">{p.motivo}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Descripción
                    </p>
                    <p className="text-white text-sm whitespace-pre-wrap">{p.descripcion}</p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Ubicación para la actividad
                    </p>
                    <p className="text-white text-sm">
                      {p.usar_domicilio ? p.domicilio_texto : 'Sin ubicación'}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Fecha deseada
                    </p>
                    <p className="text-white text-sm">
                      {new Date(p.fecha_deseada).toLocaleDateString('es-MX')}
                    </p>
                  </div>

                  {p.comentario_admin && (
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Comentario del administrador
                      </p>
                      <p className="text-yellow-300 text-sm whitespace-pre-wrap">{p.comentario_admin}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {total > 10 && (
        <div className="flex justify-center gap-2 mt-6">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
          >
            ← Anterior
          </button>
          <button
            disabled={page * 10 >= total}
            onClick={() => setPage((p) => p + 1)}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}