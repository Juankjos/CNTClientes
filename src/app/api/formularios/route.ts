// src/app/api/formularios/route.ts
import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
    const session = await getSession();
    const user = session.user;

    if (!user) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    if (user.rol !== 'cliente') {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const [rows]: any = await pool.query(
        `
        SELECT
            p.id AS pago_id,
            p.catalogo_id,
            p.estatus,
            p.referencia,
            p.monto,
            p.created_at,
            p.pagado_at,
            c.titulo AS servicio,
            c.descripcion,
            c.categoria,

            pc.id AS peticion_id,
            pc.motivo,
            pc.descripcion AS peticion_descripcion,
            pc.usar_domicilio,
            pc.domicilio_slot,
            pc.fecha_deseada,
            pc.created_at AS peticion_created_at,
            pc.updated_at AS peticion_updated_at

        FROM pagos_clientes p
        INNER JOIN clientes_clientes cc
            ON cc.id = p.cliente_id
        INNER JOIN catalogo_clientes c
            ON c.id = p.catalogo_id
        LEFT JOIN peticiones_clientes pc
            ON pc.pago_id = p.id

        WHERE cc.usuario_id = ?
        ORDER BY p.created_at DESC
        `,
        [user.id]
    );

    return NextResponse.json({
        items: rows.map((row: any) => ({
        ...row,
        tiene_peticion: Boolean(row.peticion_id),
        })),
    });
}