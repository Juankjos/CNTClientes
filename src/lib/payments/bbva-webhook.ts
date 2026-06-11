// src/lib/payments/bbva-webhook.ts
import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { getBbvaConfig } from './bbva-config';

export type LocalPaymentStatus = 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';

function safeString(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') return null;

    const text = String(value).trim();

    return text ? text : null;
}

function getByPath(obj: any, path: string) {
    return path.split('.').reduce((acc, key) => {
        if (!acc || typeof acc !== 'object') return undefined;
        return acc[key];
    }, obj);
}

function firstString(obj: any, paths: string[]) {
    for (const path of paths) {
        const value = safeString(getByPath(obj, path));
        if (value) return value;
    }

    return null;
}

export function extractBbvaWebhookInfo(payload: any) {
    const transactionId = firstString(payload, [
        'id',
        'transaction_id',
        'charge_id',
        'charge.id',
        'data.id',
        'data.transaction_id',
        'data.charge.id',
        'data.object.id',
        'event.data.id',
        'event.data.object.id',
    ]);

    const orderId = firstString(payload, [
        'order_id',
        'orderId',
        'charge.order_id',
        'data.order_id',
        'data.charge.order_id',
        'data.object.order_id',
        'event.data.order_id',
        'event.data.object.order_id',
    ]);

    const eventId = firstString(payload, [
        'event_id',
        'eventId',
        'id_event',
        'notification_id',
        'webhook_id',
        'data.event_id',
    ]);

    const eventType = firstString(payload, [
        'type',
        'event_type',
        'eventType',
        'event.type',
        'data.type',
    ]);

    const rawStatus = firstString(payload, [
        'status',
        'estatus',
        'charge.status',
        'data.status',
        'data.charge.status',
        'data.object.status',
        'event.data.status',
        'event.data.object.status',
    ]);

    return {
        transactionId,
        orderId,
        eventId,
        eventType,
        rawStatus,
    };
}

export function extractBbvaChargeInfo(charge: any) {
    const transactionId = firstString(charge, [
        'id',
        'transaction_id',
        'charge_id',
    ]);

    const orderId = firstString(charge, [
        'order_id',
        'orderId',
    ]);

    const rawStatus = firstString(charge, [
        'status',
        'estatus',
    ]);

    const currency = firstString(charge, [
        'currency',
    ]);

    const amountValue =
        getByPath(charge, 'amount') ??
        getByPath(charge, 'transaction.amount');

    const amount = Number(amountValue);

    return {
        transactionId,
        orderId,
        rawStatus,
        currency,
        amount: Number.isFinite(amount) ? amount : null,
    };
}

export function mapBbvaStatusToLocal(rawStatus: string | null): LocalPaymentStatus {
    const status = String(rawStatus ?? '').trim().toLowerCase();

    if (
        [
            'paid',
            'pagado',
            'completed',
            'complete',
            'succeeded',
            'success',
            'captured',
            'charge.succeeded',
            'charge.paid',
        ].includes(status)
    ) {
        return 'pagado';
    }

    if (
        [
            'refunded',
            'refund',
            'reembolsado',
            'charge.refunded',
        ].includes(status)
    ) {
        return 'reembolsado';
    }

    if (
        [
            'cancelled',
            'canceled',
            'cancelado',
            'failed',
            'declined',
            'rejected',
            'charge.failed',
            'charge.cancelled',
        ].includes(status)
    ) {
        return 'cancelado';
    }

    return 'pendiente';
}

export function isMoneyEqual(a: unknown, b: unknown) {
    const centsA = Math.round(Number(a) * 100);
    const centsB = Math.round(Number(b) * 100);

    return Number.isFinite(centsA) && Number.isFinite(centsB) && centsA === centsB;
}

export function verifyWebhookToken(req: NextRequest) {
    const expected = getBbvaConfig().webhookToken;

    const received =
        req.nextUrl.searchParams.get('token') ||
        req.headers.get('x-webhook-token') ||
        '';

    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);

    if (expectedBuffer.length !== receivedBuffer.length) return false;

    return timingSafeEqual(expectedBuffer, receivedBuffer);
}

export function safeHeadersForAudit(req: NextRequest) {
    const allowedHeaders = [
        'content-type',
        'user-agent',
        'x-forwarded-for',
        'x-real-ip',
        'x-request-id',
    ];

    const result: Record<string, string> = {};

    for (const key of allowedHeaders) {
        const value = req.headers.get(key);
        if (value) result[key] = value;
    }

    return result;
}