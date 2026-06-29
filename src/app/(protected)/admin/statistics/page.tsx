'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';

type StatsRow = {
    titulo: string;
    categoria: string;
    monto_pagado: number;
    pagos_count: number;
    total_ingresos: number;
};

type StatsResponse = {
    month: {
        year: number;
        month: number;
        start: string;
        end: string;
    };
    summary: {
        pagos_count: number;
        total_ingresos: number;
        grupos_count: number;
    };
    rows: StatsRow[];
};

const MONTHS = [
    { value: 1, label: 'Enero' },
    { value: 2, label: 'Febrero' },
    { value: 3, label: 'Marzo' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Mayo' },
    { value: 6, label: 'Junio' },
    { value: 7, label: 'Julio' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Septiembre' },
    { value: 10, label: 'Octubre' },
    { value: 11, label: 'Noviembre' },
    { value: 12, label: 'Diciembre' },
];

function formatMoney(value: number) {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
    }).format(Number(value || 0));
}

function formatCategoria(value: string) {
    if (!value) return 'Sin categoría';

    return value
        .replaceAll('_', ' ')
        .replace(/^\w/, (letter) => letter.toUpperCase());
}

export default function AdminStatisticsPage() {
    const now = new Date();

    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [data, setData] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');

    const years = useMemo(() => {
        const currentYear = new Date().getFullYear();

        return Array.from({ length: 7 }, (_, index) => currentYear - index);
    }, []);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            setMsg('');

            const params = new URLSearchParams({
                year: String(year),
                month: String(month),
            });

            const res = await fetch(apiPath(`/api/admin/statistics?${params.toString()}`));
            const json = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
            }

            setData(json);
        } catch (error) {
            setData(null);
            setMsg(error instanceof Error ? error.message : 'No se pudieron cargar las estadísticas');
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => {
        void fetchStats();
    }, [fetchStats]);

    return (
        <div>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
                        Panel de administración
                    </p>
                    <h1 className="font-display text-3xl text-white">Estadísticas</h1>
                    <p className="mt-2 text-sm text-gray-500">
                        Ingresos agrupados por snapshot del catálogo y monto pagado.
                    </p>
                </div>

                <Link
                href="/admin"
                className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
                >
                Volver al panel
                </Link>
            </div>

            <div className="mb-6 rounded-xl border border-cnt-border bg-cnt-surface p-5">
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Mes
                        </label>
                        <select
                        value={month}
                        onChange={(e) => setMonth(Number(e.target.value))}
                        className="bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red"
                        >
                        {MONTHS.map((item) => (
                            <option key={item.value} value={item.value}>
                            {item.label}
                            </option>
                        ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Año
                        </label>
                        <select
                        value={year}
                        onChange={(e) => setYear(Number(e.target.value))}
                        className="bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red"
                        >
                        {years.map((item) => (
                            <option key={item} value={item}>
                            {item}
                            </option>
                        ))}
                        </select>
                    </div>

                    <button
                        type="button"
                        onClick={fetchStats}
                        className="cursor-pointer px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors"
                    >
                        Actualizar
                    </button>
                </div>
            </div>

            {msg && (
                <div className="mb-6 rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300">
                    {msg}
                </div>
            )}

            <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Ingresos pagados
                    </p>
                    <p className="text-2xl font-semibold text-white">
                        {loading ? '—' : formatMoney(data?.summary.total_ingresos ?? 0)}
                    </p>
                </div>

                <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Pagos pagados
                    </p>
                    <p className="text-2xl font-semibold text-white">
                        {loading ? '—' : data?.summary.pagos_count ?? 0}
                    </p>
                </div>

                <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Grupos
                    </p>
                    <p className="text-2xl font-semibold text-white">
                        {loading ? '—' : data?.summary.grupos_count ?? 0}
                    </p>
                </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-cnt-border">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b border-cnt-border bg-cnt-surface">
                        {['Contenido', 'Categoría', 'Monto pagado', 'Pagos', 'Total ingresos'].map((heading) => (
                            <th
                            key={heading}
                            className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest"
                            >
                            {heading}
                            </th>
                        ))}
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-cnt-border">
                        {loading ? (
                        [...Array(5)].map((_, index) => (
                            <tr key={index} className="bg-cnt-dark">
                            {[...Array(5)].map((__, columnIndex) => (
                                <td key={columnIndex} className="px-4 py-3">
                                <div className="h-4 bg-cnt-surface rounded animate-pulse" />
                                </td>
                            ))}
                            </tr>
                        ))
                        ) : !data || data.rows.length === 0 ? (
                        <tr className="bg-cnt-dark">
                            <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                            No hay pagos pagados para este mes.
                            </td>
                        </tr>
                        ) : (
                        data.rows.map((row) => (
                            <tr
                            key={`${row.titulo}-${row.categoria}-${row.monto_pagado}`}
                            className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors"
                            >
                            <td className="px-4 py-3 text-white">
                                {row.titulo}
                            </td>

                            <td className="px-4 py-3">
                                <span className="px-2 py-0.5 rounded border border-cnt-border bg-cnt-surface text-gray-300 text-[10px] uppercase tracking-wider">
                                {formatCategoria(row.categoria)}
                                </span>
                            </td>

                            <td className="px-4 py-3 text-gray-300 font-medium">
                                {formatMoney(row.monto_pagado)}
                            </td>

                            <td className="px-4 py-3 text-gray-400">
                                {row.pagos_count}
                            </td>

                            <td className="px-4 py-3 text-white font-semibold">
                                {formatMoney(row.total_ingresos)}
                            </td>
                            </tr>
                        ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}