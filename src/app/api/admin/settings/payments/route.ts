//src/app/api/admin/settings/payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  return !session.user || session.user.rol !== 'admin';
}

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
    const session = await getSession();

    if (requireAdmin(session)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

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
    console.error('[GET /api/admin/settings/payments]', error);
    return NextResponse.json(
      { error: 'Error interno al obtener configuración de pagos' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSession();

    if (requireAdmin(session)) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const body = await req.json();
    const paymentsEnabled = Boolean(body.payments_enabled);

    await pool.execute(
      `
      INSERT INTO app_settings (\`key\`, \`value\`)
      VALUES ('payments_enabled', CAST(? AS JSON))
      ON DUPLICATE KEY UPDATE
        \`value\` = VALUES(\`value\`),
        updated_at = CURRENT_TIMESTAMP
      `,
      [JSON.stringify(paymentsEnabled)]
    );

    return NextResponse.json({
      ok: true,
      payments_enabled: paymentsEnabled,
    });
  } catch (error) {
    console.error('[PATCH /api/admin/settings/payments]', error);
    return NextResponse.json(
      { error: 'Error interno al actualizar configuración de pagos' },
      { status: 500 }
    );
  }
}