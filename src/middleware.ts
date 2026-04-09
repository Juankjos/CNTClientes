import { NextRequest, NextResponse } from 'next/server';
import { unsealData } from 'iron-session';
import type { SessionData } from '@/lib/session';

const BASE_PATH = '/CNTClientes';
const COOKIE_NAME = 'cnt_session';

const PUBLIC_PATHS = ['/login', '/api/auth/login'];
const ADMIN_PATHS = ['/admin', '/api/admin'];

const rawSessionSecret = process.env.SESSION_SECRET;

if (!rawSessionSecret) {
  throw new Error('SESSION_SECRET no está definido');
}

if (rawSessionSecret.length < 32) {
  throw new Error('SESSION_SECRET debe tener al menos 32 caracteres');
}

const SESSION_SECRET: string = rawSessionSecret;

function normalizePath(pathname: string): string {
  if (pathname === BASE_PATH || pathname === `${BASE_PATH}/`) {
    return '/';
  }

  if (pathname.startsWith(BASE_PATH)) {
    const stripped = pathname.slice(BASE_PATH.length);
    return stripped || '/';
  }

  return pathname;
}

function matchesPath(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function buildUrl(req: NextRequest, path: string): URL {
  return new URL(`${BASE_PATH}${path}`, req.url);
}

export async function middleware(req: NextRequest) {
  const pathname = normalizePath(req.nextUrl.pathname);

  // Ignorar estáticos e internos de Next
  if (
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/assets/') ||
    pathname.match(/\.(?:css|js|map|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/)
  ) {
    return NextResponse.next();
  }

  // Rutas públicas
  if (matchesPath(pathname, PUBLIC_PATHS)) {
    return NextResponse.next();
  }

  const sealedCookie = req.cookies.get(COOKIE_NAME)?.value;

  // Sin cookie -> login
  if (!sealedCookie) {
    return NextResponse.redirect(buildUrl(req, '/login'));
  }

  let session: SessionData | null = null;

  try {
    session = await unsealData<SessionData>(sealedCookie, {
      password: SESSION_SECRET,
    });
  } catch {
    const response = NextResponse.redirect(buildUrl(req, '/login'));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  if (!session?.user) {
    const response = NextResponse.redirect(buildUrl(req, '/login'));
    response.cookies.delete(COOKIE_NAME);
    return response;
  }

  // Rutas admin
  if (matchesPath(pathname, ADMIN_PATHS) && session.user.rol !== 'admin') {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 });
    }

    return NextResponse.redirect(buildUrl(req, '/catalog'));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/:path*'],
};