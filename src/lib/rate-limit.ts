import crypto from 'node:crypto';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { pool } from './db';

type LimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function toMysqlDatetime(date: Date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

export async function consumeRateLimit(
  scope: string,
  rawKey: string,
  limit: number,
  windowSeconds: number,
  blockSeconds: number
): Promise<LimitResult> {
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const keyHash = sha256(rawKey);
    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT id, hits, first_hit_at, last_hit_at, blocked_until
        FROM auth_rate_limits
        WHERE scope = ? AND key_hash = ?
        LIMIT 1
        FOR UPDATE`,
      [scope, keyHash]
    );

    const now = new Date();

    if (!rows.length) {
      await conn.execute(
        `INSERT INTO auth_rate_limits (scope, key_hash, hits, first_hit_at, last_hit_at, blocked_until)
          VALUES (?, ?, 1, ?, ?, NULL)`,
        [scope, keyHash, toMysqlDatetime(now), toMysqlDatetime(now)]
      );

      await conn.commit();
      return { ok: true, remaining: limit - 1 };
    }

    const row = rows[0];
    const blockedUntil = row.blocked_until ? new Date(row.blocked_until) : null;

    if (blockedUntil && blockedUntil > now) {
      await conn.rollback();
      return {
        ok: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((blockedUntil.getTime() - now.getTime()) / 1000)
        ),
      };
    }

    const firstHitAt = new Date(row.first_hit_at);
    const diffSeconds = Math.floor((now.getTime() - firstHitAt.getTime()) / 1000);

    if (diffSeconds >= windowSeconds) {
      await conn.execute(
        `UPDATE auth_rate_limits
          SET hits = 1, first_hit_at = ?, last_hit_at = ?, blocked_until = NULL
          WHERE id = ?`,
        [toMysqlDatetime(now), toMysqlDatetime(now), row.id]
      );

      await conn.commit();
      return { ok: true, remaining: limit - 1 };
    }

    const nextHits = Number(row.hits) + 1;

    if (nextHits > limit) {
      const blockedUntilDate = new Date(now.getTime() + blockSeconds * 1000);

      await conn.execute(
        `UPDATE auth_rate_limits
          SET hits = ?, last_hit_at = ?, blocked_until = ?
          WHERE id = ?`,
        [nextHits, toMysqlDatetime(now), toMysqlDatetime(blockedUntilDate), row.id]
      );

      await conn.commit();
      return { ok: false, retryAfterSeconds: blockSeconds };
    }

    await conn.execute(
      `UPDATE auth_rate_limits
        SET hits = ?, last_hit_at = ?, blocked_until = NULL
        WHERE id = ?`,
      [nextHits, toMysqlDatetime(now), row.id]
    );

    await conn.commit();
    return { ok: true, remaining: limit - nextHits };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}