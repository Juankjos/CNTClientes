import { pool } from '@/lib/db';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';

export type NotificationType =
  | 'nueva_peticion'
  | 'comentario_admin'
  | 'cambio_estatus'
  | 'cambio_fecha'
  | 'archivos_eliminados';

type CreateNotificationInput = {
  usuarioId: number;
  actorUsuarioId?: number | null;
  peticionId?: number | null;
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  url?: string | null;
};

export async function createNotification(input: CreateNotificationInput) {
  await pool.execute<ResultSetHeader>(
    `
    INSERT INTO notificaciones_clientes
      (usuario_id, actor_usuario_id, peticion_id, tipo, titulo, mensaje, url)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      input.usuarioId,
      input.actorUsuarioId ?? null,
      input.peticionId ?? null,
      input.tipo,
      input.titulo,
      input.mensaje,
      input.url ?? null,
    ]
  );
}

export async function notifyAdmins(input: {
  actorUsuarioId?: number | null;
  peticionId?: number | null;
  tipo: NotificationType;
  titulo: string;
  mensaje: string;
  url?: string | null;
}) {
  const [admins] = await pool.execute<RowDataPacket[]>(
    `
    SELECT id
    FROM usuarios_clientes
    WHERE rol = 'admin'
      AND activo = 1
    `
  );

  if (!admins.length) return;

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        usuarioId: Number(admin.id),
        actorUsuarioId: input.actorUsuarioId ?? null,
        peticionId: input.peticionId ?? null,
        tipo: input.tipo,
        titulo: input.titulo,
        mensaje: input.mensaje,
        url: input.url ?? '/admin',
      })
    )
  );
}