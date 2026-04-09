import { pool } from './db';

export async function logAction(
  usuarioId: number | null,
  accion: string,
  modulo: string,
  descripcion?: string,
  ip?: string,
  nivel: 'debug' | 'info' | 'warning' | 'error' = 'info'
): Promise<void> {
  try {
    await pool.execute(
      `INSERT INTO logs_clientes (usuario_id, accion, modulo, descripcion, ip, nivel)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [usuarioId, accion, modulo, descripcion ?? null, ip ?? null, nivel]
    );
  } catch (err) {
    // No lanzar errores desde el logger
    console.error('[Logger] Error writing log:', err);
  }
}
