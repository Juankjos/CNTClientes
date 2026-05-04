// src/app/api/admin/catalog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

const VALID_CATEGORIAS = new Set(['reportaje', 'noticia', 'entrevista', 'especial']);

function toBool(value: unknown, fallback = false) {
    if (value === undefined || value === null) return fallback;
    return value === true || value === 1 || value === '1';
}

function parseBlockedDates(value: unknown): string[] {
    if (!Array.isArray(value)) return [];

    return Array.from(
        new Set(
            value
            .map((v) => String(v).trim())
            .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
        )
    ).sort();
}

function requireAdmin(session: Awaited<ReturnType<typeof getSession>>) {
    return !session.user || session.user.rol !== 'admin';
}

function normalizeCategoria(value: unknown) {
    return String(value ?? '').trim().toLowerCase();
}

// GET - listar todos incluyendo inactivos
export async function GET() {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const [rows] = await pool.execute<RowDataPacket[]>(
        `
        SELECT
            id,
            titulo,
            descripcion,
            categoria,
            usa_rango_fechas,
            rango_dias,
            bloquea_sabado,
            bloquea_domingo,
            bloquea_dias_festivos,
            incluye_fines_semana,
            incluye_dias_festivos,
            bloquea_fechas_personalizadas,
            fechas_bloqueadas_json,
            precio,
            imagen,
            archivo,
            activo,
            fecha_publicacion
        FROM catalogo_clientes
        ORDER BY fecha_publicacion DESC
        `
        );

        return NextResponse.json(rows);
    } catch (error) {
        console.error('[GET /api/admin/catalog] Error:', error);
        return NextResponse.json(
        { error: 'Error interno al listar catálogo' },
        { status: 500 }
        );
    }
}

// POST - crear nuevo item
export async function POST(req: NextRequest) {
    try {
        const session = await getSession();

        if (requireAdmin(session)) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
        }

        const body = await req.json();

        const {
            titulo,
            descripcion,
            categoria,
            precio,
            imagen,
            activo,
            usa_rango_fechas,
            rango_dias,
            bloquea_sabado,
            bloquea_domingo,
            bloquea_dias_festivos,
            bloquea_fechas_personalizadas,
            fechas_bloqueadas,
        } = body;

        const categoriaNormalizada = normalizeCategoria(categoria);

        if (!titulo || !categoriaNormalizada) {
            return NextResponse.json(
                { error: 'Faltan campos requeridos' },
                { status: 400 }
            );
        }

        if (!VALID_CATEGORIAS.has(categoriaNormalizada)) {
            return NextResponse.json(
                { error: 'Categoría inválida' },
                { status: 400 }
            );
        }

        const usaRango = toBool(usa_rango_fechas);
        const rangoDias = usaRango ? Number(rango_dias) : null;

        if (usaRango && (!Number.isInteger(rangoDias) || Number(rangoDias) <= 0)) {
            return NextResponse.json(
                { error: 'El total de días del rango debe ser un entero mayor a 0.' },
                { status: 400 }
            );
        }

        const bloqueaSabado = usaRango ? toBool(bloquea_sabado) : false;
        const bloqueaDomingo = usaRango ? toBool(bloquea_domingo) : false;
        const bloqueaDiasFestivos = usaRango ? toBool(bloquea_dias_festivos) : false;

        // Compatibilidad con columnas viejas. Ya no son fuente de verdad.
        const incluyeFinesSemana = !(bloqueaSabado || bloqueaDomingo);
        const incluyeDiasFestivos = !bloqueaDiasFestivos;

        const bloqueaFechasPersonalizadas = usaRango
        ? toBool(bloquea_fechas_personalizadas)
        : false;

        const fechasBloqueadas = bloqueaFechasPersonalizadas
        ? parseBlockedDates(fechas_bloqueadas)
        : [];

        if (bloqueaFechasPersonalizadas && fechasBloqueadas.length === 0) {
        return NextResponse.json(
            { error: 'Debes seleccionar al menos una fecha personalizada bloqueada.' },
            { status: 400 }
        );
        }

        const [result] = await pool.execute<ResultSetHeader>(
        `
        INSERT INTO catalogo_clientes
        (
            titulo,
            descripcion,
            categoria,
            usa_rango_fechas,
            rango_dias,
            bloquea_sabado,
            bloquea_domingo,
            bloquea_dias_festivos,
            incluye_fines_semana,
            incluye_dias_festivos,
            bloquea_fechas_personalizadas,
            fechas_bloqueadas_json,
            precio,
            imagen,
            activo
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            String(titulo).trim(),
            descripcion || null,
            categoriaNormalizada,
            usaRango ? 1 : 0,
            usaRango ? rangoDias : null,
            bloqueaSabado ? 1 : 0,
            bloqueaDomingo ? 1 : 0,
            bloqueaDiasFestivos ? 1 : 0,
            incluyeFinesSemana ? 1 : 0,
            incluyeDiasFestivos ? 1 : 0,
            bloqueaFechasPersonalizadas ? 1 : 0,
            bloqueaFechasPersonalizadas ? JSON.stringify(fechasBloqueadas) : null,
            precio || 0,
            imagen || null,
            activo ? 1 : 0,
        ]
        );

        return NextResponse.json(
            { ok: true, id: result.insertId },
            { status: 201 }
        );
    } catch (error) {
        console.error('[POST /api/admin/catalog] Error:', error);
        return NextResponse.json(
            { error: 'Error interno al crear item' },
            { status: 500 }
        );
    }
}