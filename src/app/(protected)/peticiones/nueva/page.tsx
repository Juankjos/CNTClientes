// src/app/(protected)/peticiones/nueva/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { apiPath } from '@/lib/api-path';
import Swal from 'sweetalert2';

type AddressOption = {
    slot: 1 | 2 | 3;
    label: string;
    value: string;
};

export default function NuevaPeticionPage() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const pagoId = Number(searchParams.get('pago_id'));
    const catalogoId = Number(searchParams.get('catalogo_id'));

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [profile, setProfile] = useState<any>(null);

    const [motivo, setMotivo] = useState('');
    const [descripcion, setDescripcion] = useState('');
    const [usarDomicilio, setUsarDomicilio] = useState(false);
    const [domicilioSlot, setDomicilioSlot] = useState<string>('');
    const [fechaDeseada, setFechaDeseada] = useState('');

    useEffect(() => {
        fetch(apiPath('/api/users/profile'))
            .then((r) => r.json())
            .then((d) => {
                setProfile(d);
                setLoading(false);
            });
    }, []);

    const domicilios = useMemo<AddressOption[]>(() => {
        if (!profile) return [];

        return [1, 2, 3]
            .map((slot) => ({
                slot: slot as 1 | 2 | 3,
                label: `Domicilio ${slot}`,
                value: profile[`domicilio_${slot}`],
            }))
        .filter((d) => Boolean(d.value));
    }, [profile]);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (!motivo.trim()) {
            await Swal.fire('Falta información', 'Debes escribir el motivo.', 'warning');
            return;
        }

        if (!descripcion.trim()) {
            await Swal.fire('Falta información', 'Debes escribir la descripción.', 'warning');
            return;
        }

        if (usarDomicilio && !domicilioSlot) {
            await Swal.fire('Falta información', 'Debes elegir un domicilio.', 'warning');
            return;
        }

        if (!fechaDeseada) {
            await Swal.fire('Falta información', 'Debes elegir una fecha deseada.', 'warning');
            return;
        }

    try {
        setSending(true);

        const res = await fetch(apiPath('/api/peticiones'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pago_id: pagoId,
                catalogo_id: catalogoId,
                motivo: motivo.trim(),
                descripcion: descripcion.trim(),
                usar_domicilio: usarDomicilio,
                domicilio_slot: usarDomicilio ? Number(domicilioSlot) : null,
                fecha_deseada: fechaDeseada,
            }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            await Swal.fire('Error', data.error ?? 'No se pudo guardar la petición.', 'error');
            return;
        }

        await Swal.fire(
            'Petición registrada',
            'Tu solicitud fue enviada correctamente.',
            'success'
        );

        router.push('/payments/history');
    } finally {
        setSending(false);
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

return (
    <div className="max-w-2xl mx-auto">
        <div className="mb-8">
            <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Formulario</p>
            <h1 className="font-display text-3xl text-white">Nueva petición</h1>
        </div>

        <form
            onSubmit={handleSubmit}
            className="bg-cnt-surface border border-cnt-border rounded-xl p-6 space-y-5"
        >
            <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Escribe brevemente el motivo o la razón para tu Noticia / Reportaje
                </label>
                <textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    rows={3}
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
                    placeholder="Motivo"
                />
            </div>

            <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Escribe una breve descripción de lo que quieres transmitirnos
                </label>
                <textarea
                    value={descripcion}
                    onChange={(e) => setDescripcion(e.target.value)}
                    rows={5}
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red resize-none"
                    placeholder="Descripción"
                />
            </div>

            <div>
                <div className="flex items-center justify-between gap-4 mb-3">
                    <label className="text-xs text-gray-400 uppercase tracking-widest">
                        ¿Elegir ubicación?
                    </label>

                <button
                    type="button"
                    onClick={() => {
                        const next = !usarDomicilio;
                        setUsarDomicilio(next);
                        if (!next) setDomicilioSlot('');
                    }}
                    className={`cursor-pointer px-3 py-2 rounded-lg text-sm border transition-colors ${
                    usarDomicilio
                        ? 'bg-cnt-red border-cnt-red text-white'
                        : 'bg-cnt-dark border-cnt-border text-gray-300'
                    }`}
                >
                    {usarDomicilio ? 'Sí' : 'No'}
                </button>
            </div>

            {usarDomicilio && (
                <select
                    value={domicilioSlot}
                    onChange={(e) => setDomicilioSlot(e.target.value)}
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                >
                <option value="">Selecciona un domicilio</option>
                    {domicilios.map((dom) => (
                        <option key={dom.slot} value={dom.slot}>
                            {dom.label}
                        </option>
                    ))}
                </select>
            )}

            {usarDomicilio && domicilioSlot && (
                <p className="mt-3 text-sm text-gray-400">
                {
                    domicilios.find((d) => String(d.slot) === domicilioSlot)?.value
                }
                </p>
            )}
            </div>

            <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Elegir fecha deseada
                </label>
                <input
                    type="date"
                    value={fechaDeseada}
                    onChange={(e) => setFechaDeseada(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
                />
                </div>

                <button
                    type="submit"
                    disabled={sending}
                    className="cursor-pointer w-full bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all"
                >
                    {sending ? 'Enviando...' : 'Enviar petición'}
                </button>
        </form>
    </div>
    );
}