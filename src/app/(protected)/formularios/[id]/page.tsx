// src/app/(protected)/formularios/[id]/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

type FormularioDetalle = {
  id: number;
  pago_id: number;
  catalogo_id: number;
  motivo: string;
  descripcion: string;
  usar_domicilio: number | boolean;
  domicilio_slot: number | null;
  fecha_deseada: string;
  created_at: string;
  updated_at: string;
  estatus: string;
  referencia: string;
  monto: string | number;
  pagado_at: string | null;
  servicio: string;
  categoria: string;
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
            {item.estatus}
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
          <div className="text-white px-1 py-1 text-sm">
            {item.usar_domicilio && item.domicilio_slot
              ? `Domicilio ${item.domicilio_slot}`
              : 'No aplica'}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Detalle del domicilio</p>
          <div className="text-white px-1 py-1 text-sm whitespace-pre-wrap">
            {String(domicilioTexto || 'No aplica')}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Fecha y hora deseada</p>
          <div className="text-white px-1 py-1 text-sm">
            {formatFechaAmPm(item.fecha_deseada)}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Enviado el</p>
          <div className="text-white px-1 py-1 text-sm">
            {formatFechaAmPm(item.created_at)}
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