// src/app/(protected)/formularios/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

type PeticionStatus = 'pendiente' | 'aceptada' | 'rechazada';

type FormularioItem = {
  pago_id: number;
  catalogo_id: number;
  servicio: string;
  estatus: 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
  peticion_id: number | null;
  peticion_estatus: PeticionStatus | null;
  peticion_created_at: string | null;
  peticion_motivo: string | null;
  tiene_peticion: boolean;
};

const FORMULARIO_STATUS_FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aceptada', label: 'Aceptadas' },
  { value: 'rechazada', label: 'Rechazadas' },
] as const;

type FormularioStatusFiltro = (typeof FORMULARIO_STATUS_FILTERS)[number]['value'];

function formatFechaEnviado(value: unknown) {
  if (!value) return '—';

  const date = new Date(String(value));

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hour12: true,
  }).format(date);
}

export default function MisFormulariosPage() {
  const router = useRouter();
  const [items, setItems] = useState<FormularioItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [formularioStatus, setFormularioStatus] = useState<FormularioStatusFiltro>('');

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

  const getFormularioStatus = (item: FormularioItem): PeticionStatus => {
    if (!item.tiene_peticion) return 'pendiente';

    return item.peticion_estatus ?? 'pendiente';
  };

  const filteredItems = items.filter((item) => {
    if (!formularioStatus) return true;

    return getFormularioStatus(item) === formularioStatus;
  });

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

      <div className="mb-5 flex flex-wrap gap-2 items-center">
        {FORMULARIO_STATUS_FILTERS.map((item) => (
          <button
            key={item.value || 'all'}
            onClick={() => setFormularioStatus(item.value)}
            className={`cursor-pointer px-3 py-1.5 rounded-lg text-xs transition-colors border ${
              formularioStatus === item.value
                ? 'border-cnt-red bg-red-950/30 text-white'
                : 'border-cnt-border text-gray-500 hover:text-white'
            }`}
          >
            {item.label}
          </button>
        ))}

        <span className="px-3 py-1.5 text-gray-600 text-xs">
          {filteredItems.length} registros
        </span>
      </div>

      <div className="space-y-4">
        {filteredItems.length === 0 && (
          <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 text-gray-400">
            No tienes formularios disponibles.
          </div>
        )}

        {filteredItems.map((item) => {
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

                  {hasPeticion && item.peticion_motivo && (
                    <p className="text-sm text-gray-300 mt-1">
                      Motivo: {item.peticion_motivo}
                    </p>
                  )}

                  <p className="text-sm text-gray-500 mt-1">
                    Estatus de Pago: {item.estatus}
                  </p>

                  {hasPeticion && (
                    <>

                      <p className="text-sm text-gray-500 mt-1">
                        Estatus de proceso de Petición: {item.peticion_estatus}
                      </p>

                      <p className="text-xs text-gray-500 mt-1">
                        Fecha de envío de formulario: {formatFechaEnviado(item.peticion_created_at)}
                      </p>

                      <p className="text-xs text-green-400 mt-2">
                        Ya enviaste este formulario.
                      </p>
                    </>
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