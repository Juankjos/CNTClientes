// src/app/(protected)/formularios/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

type FormularioItem = {
  pago_id: number;
  catalogo_id: number;
  servicio: string;
  estatus: 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
  peticion_id: number | null;
  tiene_peticion: boolean;
};

export default function MisFormulariosPage() {
  const router = useRouter();
  const [items, setItems] = useState<FormularioItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiPath('/api/formularios'))
      .then((r) => r.json())
      .then((data) => {
        setItems(data.items ?? []);
        setLoading(false);
      })
      .catch(() => {
        setItems([]);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-cnt-surface rounded w-1/3" />
        <div className="h-40 bg-cnt-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
          Cliente
        </p>
        <h1 className="font-display text-3xl text-white">Mis Formularios</h1>
      </div>

      <div className="space-y-4">
        {items.length === 0 && (
          <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 text-gray-400">
            No tienes formularios disponibles.
          </div>
        )}

        {items.map((item) => {
          const enabled = item.estatus === 'pagado';
          const hasPeticion = item.tiene_peticion;

          return (
            <div
              key={item.pago_id}
              className={`bg-cnt-surface border rounded-xl p-5 ${
                enabled ? 'border-cnt-border' : 'border-gray-800 opacity-60'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-white font-semibold">{item.servicio}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Estatus de pago: {item.estatus}
                  </p>

                  {hasPeticion && (
                    <p className="text-xs text-green-400 mt-2">
                      Ya enviaste este formulario.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!enabled}
                  onClick={() => {
                    if (hasPeticion) {
                      router.push(`/formularios/${item.pago_id}`);
                      return;
                    }

                    router.push(
                      `/peticiones/nueva?pago_id=${item.pago_id}&catalogo_id=${item.catalogo_id}`
                    );
                  }}
                  className={`cursor-pointer disabled:cursor-not-allowed px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                    hasPeticion
                      ? 'bg-cnt-red border-cnt-border text-white disabled:bg-gray-700'
                      : 'bg-blue-950 border-blue-800 text-white hover:bg-blue-900 disabled:bg-gray-700 disabled:border-gray-700 disabled:text-gray-300'
                  }`}
                >
                  {hasPeticion ? 'Ver Formulario' : 'Rellenar Formulario'}
                </button>
              </div>

              {!enabled && (
                <p className="text-xs text-gray-500 mt-3">
                  Este formulario estará disponible cuando el pago esté aprobado.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}