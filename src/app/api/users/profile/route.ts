// src/app/api/users/profile/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { pool } from '@/lib/db';
import { logAction } from '@/lib/logger';
import type { RowDataPacket } from 'mysql2';
import bcrypt from 'bcryptjs';

const hasOwn = (obj: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const clean = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
};

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

// GET /api/users/profile
export async function GET() {
  const session = await getSession();
  if (!session.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT u.id, u.username, u.email, u.rol, u.ultimo_login, u.created_at,
            cl.nombre, cl.apellidos, cl.telefono, cl.empresa, cl.domicilio
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
    const body = await req.json();

    const {
      nombre,
      apellidos,
      telefono,
      empresa,

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
    } = body as Record<string, unknown>;

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
    const addressKeys = [
      'calle',
      'numero_exterior',
      'numero_interior',
      'colonia',
      'ciudad',
      'municipio',
      'estado',
      'codigo_postal',
      'referencias',
    ];

    const hasProfileFields = profileKeys.some((key) => hasOwn(body, key));
    const hasAddressFields = addressKeys.some((key) => hasOwn(body, key));
    const hasClienteFields = hasProfileFields || hasAddressFields;

    if (hasClienteFields) {
      const [exists] = await pool.execute<RowDataPacket[]>(
        `SELECT id, domicilio FROM clientes_clientes WHERE usuario_id = ?`,
        [session.user.id]
      );

      const safeNombre = clean(nombre);
      const safeApellidos = clean(apellidos);
      const safeTelefono = clean(telefono);
      const safeEmpresa = clean(empresa);

      let safeDomicilio = exists.length ? (exists[0].domicilio ?? null) : null;

      if (hasAddressFields) {
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
          return NextResponse.json({ error: 'La calle es obligatoria' }, { status: 400 });
        }

        if (!safeNumeroExterior && !safeNumeroInterior) {
          return NextResponse.json(
            { error: 'Debes capturar número exterior o número interior' },
            { status: 400 }
          );
        }

        if (!safeColonia || !safeCiudad || !safeMunicipio || !safeEstado || !safeCodigoPostal) {
          return NextResponse.json(
            { error: 'Colonia, ciudad, municipio, estado y código postal son obligatorios' },
            { status: 400 }
          );
        }

        if (!/^\d{5}$/.test(safeCodigoPostal)) {
          return NextResponse.json(
            { error: 'El código postal debe tener 5 dígitos' },
            { status: 400 }
          );
        }

        safeDomicilio = buildDomicilio({
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
      }

      if (exists.length) {
        await pool.execute(
          `UPDATE clientes_clientes
           SET nombre = ?, apellidos = ?, telefono = ?, empresa = ?, domicilio = ?
           WHERE usuario_id = ?`,
          [
            safeNombre,
            safeApellidos,
            safeTelefono,
            safeEmpresa,
            safeDomicilio,
            session.user.id,
          ]
        );
      } else {
        await pool.execute(
          `INSERT INTO clientes_clientes
           (usuario_id, nombre, apellidos, telefono, empresa, domicilio, email)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            session.user.id,
            safeNombre,
            safeApellidos,
            safeTelefono,
            safeEmpresa,
            safeDomicilio,
            session.user.email,
          ]
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