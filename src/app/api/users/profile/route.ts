// src/app/api/users/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import bcrypt from 'bcryptjs';

const hasOwn = (obj: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const clean = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

type AddressColumn = 'domicilio_1' | 'domicilio_2' | 'domicilio_3';
type AddressSlot = 1 | 2 | 3;

const ADDRESS_COLUMN_MAP: Record<AddressSlot, AddressColumn> = {
  1: 'domicilio_1',
  2: 'domicilio_2',
  3: 'domicilio_3',
};

function isValidSlot(value: unknown): value is AddressSlot {
  return value === 1 || value === 2 || value === 3;
}

function buildDomicilio({
  calle,
  numeroExterior,
  numeroInterior,
  colonia,
  ciudad,
  municipio,
  estado,
  codigoPostal,
  referencias,
}: {
  calle: string;
  numeroExterior: string | null;
  numeroInterior: string | null;
  colonia: string;
  ciudad: string;
  municipio: string;
  estado: string;
  codigoPostal: string;
  referencias: string | null;
}) {
  return [
    `Calle: ${calle}`,
    numeroExterior ? `Num. ext: ${numeroExterior}` : null,
    numeroInterior ? `Num. int: ${numeroInterior}` : null,
    `Colonia: ${colonia}`,
    `Ciudad: ${ciudad}`,
    `Municipio: ${municipio}`,
    `Estado: ${estado}`,
    `CP: ${codigoPostal}`,
    referencias ? `Referencias: ${referencias}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}

async function ensureClienteRow(userId: number, email: string) {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT id FROM clientes_clientes WHERE usuario_id = ?`,
    [userId]
  );

  if (rows.length) return;

  await pool.execute<ResultSetHeader>(
    `INSERT INTO clientes_clientes (usuario_id, email)
     VALUES (?, ?)`,
    [userId, email]
  );
}

// GET /api/users/profile
export async function GET() {
  const session = await getSession();

  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT
        u.id,
        u.username,
        u.email,
        u.rol,
        u.ultimo_login,
        u.created_at,
        cl.nombre,
        cl.apellidos,
        cl.telefono,
        cl.empresa,
        cl.domicilio_1,
        cl.domicilio_2,
        cl.domicilio_3
     FROM usuarios_clientes u
     LEFT JOIN clientes_clientes cl ON cl.usuario_id = u.id
     WHERE u.id = ?`,
    [session.user.id]
  );

  if (!rows.length) {
    return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
  }

  return NextResponse.json(rows[0]);
}

// PATCH /api/users/profile
export async function PATCH(req: NextRequest) {
  const session = await getSession();

  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;

    const {
      nombre,
      apellidos,
      telefono,
      empresa,

      domicilio_slot,
      domicilio_action,

      calle,
      numero_exterior,
      numero_interior,
      colonia,
      ciudad,
      municipio,
      estado,
      codigo_postal,
      referencias,

      password_nuevo,
      password_actual,
    } = body;

    // 1) Cambio de contraseña
    if (password_nuevo) {
      if (!password_actual) {
        return NextResponse.json(
          { error: 'Se requiere la contraseña actual' },
          { status: 400 }
        );
      }

      const [rows] = await pool.execute<RowDataPacket[]>(
        `SELECT password FROM usuarios_clientes WHERE id = ?`,
        [session.user.id]
      );

      if (!rows.length) {
        return NextResponse.json(
          { error: 'Usuario no encontrado' },
          { status: 404 }
        );
      }

      const ok = await bcrypt.compare(String(password_actual), rows[0].password);

      if (!ok) {
        return NextResponse.json(
          { error: 'Contraseña actual incorrecta' },
          { status: 400 }
        );
      }

      const hash = await bcrypt.hash(String(password_nuevo), 12);

      await pool.execute(
        `UPDATE usuarios_clientes SET password = ? WHERE id = ?`,
        [hash, session.user.id]
      );
    }

    const profileKeys = ['nombre', 'apellidos', 'telefono', 'empresa'];
    const hasProfileFields = profileKeys.some((key) => hasOwn(body, key));
    const hasAddressAction = hasOwn(body, 'domicilio_slot') || hasOwn(body, 'domicilio_action');

    if (hasProfileFields || hasAddressAction) {
      await ensureClienteRow(Number(session.user.id), String(session.user.email));

      const updates: string[] = [];
      const params: Array<string | number | null> = [];

      if (hasOwn(body, 'nombre')) {
        updates.push('nombre = ?');
        params.push(clean(nombre));
      }

      if (hasOwn(body, 'apellidos')) {
        updates.push('apellidos = ?');
        params.push(clean(apellidos));
      }

      if (hasOwn(body, 'telefono')) {
        updates.push('telefono = ?');
        params.push(clean(telefono));
      }

      if (hasOwn(body, 'empresa')) {
        updates.push('empresa = ?');
        params.push(clean(empresa));
      }

      if (hasAddressAction) {
        const slot = Number(domicilio_slot);

        if (!isValidSlot(slot)) {
          return NextResponse.json(
            { error: 'domicilio_slot debe ser 1, 2 o 3' },
            { status: 400 }
          );
        }

        const action = String(domicilio_action ?? 'save');
        const column = ADDRESS_COLUMN_MAP[slot];

        if (action === 'delete') {
          updates.push(`${column} = ?`);
          params.push(null);
        } else if (action === 'save') {
          const safeCalle = clean(calle);
          const safeNumeroExterior = clean(numero_exterior);
          const safeNumeroInterior = clean(numero_interior);
          const safeColonia = clean(colonia);
          const safeCiudad = clean(ciudad);
          const safeMunicipio = clean(municipio);
          const safeEstado = clean(estado);
          const safeCodigoPostal = clean(codigo_postal);
          const safeReferencias = clean(referencias);

          if (!safeCalle) {
            return NextResponse.json(
              { error: 'La calle es obligatoria' },
              { status: 400 }
            );
          }

          if (!safeNumeroExterior && !safeNumeroInterior) {
            return NextResponse.json(
              { error: 'Debes capturar número exterior o número interior' },
              { status: 400 }
            );
          }

          if (
            !safeColonia ||
            !safeCiudad ||
            !safeMunicipio ||
            !safeEstado ||
            !safeCodigoPostal
          ) {
            return NextResponse.json(
              {
                error:
                  'Colonia, ciudad, municipio, estado y código postal son obligatorios',
              },
              { status: 400 }
            );
          }

          if (!/^\d{5}$/.test(safeCodigoPostal)) {
            return NextResponse.json(
              { error: 'El código postal debe tener 5 dígitos' },
              { status: 400 }
            );
          }

          const domicilioSerializado = buildDomicilio({
            calle: safeCalle,
            numeroExterior: safeNumeroExterior,
            numeroInterior: safeNumeroInterior,
            colonia: safeColonia,
            ciudad: safeCiudad,
            municipio: safeMunicipio,
            estado: safeEstado,
            codigoPostal: safeCodigoPostal,
            referencias: safeReferencias,
          });

          updates.push(`${column} = ?`);
          params.push(domicilioSerializado);
        } else {
          return NextResponse.json(
            { error: 'domicilio_action debe ser save o delete' },
            { status: 400 }
          );
        }
      }

      if (updates.length) {
        await pool.execute(
          `UPDATE clientes_clientes
           SET ${updates.join(', ')}
           WHERE usuario_id = ?`,
          [...params, session.user.id]
        );
      }
    }

    await logAction(
      session.user.id,
      'actualizar_perfil',
      'usuarios',
      'Perfil actualizado'
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/users/profile error:', error);

    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}