// src/app/api/catalog/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';

// GET /api/catalog — Lista paginada del catálogo (requiere sesión)
export async function GET(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);

    const rawPage = Number(searchParams.get('page') ?? '1');
    const rawLimit = Number(searchParams.get('limit') ?? '12');

    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit =
      Number.isInteger(rawLimit) && rawLimit > 0
        ? Math.min(rawLimit, 24)
        : 12;

    const categoria = (searchParams.get('categoria') ?? '').trim();
    const busqueda = (searchParams.get('q') ?? '').trim();
    const offset = (page - 1) * limit;

    let where = 'WHERE c.activo = 1';
    const params: (string | number)[] = [];

    if (categoria) {
      where += ' AND c.categoria = ?';
      params.push(categoria);
    }

    if (busqueda) {
      where += ' AND (c.titulo LIKE ? OR c.descripcion LIKE ?)';
      params.push(`%${busqueda}%`, `%${busqueda}%`);
    }

    const sql = `
      SELECT c.*, 0 AS ya_pagado
      FROM catalogo_clientes c
      ${where}
      ORDER BY c.fecha_publicacion DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await pool.execute<RowDataPacket[]>(sql, params);

    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
       FROM catalogo_clientes c
       ${where}`,
      params
    );

    const total = Number(countRows[0]?.total ?? 0);

    return NextResponse.json({
      items: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('[GET /api/catalog] Error:', error);

    return NextResponse.json(
      { error: 'Error interno al listar catálogo' },
      { status: 500 }
    );
  }
}

// POST /api/catalog — Crear ítem (solo admin)
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();

    if (!session.user || session.user.rol !== 'admin') {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    const body = await req.json();
    const { titulo, descripcion, categoria, precio, imagen, archivo } = body;

    if (!titulo || !categoria) {
      return NextResponse.json(
        { error: 'Título y categoría son requeridos' },
        { status: 400 }
      );
    }

    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO catalogo_clientes (titulo, descripcion, categoria, precio, imagen, archivo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [titulo, descripcion ?? null, categoria, precio ?? 0, imagen ?? null, archivo ?? null]
    );

    await logAction(
      session.user.id,
      'crear_catalogo',
      'catalogo',
      `ID: ${result.insertId} — ${titulo}`
    );

    return NextResponse.json({ ok: true, id: result.insertId }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/catalog] Error:', error);

    return NextResponse.json(
      { error: 'Error interno al crear item' },
      { status: 500 }
    );
  }
}