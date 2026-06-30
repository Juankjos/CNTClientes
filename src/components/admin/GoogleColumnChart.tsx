//src/components/admin/GoogleColumnChart.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

declare global {
    interface Window {
        google?: any;
        __cntGoogleChartsLoading?: Promise<void>;
    }
}

type GoogleColumnChartProps = {
    title: string;
    data: Array<Array<string | number>>;
    height?: number;
    vAxisTitle?: string;
    hAxisTitle?: string;
    stacked?: boolean;
    currencyColumns?: number[];
    onImageReady?: (imageUri: string) => void;
};

function loadGoogleCharts() {
    if (typeof window === 'undefined') {
        return Promise.resolve();
    }

    if (window.google?.charts) {
        return new Promise<void>((resolve) => {
        window.google.charts.load('current', { packages: ['corechart'] });
        window.google.charts.setOnLoadCallback(() => resolve());
        });
    }

    if (window.__cntGoogleChartsLoading) {
        return window.__cntGoogleChartsLoading;
    }

    window.__cntGoogleChartsLoading = new Promise<void>((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://www.gstatic.com/charts/loader.js';
        script.async = true;

        script.onload = () => {
        window.google.charts.load('current', { packages: ['corechart'] });
        window.google.charts.setOnLoadCallback(() => resolve());
        };

        script.onerror = () => {
        reject(new Error('No se pudo cargar Google Charts'));
        };

        document.head.appendChild(script);
    });

    return window.__cntGoogleChartsLoading;
}

export default function GoogleColumnChart({
    title,
    data,
    height = 360,
    vAxisTitle,
    hAxisTitle,
    stacked = false,
    currencyColumns = [],
    onImageReady,
}: GoogleColumnChartProps) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [error, setError] = useState('');

    const normalizedData = useMemo(() => data, [data]);

    const onImageReadyRef = useRef(onImageReady);

    useEffect(() => {
        onImageReadyRef.current = onImageReady;
    }, [onImageReady]);

    useEffect(() => {
        let cancelled = false;

        async function draw() {
            try {
                setError('');

                if (!containerRef.current) return;
                if (normalizedData.length < 2) return;

                await loadGoogleCharts();

                if (cancelled || !containerRef.current || !window.google?.visualization) {
                    return;
                }

                const chartData = window.google.visualization.arrayToDataTable(normalizedData);

                if (currencyColumns.length > 0) {
                    const currencyFormatter = new window.google.visualization.NumberFormat({
                        prefix: '$',
                        suffix: ' MX',
                        fractionDigits: 2,
                        groupingSymbol: ',',
                        decimalSymbol: '.',
                    });

                    currencyColumns.forEach((columnIndex) => {
                        if (columnIndex > 0 && columnIndex < chartData.getNumberOfColumns()) {
                        currencyFormatter.format(chartData, columnIndex);
                        }
                    });
                }

                const chart = new window.google.visualization.ColumnChart(containerRef.current);

                if (onImageReadyRef.current) {
                    window.google.visualization.events.addListener(chart, 'ready', () => {
                        if (!onImageReadyRef.current) return;

                        if (typeof chart.getImageURI === 'function') {
                            const imageUri = chart.getImageURI();

                            if (imageUri) {
                                onImageReadyRef.current(imageUri);
                            }
                        }
                    });
                }

                chart.draw(chartData, {
                    title,
                    height,
                    backgroundColor: 'transparent',
                    legend: {
                        position: 'top',
                        textStyle: { color: '#d1d5db' },
                    },
                    titleTextStyle: {
                        color: '#ffffff',
                        fontSize: 16,
                        bold: true,
                    },
                    hAxis: {
                        title: hAxisTitle,
                        textStyle: { color: '#9ca3af' },
                        titleTextStyle: { color: '#9ca3af' },
                    },
                        vAxis: {
                            title: vAxisTitle,
                            minValue: 0,
                            format: currencyColumns.length > 0 ? '$#,##0.00' : undefined,
                            textStyle: { color: '#9ca3af' },
                            titleTextStyle: { color: '#9ca3af' },
                            gridlines: { color: '#1f2937' },
                        },
                    chartArea: {
                        left: 70,
                        top: 70,
                        right: 30,
                        bottom: 70,
                        width: '80%',
                        height: '65%',
                    },
                    isStacked: stacked,
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Error al cargar la gráfica');
            }
        }

        void draw();

        function handleResize() {
            void draw();
        }

        window.addEventListener('resize', handleResize);

        return () => {
            cancelled = true;
            window.removeEventListener('resize', handleResize);
        };
    }, [normalizedData, title, height, vAxisTitle, hAxisTitle, stacked, currencyColumns]);

    if (normalizedData.length < 2) {
        return (
        <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
            <p className="text-white font-semibold">{title}</p>
            <p className="mt-2 text-sm text-gray-500">No hay datos suficientes para graficar.</p>
        </div>
        );
    }

    return (
        <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
            {error ? (
                <div>
                <p className="text-white font-semibold">{title}</p>
                <p className="mt-2 text-sm text-red-300">{error}</p>
                </div>
            ) : (
                <div ref={containerRef} style={{ width: '100%', height }} />
            )}
        </div>
    );
}