// src/lib/payments/bbva-api.ts
import { getBbvaConfig } from './bbva-config';

export type BbvaCharge = Record<string, any>;

type CreateBbvaRedirectChargeInput = {
  amount: number;
  currency: string;
  description: string;
  orderId: string;
  redirectUrl: string;
  clientIp?: string | null;
  customer: {
    name: string;
    lastName?: string | null;
    email: string;
    phone?: string | null;
  };
};

function basicAuthHeader(privateKey: string) {
  const token = Buffer.from(`${privateKey}:`).toString('base64');
  return `Basic ${token}`;
}

function getPaymentUrlFromCharge(charge: any) {
  return (
    charge?.payment_method?.url ||
    charge?.transaction?.url ||
    charge?.url ||
    null
  );
}

export async function createBbvaRedirectCharge(
  input: CreateBbvaRedirectChargeInput
): Promise<{
  charge: BbvaCharge;
  transactionId: string | null;
  paymentUrl: string;
}> {
  const config = getBbvaConfig();

  const url = `${config.baseUrl}/${encodeURIComponent(config.merchantId)}/charges`;

  const amount = Number(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`Monto inválido para BBVA: ${input.amount}`);
  }

  const customer: Record<string, any> = {
    name: input.customer.name || 'Cliente',
    last_name: input.customer.lastName?.trim() || 'Cliente',
    email: input.customer.email,
  };

  if (input.customer.phone?.trim()) {
    customer.phone_number = input.customer.phone.trim();
  }

  const body = {
    affiliation_bbva: config.affiliationBbva,
    amount: Math.round(amount * 100) / 100,
    description: input.description.slice(0, 250),
    currency: input.currency,
    order_id: input.orderId,
    redirect_url: input.redirectUrl,
    customer,
    use_3d_secure: true,
  };

  const headers: Record<string, string> = {
    Authorization: basicAuthHeader(config.privateKey),
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (input.clientIp) {
    headers['X-Forwarded-For'] = input.clientIp;
  }

  console.log('[BBVA] Payload create charge:', {
    url,
    body: {
      ...body,
      affiliation_bbva: '[affiliation enviada]',
      customer: {
        ...customer,
        email: customer.email ? '[email enviado]' : null,
      },
    },
  });

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    console.error('[BBVA] Error al crear cargo:', {
      status: res.status,
      response: data,
      sentBody: {
        ...body,
        affiliation_bbva: '[affiliation enviada]',
        customer: {
          ...customer,
          email: customer.email ? '[email enviado]' : null,
        },
      },
    });

    throw new Error(
      `BBVA charge creation failed: HTTP ${res.status} ${JSON.stringify(data)}`
    );
  }

  const paymentUrl = getPaymentUrlFromCharge(data);

  if (!paymentUrl) {
    console.error('[BBVA] Respuesta sin URL de pago:', JSON.stringify(data, null, 2));

    throw new Error(
      `BBVA no regresó URL de pago. Respuesta: ${JSON.stringify(data)}`
    );
  }

  return {
    charge: data,
    transactionId: data?.id ? String(data.id) : null,
    paymentUrl,
  };
}

export async function getBbvaCharge(transactionId: string): Promise<BbvaCharge> {
  const config = getBbvaConfig();

  const url = `${config.baseUrl}/${encodeURIComponent(
    config.merchantId
  )}/charges/${encodeURIComponent(transactionId)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: basicAuthHeader(config.privateKey),
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(
      `BBVA charge lookup failed: HTTP ${res.status} ${JSON.stringify(data)}`
    );
  }

  return data;
}