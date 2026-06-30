//src/app/(protected)/admin/statistics/page.tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';
import GoogleColumnChart from '@/components/admin/GoogleColumnChart';

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

type YearMonthlyRow = {
    month: number;
    label: string;
    total_pagos: number;
    pagos_gratuitos: number;
    pagos_de_paga: number;
    ingresos_pagados: number;
};

type YearItemRow = {
    titulo: string;
    categoria: string;
    total_pagos: number;
    pagos_gratuitos: number;
    pagos_de_paga: number;
    ingresos_pagados: number;
};

type YearStatsResponse = {
    view: 'year';
    year: {
        year: number;
        start: string;
        end: string;
    };
    summary: {
        total_pagos: number;
        pagos_gratuitos: number;
        pagos_de_paga: number;
        ingresos_pagados: number;
    };
    monthly: YearMonthlyRow[];
    items: YearItemRow[];
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
    const formatted = new Intl.NumberFormat('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(Number(value || 0));

    return `$${formatted} MX`;
}

function formatCategoria(value: string) {
    if (!value) return 'Sin categoría';

    return value
        .replaceAll('_', ' ')
        .replace(/^\w/, (letter) => letter.toUpperCase());
}

function getMonthLabel(value: number) {
    return MONTHS.find((item) => item.value === value)?.label ?? String(value);
}

function formatPdfDateTime(value = new Date()) {
    const dateText = new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    }).format(value);

    const parts = new Intl.DateTimeFormat('es-MX', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    }).formatToParts(value);

    const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
    const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
    const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value ?? 'a.m.';

    const normalizedPeriod = dayPeriod.toLowerCase().includes('p') ? 'p.m.' : 'a.m.';

    return `${dateText}, ${hour}:${minute} ${normalizedPeriod}`;
}

export default function AdminStatisticsPage() {
    const now = new Date();

    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [chartsYear, setChartsYear] = useState(now.getFullYear());
    const [data, setData] = useState<StatsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState('');
    const [yearData, setYearData] = useState<YearStatsResponse | null>(null);
    const [yearLoading, setYearLoading] = useState(true);
    const [yearMsg, setYearMsg] = useState('');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfMsg, setPdfMsg] = useState('');

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

    const fetchYearStats = useCallback(async () => {
        try {
            setYearLoading(true);
            setYearMsg('');

            const params = new URLSearchParams({
                view: 'year',
                year: String(chartsYear),
            });

            const res = await fetch(apiPath(`/api/admin/statistics?${params.toString()}`));
            const json = await res.json().catch(() => null);

            if (!res.ok) {
            throw new Error(json?.detail || json?.error || `HTTP ${res.status}`);
            }

            setYearData(json);
        } catch (error) {
            setYearData(null);
            setYearMsg(error instanceof Error ? error.message : 'No se pudieron cargar las gráficas');
        } finally {
            setYearLoading(false);
        }
    }, [chartsYear]);

    useEffect(() => {
        void fetchStats();
    }, [fetchStats]);

    useEffect(() => {
        void fetchYearStats();
    }, [fetchYearStats]);

    const monthlyRevenueChartData: Array<Array<string | number>> = [
        ['Mes', 'Ingresos'],
        ...(yearData?.monthly ?? []).map((row) => [
            row.label,
            row.ingresos_pagados,
        ]),
    ];

    const monthlyPaymentsChartData: Array<Array<string | number>> = [
        ['Mes', 'De paga', 'Gratuitos'],
        ...(yearData?.monthly ?? []).map((row) => [
            row.label,
            row.pagos_de_paga,
            row.pagos_gratuitos,
        ]),
    ];

    const itemRevenueChartData: Array<Array<string | number>> = [
        ['Item de catálogo', 'Ingresos'],
        ...(yearData?.items ?? []).map((row) => [
            row.titulo.length > 28 ? `${row.titulo.slice(0, 28)}…` : row.titulo,
            row.ingresos_pagados,
        ]),
    ];

    const itemPaymentsChartData: Array<Array<string | number>> = [
        ['Item de catálogo', 'De paga', 'Gratuitos'],
        ...(yearData?.items ?? []).map((row) => [
            row.titulo.length > 28 ? `${row.titulo.slice(0, 28)}…` : row.titulo,
            row.pagos_de_paga,
            row.pagos_gratuitos,
        ]),
    ];

    async function handleDownloadYearPdf() {
        try {
            setPdfLoading(true);
            setPdfMsg('');

            if (!yearData) {
                throw new Error('No hay datos anuales cargados para generar el PDF.');
            }

            const reportYearData = yearData;

            const { jsPDF } = await import('jspdf');

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const margin = 42;
            const contentWidth = pageWidth - margin * 2;
            const footerY = pageHeight - 26;

            const generatedAt = formatPdfDateTime();

            let y = 48;

            const colors = {
                black: [17, 24, 39] as [number, number, number],
                dark: [24, 24, 27] as [number, number, number],
                muted: [107, 114, 128] as [number, number, number],
                softBorder: [229, 231, 235] as [number, number, number],
                bubble: [249, 250, 251] as [number, number, number],
                white: [255, 255, 255] as [number, number, number],
                red: [220, 38, 38] as [number, number, number],
            };

            function setTextColor(color: [number, number, number]) {
                doc.setTextColor(color[0], color[1], color[2]);
            }

            function setFillColor(color: [number, number, number]) {
                doc.setFillColor(color[0], color[1], color[2]);
            }

            function setDrawColor(color: [number, number, number]) {
                doc.setDrawColor(color[0], color[1], color[2]);
            }

            function addPageIfNeeded(extraSpace = 80) {
                if (y + extraSpace > pageHeight - 56) {
                    doc.addPage();
                    y = 48;
                }
            }

            function drawHeader() {
                setFillColor(colors.dark);
                doc.roundedRect(margin, y, contentWidth, 72, 14, 14, 'F');

                setTextColor(colors.white);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text('Reporte anual de estadísticas', margin + 22, y + 30);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text('CNT - Estadísticas administrativas', margin + 22, y + 50);

                y += 96;
            }

            function drawPeriodBubble() {
                const boxHeight = 72;

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text('AÑO', margin + 18, y + 24);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text(String(chartsYear), margin + 100, y + 24);

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text('GENERADO', margin + 18, y + 50);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(generatedAt, margin + 100, y + 50);

                y += boxHeight + 22;
            }

            function drawSectionTitle(title: string) {
                addPageIfNeeded(42);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text(title, margin, y);

                setDrawColor(colors.red);
                doc.setLineWidth(1.5);
                doc.line(margin, y + 8, margin + 42, y + 8);

                y += 24;
            }

            function drawMetricCell(
                x: number,
                cellY: number,
                width: number,
                label: string,
                value: string
            ) {
                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.text(label.toUpperCase(), x + 10, cellY + 14);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(value, x + 10, cellY + 30, {
                    maxWidth: width - 20,
                });
            }

            function drawSummaryBubble() {
                const boxHeight = 150;
                const headerHeight = 38;
                const gridHeight = boxHeight - headerHeight;
                const colWidth = contentWidth / 2;
                const rowHeight = gridHeight / 2;

                addPageIfNeeded(boxHeight + 20);

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.text('Resumen anual', margin + 18, y + 24);

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);

                doc.line(margin, y + headerHeight, margin + contentWidth, y + headerHeight);
                doc.line(margin + colWidth, y + headerHeight, margin + colWidth, y + boxHeight);
                doc.line(margin, y + headerHeight + rowHeight, margin + contentWidth, y + headerHeight + rowHeight);

                const cells = [
                    {
                        label: 'Ingresos',
                        value: formatMoney(reportYearData.summary.ingresos_pagados),
                    },
                    {
                        label: 'Total de pagos',
                        value: String(reportYearData.summary.total_pagos),
                    },
                    {
                        label: 'Pagos de paga',
                        value: String(reportYearData.summary.pagos_de_paga),
                    },
                    {
                        label: 'Pagos gratuitos',
                        value: String(reportYearData.summary.pagos_gratuitos),
                    },
                ];

                cells.forEach((cell, index) => {
                    const col = index % 2;
                    const row = Math.floor(index / 2);

                    const x = margin + colWidth * col + 18;
                    const cellY = y + headerHeight + rowHeight * row + 24;

                    setTextColor(colors.muted);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.text(cell.label.toUpperCase(), x, cellY);

                    setTextColor(colors.black);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(index === 0 ? 14 : 16);
                    doc.text(cell.value, x, cellY + 25);
                });

                y += boxHeight + 28;
            }

            function drawMonthBubble(row: YearMonthlyRow) {
                const boxHeight = 118;
                const innerX = margin + 18;
                const titleX = innerX + 18;

                addPageIfNeeded(boxHeight + 14);

                setFillColor(colors.white);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.red);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text('>', innerX, y + 27);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(11);
                doc.text(row.label, titleX, y + 26);

                const gridX = innerX;
                const gridY = y + 45;
                const gridWidth = contentWidth - 36;
                const cellWidth = gridWidth / 2;
                const rowHeight = 58 / 2;

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);

                doc.roundedRect(gridX, gridY, gridWidth, 58, 8, 8, 'S');
                doc.line(gridX + cellWidth, gridY, gridX + cellWidth, gridY + 58);
                doc.line(gridX, gridY + rowHeight, gridX + gridWidth, gridY + rowHeight);

                drawMetricCell(
                    gridX,
                    gridY,
                    cellWidth,
                    'Ingresos',
                    formatMoney(row.ingresos_pagados)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY,
                    cellWidth,
                    'Total',
                    String(row.total_pagos)
                );

                drawMetricCell(
                    gridX,
                    gridY + rowHeight,
                    cellWidth,
                    'De paga',
                    String(row.pagos_de_paga)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY + rowHeight,
                    cellWidth,
                    'Gratuitos',
                    String(row.pagos_gratuitos)
                );

                y += boxHeight + 12;
            }

            function drawItemBubble(item: YearItemRow) {
                const boxX = margin;
                const boxWidth = contentWidth;
                const innerX = boxX + 18;
                const titleX = innerX + 18;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);

                const titleLines = doc.splitTextToSize(item.titulo, boxWidth - 58);
                const titleHeight = titleLines.length * 13;

                const gridTopOffset = 24 + titleHeight + 16;
                const gridHeight = 90;
                const boxHeight = gridTopOffset + gridHeight + 18;

                addPageIfNeeded(boxHeight + 14);

                setFillColor(colors.white);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(boxX, y, boxWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.red);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text('>', innerX, y + 26);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text(titleLines, titleX, y + 25);

                const gridX = innerX;
                const gridY = y + gridTopOffset;
                const gridWidth = boxWidth - 36;
                const cellWidth = gridWidth / 2;
                const rowHeight = gridHeight / 3;

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);

                doc.roundedRect(gridX, gridY, gridWidth, gridHeight, 8, 8, 'S');
                doc.line(gridX + cellWidth, gridY, gridX + cellWidth, gridY + gridHeight);
                doc.line(gridX, gridY + rowHeight, gridX + gridWidth, gridY + rowHeight);
                doc.line(gridX, gridY + rowHeight * 2, gridX + gridWidth, gridY + rowHeight * 2);

                drawMetricCell(
                    gridX,
                    gridY,
                    cellWidth,
                    'Categoría',
                    formatCategoria(item.categoria)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY,
                    cellWidth,
                    'Ingresos',
                    formatMoney(item.ingresos_pagados)
                );

                drawMetricCell(
                    gridX,
                    gridY + rowHeight,
                    cellWidth,
                    'De paga',
                    String(item.pagos_de_paga)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY + rowHeight,
                    cellWidth,
                    'Gratuitos',
                    String(item.pagos_gratuitos)
                );

                drawMetricCell(
                    gridX,
                    gridY + rowHeight * 2,
                    cellWidth,
                    'Total',
                    String(item.total_pagos)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY + rowHeight * 2,
                    cellWidth,
                    'Participación',
                    item.ingresos_pagados > 0 && reportYearData.summary.ingresos_pagados > 0
                        ? `${((item.ingresos_pagados / reportYearData.summary.ingresos_pagados) * 100).toFixed(1)}%`
                        : '0.0%'
                );

                y += boxHeight + 12;
            }

            function drawEmptyBubble(text: string) {
                const boxHeight = 66;

                addPageIfNeeded(boxHeight + 12);

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(text, margin + 18, y + 38);

                y += boxHeight + 12;
            }

            doc.setProperties({
                title: `Reporte anual de estadísticas ${chartsYear}`,
                subject: 'Estadísticas anuales de ingresos y pagos',
                creator: 'CNT',
            });

            drawHeader();
            drawPeriodBubble();

            drawSummaryBubble();

            drawSectionTitle('Detalle por mes');

            reportYearData.monthly.forEach((row) => {
                drawMonthBubble(row);
            });

            y += 8;

            drawSectionTitle('Top 10 items');

            if (reportYearData.items.length === 0) {
                drawEmptyBubble('No hay items registrados para este año.');
            } else {
                reportYearData.items.forEach((item) => {
                    drawItemBubble(item);
                });
            }

            const totalPages = doc.getNumberOfPages();

            for (let index = 1; index <= totalPages; index += 1) {
                doc.setPage(index);

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);
                doc.line(margin, footerY - 16, pageWidth - margin, footerY - 16);

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text('CNT - Estadísticas administrativas', margin, footerY);

                doc.text(
                    `Página ${index} de ${totalPages}`,
                    pageWidth - margin - 78,
                    footerY
                );
            }

            doc.save(`reporte-estadisticas-anual-${chartsYear}.pdf`);
        } catch (error) {
            setPdfMsg(error instanceof Error ? error.message : 'No se pudo generar el PDF anual.');
        } finally {
            setPdfLoading(false);
        }
    }

    async function handleDownloadMonthPdf() {
        try {
            setPdfLoading(true);
            setPdfMsg('');

            if (!data) {
                throw new Error('No hay datos mensuales cargados para generar el PDF.');
            }

            const reportData = data;

            const { jsPDF } = await import('jspdf');

            const doc = new jsPDF({
                orientation: 'portrait',
                unit: 'pt',
                format: 'a4',
            });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();

            const margin = 42;
            const contentWidth = pageWidth - margin * 2;
            const footerY = pageHeight - 26;

            const monthLabel = getMonthLabel(month);
            const generatedAt = formatPdfDateTime();

            let y = 48;

            const colors = {
                black: [17, 24, 39] as [number, number, number],
                dark: [24, 24, 27] as [number, number, number],
                muted: [107, 114, 128] as [number, number, number],
                border: [209, 213, 219] as [number, number, number],
                softBorder: [229, 231, 235] as [number, number, number],
                bubble: [249, 250, 251] as [number, number, number],
                white: [255, 255, 255] as [number, number, number],
                red: [220, 38, 38] as [number, number, number],
            };

            function setTextColor(color: [number, number, number]) {
                doc.setTextColor(color[0], color[1], color[2]);
            }

            function setFillColor(color: [number, number, number]) {
                doc.setFillColor(color[0], color[1], color[2]);
            }

            function setDrawColor(color: [number, number, number]) {
                doc.setDrawColor(color[0], color[1], color[2]);
            }

            function addPageIfNeeded(extraSpace = 80) {
                if (y + extraSpace > pageHeight - 56) {
                    doc.addPage();
                    y = 48;
                }
            }

            function drawHeader() {
                setFillColor(colors.dark);
                doc.roundedRect(margin, y, contentWidth, 72, 14, 14, 'F');

                setTextColor(colors.white);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(18);
                doc.text('Reporte mensual de estadísticas', margin + 22, y + 30);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text('CNT - Estadísticas administrativas', margin + 22, y + 50);

                y += 96;
            }

            function drawPeriodBubble() {
                const boxHeight = 72;

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text('MES Y AÑO', margin + 18, y + 24);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text(`${monthLabel} ${year}`, margin + 100, y + 24);

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.text('GENERADO', margin + 18, y + 50);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(generatedAt, margin + 100, y + 50);

                y += boxHeight + 22;
            }

            function drawSectionTitle(title: string) {
                addPageIfNeeded(42);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text(title, margin, y);

                setDrawColor(colors.red);
                doc.setLineWidth(1.5);
                doc.line(margin, y + 8, margin + 42, y + 8);

                y += 24;
            }

            function drawSummaryBubble() {
                const boxHeight = 118;
                const headerHeight = 38;
                const colWidth = contentWidth / 3;

                addPageIfNeeded(boxHeight + 20);

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(12);
                doc.text('Resumen mensual', margin + 18, y + 24);

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);
                doc.line(margin, y + headerHeight, margin + contentWidth, y + headerHeight);

                doc.line(margin + colWidth, y + headerHeight, margin + colWidth, y + boxHeight);
                doc.line(margin + colWidth * 2, y + headerHeight, margin + colWidth * 2, y + boxHeight);

                const cells = [
                    {
                        label: 'Ingresos',
                        value: formatMoney(reportData.summary.total_ingresos),
                    },
                    {
                        label: 'Artículos vendidos',
                        value: String(reportData.summary.pagos_count),
                    },
                    {
                        label: 'Grupos',
                        value: String(reportData.summary.grupos_count),
                    },
                ];

                cells.forEach((cell, index) => {
                    const x = margin + colWidth * index + 18;

                    setTextColor(colors.muted);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.text(cell.label.toUpperCase(), x, y + 66);

                    setTextColor(colors.black);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(index === 0 ? 14 : 16);
                    doc.text(cell.value, x, y + 90);
                });

                y += boxHeight + 28;
            }

            function drawMetricCell(
                x: number,
                cellY: number,
                width: number,
                label: string,
                value: string
            ) {
                setTextColor(colors.muted);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(7.5);
                doc.text(label.toUpperCase(), x + 10, cellY + 14);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.text(value, x + 10, cellY + 30, {
                    maxWidth: width - 20,
                });
            }

            function drawItemBubble(row: StatsRow) {
                const boxX = margin;
                const boxWidth = contentWidth;
                const innerX = boxX + 18;
                const titleX = innerX + 18;

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);

                const titleLines = doc.splitTextToSize(row.titulo, boxWidth - 58);
                const titleHeight = titleLines.length * 13;

                const gridTopOffset = 24 + titleHeight + 16;
                const gridHeight = 70;
                const boxHeight = gridTopOffset + gridHeight + 18;

                addPageIfNeeded(boxHeight + 14);

                setFillColor(colors.white);
                setDrawColor(colors.softBorder);
                doc.setLineWidth(1);
                doc.roundedRect(boxX, y, boxWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.red);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.text('>', innerX, y + 26);

                setTextColor(colors.black);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(10);
                doc.text(titleLines, titleX, y + 25);

                const gridX = innerX;
                const gridY = y + gridTopOffset;
                const gridWidth = boxWidth - 36;
                const cellWidth = gridWidth / 2;
                const rowHeight = gridHeight / 2;

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);

                doc.roundedRect(gridX, gridY, gridWidth, gridHeight, 8, 8, 'S');
                doc.line(gridX + cellWidth, gridY, gridX + cellWidth, gridY + gridHeight);
                doc.line(gridX, gridY + rowHeight, gridX + gridWidth, gridY + rowHeight);

                drawMetricCell(
                    gridX,
                    gridY,
                    cellWidth,
                    'Categoría',
                    formatCategoria(row.categoria)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY,
                    cellWidth,
                    'Monto pagado',
                    formatMoney(row.monto_pagado)
                );

                drawMetricCell(
                    gridX,
                    gridY + rowHeight,
                    cellWidth,
                    'Pagos',
                    String(row.pagos_count)
                );

                drawMetricCell(
                    gridX + cellWidth,
                    gridY + rowHeight,
                    cellWidth,
                    'Total ingresos',
                    formatMoney(row.total_ingresos)
                );

                y += boxHeight + 12;
            }

            function drawEmptyBubble(text: string) {
                const boxHeight = 66;

                addPageIfNeeded(boxHeight + 12);

                setFillColor(colors.bubble);
                setDrawColor(colors.softBorder);
                doc.roundedRect(margin, y, contentWidth, boxHeight, 14, 14, 'FD');

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(10);
                doc.text(text, margin + 18, y + 38);

                y += boxHeight + 12;
            }

            doc.setProperties({
                title: `Reporte mensual de estadísticas ${monthLabel} ${year}`,
                subject: 'Estadísticas mensuales de ingresos',
                creator: 'CNT',
            });

            drawHeader();
            drawPeriodBubble();

            drawSummaryBubble();

            drawSectionTitle('Detalle por grupo');

            if (reportData.rows.length === 0) {
                drawEmptyBubble('No hay pagos pagados para este mes.');
            } else {
                reportData.rows.forEach((row) => {
                    drawItemBubble(row);
                });
            }

            const totalPages = doc.getNumberOfPages();

            for (let index = 1; index <= totalPages; index += 1) {
                doc.setPage(index);

                setDrawColor(colors.softBorder);
                doc.setLineWidth(0.8);
                doc.line(margin, footerY - 16, pageWidth - margin, footerY - 16);

                setTextColor(colors.muted);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.text('CNT - Estadísticas administrativas', margin, footerY);

                doc.text(
                    `Página ${index} de ${totalPages}`,
                    pageWidth - margin - 78,
                    footerY
                );
            }

            doc.save(`reporte-estadisticas-${year}-${String(month).padStart(2, '0')}.pdf`);
        } catch (error) {
            setPdfMsg(error instanceof Error ? error.message : 'No se pudo generar el PDF mensual.');
        } finally {
            setPdfLoading(false);
        }
    }

    return (
        <div>
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
                <div>
                    <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
                        Panel de administración
                    </p>
                    <h1 className="font-display text-3xl text-white">Estadísticas</h1>
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
                        className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border hover:border-cnt-red text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Actualizar
                    </button>

                    <button
                        type="button"
                        disabled={pdfLoading || loading || !data}
                        onClick={handleDownloadMonthPdf}
                        className="cursor-pointer px-4 py-2 bg-cnt-surface border border-cnt-border hover:bg-red-700 border-cnt-red text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {pdfLoading ? 'Generando...' : 'PDF mensual'}
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
                        Ingresos
                    </p>
                    <p className="text-2xl font-semibold text-white">
                        {loading ? '—' : formatMoney(data?.summary.total_ingresos ?? 0)}
                    </p>
                </div>

                <div className="rounded-xl border border-cnt-border bg-cnt-surface p-5">
                    <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Total de artículos vendidos
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

            <div className="mb-10 overflow-x-auto rounded-xl border border-cnt-border">
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

            {pdfMsg && (
                <div className="mb-6 rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300">
                    {pdfMsg}
                </div>
            )}

            <section className="mt-12 border-t border-cnt-border pt-8 space-y-5">
                <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                        <p className="mb-2 text-xs font-mono uppercase tracking-widest text-gray-500">
                            Estadísticas anuales
                        </p>

                        <h2 className="text-white text-xl font-semibold">
                            Gráficas del año {chartsYear}
                        </h2>

                        <p className="mt-1 text-sm text-gray-500">
                            Comparativa anual de ingresos, artículos de paga y artículos gratuitos.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                        <div>
                        <select
                            value={chartsYear}
                            onChange={(e) => setChartsYear(Number(e.target.value))}
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
                            onClick={fetchYearStats}
                            className="cursor-pointer border border-cnt-border px-4 py-2 bg-cnt-surface hover:border-cnt-red text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            Actualizar gráficas
                        </button>

                        <button
                            type="button"
                            disabled={pdfLoading || yearLoading || !yearData}
                            onClick={handleDownloadYearPdf}
                            className="cursor-pointer border border-cnt-border px-4 py-2 bg-cnt-surface hover:bg-red-700 border-cnt-red text-white rounded-lg text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {pdfLoading ? 'Generando...' : 'PDF anual'}
                        </button>
                    </div>
                </div>

                {yearMsg && (
                    <div className="rounded-lg border border-cnt-red bg-red-950 px-4 py-3 text-sm text-red-300">
                    {yearMsg}
                    </div>
                )}

                {yearLoading ? (
                    <div className="grid grid-cols-1 gap-4">
                    {[...Array(4)].map((_, index) => (
                        <div
                        key={index}
                        className="h-80 rounded-xl border border-cnt-border bg-cnt-surface animate-pulse"
                        />
                    ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        <GoogleColumnChart
                            title={`Ingresos por mes (${chartsYear})`}
                            data={monthlyRevenueChartData}
                            height={360}
                            vAxisTitle="Ingresos MXN"
                            hAxisTitle="Mes"
                            currencyColumns={[1]}
                        />

                        <GoogleColumnChart
                            title={`Paga vs gratuitos por mes (${chartsYear})`}
                            data={monthlyPaymentsChartData}
                            height={360}
                            vAxisTitle="Cantidad de pagos"
                            hAxisTitle="Mes"
                        />

                        <GoogleColumnChart
                            title={`Top 10 items por ingresos (${chartsYear})`}
                            data={itemRevenueChartData}
                            height={420}
                            vAxisTitle="Ingresos MXN"
                            hAxisTitle="Item de catálogo"
                            currencyColumns={[1]}
                        />

                        <GoogleColumnChart
                            title={`Top 10 items: Paga vs Gratuito (${chartsYear})`}
                            data={itemPaymentsChartData}
                            height={420}
                            vAxisTitle="Cantidad de pagos"
                            hAxisTitle="Item de catálogo"
                        />
                    </div>
                )}
            </section>

        </div>
    );
}