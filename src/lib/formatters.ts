// src/lib/formatters.ts
export function formatMoney(value: unknown) {
    const amount =
        typeof value === 'string'
            ? Number(value.replace(/,/g, ''))
            : Number(value);

    if (!Number.isFinite(amount)) return '0.00';

    return new Intl.NumberFormat('es-MX', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
}