// src/app/api/payments/bbva/return/route.ts
import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { getBbvaCharge } from '@/lib/payments/bbva-api';
import {
    extractBbvaChargeInfo,
    isMoneyEqual,
    mapBbvaStatusToLocal,
} from '@/lib/payments/bbva-webhook';

export const runtime = 'nodejs';

type CheckoutRow = RowDataPacket & {
    id: number;
    cliente_id: number;
    catalogo_id: number;

    referencia: string;
    monto: string | number;
    moneda: string;

    catalogo_titulo: string | null;
    catalogo_descripcion: string | null;
    catalogo_categoria: string | null;
    catalogo_imagen: string | null;
    catalogo_archivo: string | null;
    catalogo_snapshot: unknown;

    provider_transaction_id: string | null;
    provider_status: string | null;
    estatus: 'creado' | 'pendiente' | 'pagado' | 'cancelado' | 'fallido' | 'expirado';
    pago_id: number | null;

    usuario_id: number;
};

function getAppBaseUrl(req: NextRequest) {
    const configuredUrl =
        process.env.APP_URL ||
        process.env.NEXT_PUBLIC_APP_URL;

    if (configuredUrl?.trim()) {
        return configuredUrl.trim().replace(/\/+$/, '');
    }

    const pathname = req.nextUrl.pathname;
    const apiIndex = pathname.indexOf('/api/');

    const detectedBasePath =
        apiIndex > 0
        ? pathname.slice(0, apiIndex)
        : process.env.BASE_PATH || process.env.NEXT_PUBLIC_BASE_PATH || '';

    return `${req.nextUrl.origin}${detectedBasePath}`.replace(/\/+$/, '');
}

function redirectToCatalog(req: NextRequest, catalogoId: number, extra = '') {
    const baseUrl = getAppBaseUrl(req);
    return NextResponse.redirect(`${baseUrl}/catalog/${catalogoId}${extra}`);
}

function redirectToPayment(req: NextRequest, pagoId: number, extra = '') {
    const baseUrl = getAppBaseUrl(req);
    return NextResponse.redirect(`${baseUrl}/payments/${pagoId}${extra}`);
}

function normalizeJsonForDb(value: unknown) {
    if (typeof value === 'string') return value;
    return JSON.stringify(value ?? null);
}

async function createPagoPagadoDesdeCheckout({
    checkout,
    transactionId,
    providerStatus,
    charge,
}: {
    checkout: CheckoutRow;
    transactionId: string;
    providerStatus: string | null;
    charge: unknown;
}) {
    const [insertResult] = await pool.execute<ResultSetHeader>(
        `
        INSERT INTO pagos_clientes
            (
            cliente_id,
            catalogo_id,

            catalogo_titulo,
            catalogo_descripcion,
            catalogo_categoria,
            catalogo_imagen,
            catalogo_archivo,
            catalogo_snapshot,

            referencia,
            monto,
            moneda,
            metodo_pago,
            proveedor,
            transaccion_externa,
            bbva_status,
            respuesta,
            estatus,
            pagado_at,
            bbva_webhook_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'bbva', 'bbva', ?, ?, ?, 'pagado', NOW(), NOW())
            ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            proveedor = 'bbva',
            transaccion_externa = VALUES(transaccion_externa),
            bbva_status = VALUES(bbva_status),
            respuesta = VALUES(respuesta),
            estatus = 'pagado',
            pagado_at = COALESCE(pagado_at, NOW()),
            bbva_webhook_at = NOW()
        `,
        [
        checkout.cliente_id,
        checkout.catalogo_id,

        checkout.catalogo_titulo,
        checkout.catalogo_descripcion,
        checkout.catalogo_categoria,
        checkout.catalogo_imagen,
        checkout.catalogo_archivo,
        normalizeJsonForDb(checkout.catalogo_snapshot),

        checkout.referencia,
        checkout.monto,
        checkout.moneda,

        transactionId,
        providerStatus,
        JSON.stringify(charge),
        ]
    );

    const pagoId = Number(insertResult.insertId);

    await pool.execute(
        `
        UPDATE pagos_checkout_bbva
            SET
            estatus = 'pagado',
            provider_transaction_id = COALESCE(provider_transaction_id, ?),
            provider_status = ?,
            provider_response = ?,
            pago_id = ?,
            paid_at = COALESCE(paid_at, NOW())
            WHERE id = ?
        `,
        [
        transactionId,
        providerStatus,
        JSON.stringify(charge),
        pagoId,
        checkout.id,
        ]
    );

    return pagoId;
}

export async function GET(req: NextRequest) {
    const rawCheckoutId = req.nextUrl.searchParams.get('checkout_id');
    const checkoutId = Number(rawCheckoutId);

    if (!Number.isInteger(checkoutId) || checkoutId <= 0) {
        const baseUrl = getAppBaseUrl(req);
        return NextResponse.redirect(`${baseUrl}/catalog?bbva_error=checkout_invalido`);
    }

    try {
        const session = await getSession();

        const [rows] = await pool.execute<CheckoutRow[]>(
        `
        SELECT
            ch.*,
            cl.usuario_id
        FROM pagos_checkout_bbva ch
        INNER JOIN clientes_clientes cl ON cl.id = ch.cliente_id
        WHERE ch.id = ?
        LIMIT 1
        `,
        [checkoutId]
        );

        const checkout = rows[0];

        if (!checkout) {
            const baseUrl = getAppBaseUrl(req);
            return NextResponse.redirect(`${baseUrl}/catalog?bbva_error=checkout_no_encontrado`);
        }

        if (!session.user || Number(session.user.id) !== Number(checkout.usuario_id)) {
            return redirectToCatalog(
                req,
                checkout.catalogo_id,
                '?bbva_error=no_autorizado'
            );
            }

            if (checkout.pago_id && checkout.estatus === 'pagado') {
            return redirectToPayment(req, Number(checkout.pago_id), '?bbva_status=pagado');
        }

        const transactionId =
            req.nextUrl.searchParams.get('id') ||
            req.nextUrl.searchParams.get('transaction_id') ||
            req.nextUrl.searchParams.get('charge_id') ||
            checkout.provider_transaction_id;

        if (!transactionId) {
            await pool.execute(
                `
                UPDATE pagos_checkout_bbva
                SET estatus = 'pendiente'
                WHERE id = ?
                `,
                [checkout.id]
            );

            return redirectToCatalog(
                req,
                checkout.catalogo_id,
                '?bbva_status=pendiente'
            );
        }

        const charge = await getBbvaCharge(transactionId);
        const chargeInfo = extractBbvaChargeInfo(charge);

        if (chargeInfo.orderId && chargeInfo.orderId !== checkout.referencia) {
            throw new Error(
                `order_id no coincide. Local=${checkout.referencia}, BBVA=${chargeInfo.orderId}`
            );
        }

        if (
            chargeInfo.amount !== null &&
            !isMoneyEqual(checkout.monto, chargeInfo.amount)
        ) {
            throw new Error(
                `Monto no coincide. Local=${checkout.monto}, BBVA=${chargeInfo.amount}`
            );
        }

        if (
            chargeInfo.currency &&
            checkout.moneda &&
            chargeInfo.currency.toUpperCase() !== checkout.moneda.toUpperCase()
        ) {
            throw new Error(
                `Moneda no coincide. Local=${checkout.moneda}, BBVA=${chargeInfo.currency}`
            );
        }

        const localStatus = mapBbvaStatusToLocal(chargeInfo.rawStatus);

        if (localStatus !== 'pagado') {
            await pool.execute(
                `
                UPDATE pagos_checkout_bbva
                SET
                estatus = ?,
                provider_transaction_id = COALESCE(provider_transaction_id, ?),
                provider_status = ?,
                provider_response = ?
                WHERE id = ?
                `,
                [
                localStatus === 'cancelado' ? 'cancelado' : 'pendiente',
                transactionId,
                chargeInfo.rawStatus,
                JSON.stringify(charge),
                checkout.id,
                ]
            );

            return redirectToCatalog(
                req,
                checkout.catalogo_id,
                `?bbva_status=${localStatus}`
            );
        }

        const pagoId = await createPagoPagadoDesdeCheckout({
            checkout,
            transactionId,
            providerStatus: chargeInfo.rawStatus,
            charge,
        });

        return redirectToPayment(req, pagoId, '?bbva_status=pagado');
    } catch (error) {
        console.error('[GET /api/payments/bbva/return]', error);

        await pool.execute(
        `
        UPDATE pagos_checkout_bbva
        SET
            estatus = 'fallido',
            error = ?
        WHERE id = ?
        `,
        [
            error instanceof Error ? error.message : String(error),
            checkoutId,
        ]
        );

        const baseUrl = getAppBaseUrl(req);
        return NextResponse.redirect(`${baseUrl}/catalog?bbva_error=sync_failed`);
    }
}