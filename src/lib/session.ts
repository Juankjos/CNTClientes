import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import type { SessionUser } from '@/types';

export interface SessionData {
  user?: SessionUser;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET ?? '',
  cookieName: 'cnt_session',
  cookieOptions: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
    path:     '/CNTClientes',
    maxAge:   60 * 60 * 8, // 8 horas
  },
};

export async function getSession(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SessionData>(cookieStore, sessionOptions);
}
