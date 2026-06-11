// src/app/api/payments/bbva/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2';
import { pool } from '@/lib/db';
import { getBbvaCharge } from '@/lib/payments/bbva-api';
import {
    extractBbvaWebhookInfo,
    extractBbvaChargeInfo,
    isMoneyEqual,
    mapBbvaStatusToLocal,
    safeHeadersForAudit,
    verifyWebhookToken,
} from '@/lib/payments/bbva-webhook';

export const runtime = 'nodejs';

type PagoRow = RowDataPacket & {
    id: number;
    referencia: string;
    monto: string | number;
    moneda: string;
    estatus: 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
    transaccion_externa: string | null;
};

function jsonResponse(body: unknown, status = 200) {
    return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
    const headersForAudit = safeHeadersForAudit(req);

    if (!verifyWebhookToken(req)) {
        return jsonResponse({ ok: false, error: 'Webhook no autorizado' }, 401);
    }

    const rawBody = await req.text();

    let payload: any;

    try {
        payload = JSON.parse(rawBody);
    } catch {
        return jsonResponse({ ok: false, error: 'JSON inválido' }, 400);
    }

    const webhookInfo = extractBbvaWebhookInfo(payload);

    if (!webhookInfo.transactionId && !webhookInfo.orderId) {
        await pool.execute(
        `
        INSERT INTO pagos_webhooks_bbva
            (event_id, provider_transaction_id, order_id, event_type, provider_status, payload, headers, processed, error)
        VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 0, ?)
        `,
        [
            webhookInfo.eventId,
            webhookInfo.transactionId,
            webhookInfo.orderId,
            webhookInfo.eventType,
            webhookInfo.rawStatus,
            JSON.stringify(payload),
            JSON.stringify(headersForAudit),
            'No llegó transaction_id ni order_id en el webhook',
        ]
        );

        return jsonResponse(
        {
            ok: false,
            error: 'Webhook recibido, pero no contiene identificadores suficientes',
        },
        202
        );
    }

    let verifiedCharge: any = null;
    let verifiedChargeInfo: ReturnType<typeof extractBbvaChargeInfo> | null = null;

    try {
        if (!webhookInfo.transactionId) {
            throw new Error(
                'El webhook no contiene transaction_id. No se puede verificar contra BBVA por ID de cargo.'
            );
        }

        verifiedCharge = await getBbvaCharge(webhookInfo.transactionId);
        verifiedChargeInfo = extractBbvaChargeInfo(verifiedCharge);
    } catch (error) {
        await pool.execute(
            `
                INSERT INTO pagos_webhooks_bbva
                    (event_id, provider_transaction_id, order_id, event_type, provider_status, payload, headers, processed, error)
                VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 0, ?)
                ON DUPLICATE KEY UPDATE
                error = VALUES(error),
                payload = VALUES(payload),
                headers = VALUES(headers)
            `,
            [
                webhookInfo.eventId,
                webhookInfo.transactionId,
                webhookInfo.orderId,
                webhookInfo.eventType,
                webhookInfo.rawStatus,
                JSON.stringify(payload),
                JSON.stringify(headersForAudit),
                error instanceof Error ? error.message : String(error),
            ]
        );

        return jsonResponse(
            {
                ok: false,
                error: 'No se pudo verificar el cargo contra BBVA',
            },
                502
            );
    }

    const transactionId =
        verifiedChargeInfo.transactionId || webhookInfo.transactionId;

    const orderId =
        verifiedChargeInfo.orderId || webhookInfo.orderId;

    const providerStatus =
        verifiedChargeInfo.rawStatus || webhookInfo.rawStatus;

    const localStatus = mapBbvaStatusToLocal(providerStatus);

    const conn = await pool.getConnection();

    try {
        await conn.beginTransaction();

        const [rows] = await conn.execute<PagoRow[]>(
            `
            SELECT
                id,
                referencia,
                monto,
                moneda,
                estatus,
                transaccion_externa
            FROM pagos_clientes
            WHERE
            (
                proveedor = 'bbva'
                AND transaccion_externa = ?
            )
            OR referencia = ?
            ORDER BY id DESC
            LIMIT 1
            FOR UPDATE
            `,
            [
                transactionId || '__NO_TRANSACTION__',
                orderId || '__NO_ORDER__',
            ]
        );

        const pago = rows[0];

        if (!pago) {
            await conn.execute(
                `
                INSERT INTO pagos_webhooks_bbva
                    (event_id, provider_transaction_id, order_id, event_type, provider_status, payload, headers, processed, error)
                VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 0, ?)
                ON DUPLICATE KEY UPDATE
                    error = VALUES(error),
                    payload = VALUES(payload),
                    headers = VALUES(headers)
                `,
                [
                    webhookInfo.eventId,
                    transactionId,
                    orderId,
                    webhookInfo.eventType,
                    providerStatus,
                    JSON.stringify(payload),
                    JSON.stringify(headersForAudit),
                    'No se encontró pago local por transaccion_externa ni order_id/referencia',
                ]
            );

            await conn.commit();

            return jsonResponse(
                {
                    ok: false,
                    error: 'Pago local no encontrado',
                },
                    202
            );
        }

    if (orderId && pago.referencia !== orderId) {
        throw new Error(
            `order_id no coincide. Local=${pago.referencia}, BBVA=${orderId}`
        );
    }

    if (
        verifiedChargeInfo.amount !== null &&
        !isMoneyEqual(pago.monto, verifiedChargeInfo.amount)
    ) {
        throw new Error(
            `Monto no coincide. Local=${pago.monto}, BBVA=${verifiedChargeInfo.amount}`
        );
    }

    if (
        verifiedChargeInfo.currency &&
        pago.moneda &&
        verifiedChargeInfo.currency.toUpperCase() !== pago.moneda.toUpperCase()
    ) {
        throw new Error(
            `Moneda no coincide. Local=${pago.moneda}, BBVA=${verifiedChargeInfo.currency}`
        );
    }

    await conn.execute(
        `
        INSERT INTO pagos_webhooks_bbva
        (
            event_id,
            pago_id,
            provider_transaction_id,
            order_id,
            event_type,
            provider_status,
            payload,
            headers,
            processed,
            processed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 1, NOW())
        ON DUPLICATE KEY UPDATE
            pago_id = VALUES(pago_id),
            provider_transaction_id = VALUES(provider_transaction_id),
            order_id = VALUES(order_id),
            provider_status = VALUES(provider_status),
            payload = VALUES(payload),
            headers = VALUES(headers),
            processed = 1,
            processed_at = NOW(),
            error = NULL
        `,
        [
            webhookInfo.eventId,
            pago.id,
            transactionId,
            orderId,
            webhookInfo.eventType,
            providerStatus,
            JSON.stringify(payload),
            JSON.stringify(headersForAudit),
        ]
    );

    if (localStatus === 'pagado') {
        await conn.execute(
            `
            UPDATE pagos_clientes
            SET
                proveedor = 'bbva',
                transaccion_externa = COALESCE(transaccion_externa, ?),
                bbva_status = ?,
                respuesta = ?,
                estatus = 'pagado',
                pagado_at = COALESCE(pagado_at, NOW()),
                bbva_webhook_at = NOW()
            WHERE id = ?
            `,
            [
                transactionId,
                providerStatus,
                JSON.stringify(verifiedCharge),
                pago.id,
            ]
        );
    } else if (localStatus === 'reembolsado') {
        await conn.execute(
            `
            UPDATE pagos_clientes
            SET
                proveedor = 'bbva',
                transaccion_externa = COALESCE(transaccion_externa, ?),
                bbva_status = ?,
                respuesta = ?,
                estatus = 'reembolsado',
                bbva_webhook_at = NOW()
            WHERE id = ?
            `,
            [
                transactionId,
                providerStatus,
                JSON.stringify(verifiedCharge),
                pago.id,
            ]
        );
    } else if (localStatus === 'cancelado') {
        await conn.execute(
            `
            UPDATE pagos_clientes
            SET
                proveedor = 'bbva',
                transaccion_externa = COALESCE(transaccion_externa, ?),
                bbva_status = ?,
                respuesta = ?,
                estatus = CASE
                WHEN estatus = 'pagado' THEN estatus
                ELSE 'cancelado'
                END,
                bbva_webhook_at = NOW()
            WHERE id = ?
            `,
            [
                transactionId,
                providerStatus,
                JSON.stringify(verifiedCharge),
                pago.id,
            ]
        );
    } else {
        await conn.execute(
            `
            UPDATE pagos_clientes
            SET
                proveedor = 'bbva',
                transaccion_externa = COALESCE(transaccion_externa, ?),
                bbva_status = ?,
                respuesta = ?,
                bbva_webhook_at = NOW()
            WHERE id = ?
            `,
            [
                transactionId,
                providerStatus,
                JSON.stringify(verifiedCharge),
                pago.id,
            ]
        );
    }

        await conn.commit();

        return jsonResponse({
            ok: true,
            pago_id: pago.id,
            referencia: pago.referencia,
            transaccion_externa: transactionId,
            bbva_status: providerStatus,
            estatus_local: localStatus,
        });
    } catch (error) {
        await conn.rollback();

        await pool.execute(
            `
            INSERT INTO pagos_webhooks_bbva
                (event_id, provider_transaction_id, order_id, event_type, provider_status, payload, headers, processed, error)
            VALUES (?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), 0, ?)
            ON DUPLICATE KEY UPDATE
            error = VALUES(error),
            payload = VALUES(payload),
            headers = VALUES(headers)
            `,
            [
                webhookInfo.eventId,
                transactionId,
                orderId,
                webhookInfo.eventType,
                providerStatus,
                JSON.stringify(payload),
                JSON.stringify(headersForAudit),
                error instanceof Error ? error.message : String(error),
            ]
        );

    return jsonResponse(
        {
                ok: false,
                error: error instanceof Error ? error.message : 'Error procesando webhook BBVA',
        },
            500
        );
    } finally {
        conn.release();
    }
}