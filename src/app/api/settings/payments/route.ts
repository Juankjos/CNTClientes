//src/app/api/settings/payments/route.ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

function parseSettingBoolean(value: unknown, fallback = true) {
  let parsed = value;

  if (Buffer.isBuffer(parsed)) {
    parsed = parsed.toString('utf8');
  }

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return fallback;
    }
  }

  if (typeof parsed === 'boolean') return parsed;
  if (typeof parsed === 'number') return parsed === 1;

  return fallback;
}

export async function GET() {
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT value FROM app_settings WHERE \`key\` = 'payments_enabled' LIMIT 1`
    );

    const paymentsEnabled = rows.length
      ? parseSettingBoolean(rows[0].value, true)
      : true;

    return NextResponse.json({
      payments_enabled: paymentsEnabled,
    });
  } catch (error) {
    console.error('[GET /api/settings/payments]', error);

    return NextResponse.json({
      payments_enabled: true,
    });
  }
}