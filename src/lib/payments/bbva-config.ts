// src/lib/payments/bbva-config.ts
function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value || !value.trim()) {
    throw new Error(`Falta variable de entorno requerida: ${name}`);
  }

  return value.trim();
}

export function getBbvaConfig() {
  const baseUrl = requiredEnv('BBVA_BASE_URL').replace(/\/+$/, '');

  return {
    merchantId: requiredEnv('BBVA_MERCHANT_ID'),
    privateKey: requiredEnv('BBVA_PRIVATE_KEY'),
    publicKey: requiredEnv('BBVA_PUBLIC_KEY'),
    baseUrl,
    webhookToken: requiredEnv('BBVA_WEBHOOK_TOKEN'),
    affiliationBbva: requiredEnv('BBVA_AFFILIATION_NUMBER'),
  };
}