import mysql from 'mysql2/promise';

declare global {
  // Evita múltiples pools en hot-reload de Next.js
  // eslint-disable-next-line no-var
  var _mysqlPool: mysql.Pool | undefined;
}

function createPool(): mysql.Pool {
  return mysql.createPool({
    host:               process.env.DB_HOST     ?? '192.168.2.68',
    port:               Number(process.env.DB_PORT ?? 3306),
    database:           process.env.DB_NAME     ?? 'cnt',
    user:               process.env.DB_USER     ?? 'DB_ADMIN',
    password:           process.env.DB_PASS,
    charset:            process.env.DB_CHARSET  ?? 'utf8mb4',
    waitForConnections: true,
    connectionLimit:    10,
    queueLimit:         0,
    timezone:           '-06:00', // CST México
  });
}

export const pool: mysql.Pool =
  global._mysqlPool ?? (global._mysqlPool = createPool());
