// src/app/(auth)/login/page.tsx
'use client';

import { Suspense, useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';

const verificationMessages: Record<
  string,
  { type: 'success' | 'error'; text: string }
> = {
  success: {
    type: 'success',
    text: 'Tu correo fue verificado correctamente. Ya puedes iniciar sesión.',
  },
  already_verified: {
    type: 'success',
    text: 'Tu correo ya estaba verificado. Ya puedes iniciar sesión.',
  },
  expired: {
    type: 'error',
    text: 'El enlace de verificación expiró. Solicita uno nuevo.',
  },
  invalid: {
    type: 'error',
    text: 'El enlace de verificación no es válido.',
  },
  error: {
    type: 'error',
    text: 'Ocurrió un error al verificar tu correo. Inténtalo más tarde.',
  },
};

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    userRef.current?.focus();
  }, []);

  const verifiedStatus = searchParams.get('verified');
  const verifiedMessage = verifiedStatus
    ? verificationMessages[verifiedStatus]
    : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const fd = new FormData(e.currentTarget);

    const res = await fetch(apiPath('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: fd.get('username'),
        password: fd.get('password'),
      }),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error ?? 'Error de autenticación');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      return;
    }

    router.push('/catalog');
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-cnt-dark flex">
      {/* Panel izquierdo — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cnt-red via-cnt-dark to-black" />
        <div className="absolute inset-0 opacity-10"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 40px,rgba(255,255,255,.05) 40px,rgba(255,255,255,.05) 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,rgba(255,255,255,.05) 40px,rgba(255,255,255,.05) 41px)' }}
        />
        <div className="relative z-10 flex flex-col justify-between p-12 text-white">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-cnt-red rounded-sm flex items-center justify-center">
                <span className="text-white font-black text-xs">CNT</span>
              </div>
              <span className="font-display text-xl tracking-wide">Televisión Por Cable Tepa</span>
            </div>
            <div className="w-12 h-0.5 bg-cnt-red mt-4" />
          </div>

          <div>
            <h1 className="font-display text-5xl font-bold leading-tight mb-6">
              Noticias,<br />Reportajes<br />& Entrevistas
            </h1>
            <p className="text-gray-400 text-lg leading-relaxed max-w-sm">
              Accede al catálogo exclusivo de contenido periodístico de TV Cable Tepa.
            </p>
          </div>

          <div className="flex gap-6 text-xs text-gray-600">
            <span>© 2025 TV Cable Tepa</span>
            <span>Tepatitlán de Morelos, Jalisco</span>
          </div>
        </div>
      </div>

      {/* Panel derecho — formulario */}
      <div className="flex-1 flex items-center justify-center p-8 bg-cnt-dark">
        <div className="w-full max-w-md">
          {/* Logo mobile */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-8 h-8 bg-cnt-red rounded-sm flex items-center justify-center">
              <span className="text-white font-black text-xs">CNT</span>
            </div>
            <span className="font-display text-xl text-white tracking-wide">TV Cable Tepa</span>
          </div>

          <h2 className="font-display text-3xl text-white mb-2">Iniciar sesión</h2>

          {verifiedMessage && (
            <div
              className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
                verifiedMessage.type === 'success'
                  ? 'bg-green-950 border-green-800 text-green-300'
                  : 'bg-red-950 border-cnt-red text-red-300'
              }`}
            >
              {verifiedMessage.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className={shake ? 'animate-shake' : ''}>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-950 border border-cnt-red rounded-lg text-red-300 text-sm">
                {error}
              </div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Usuario
                </label>
                <input
                  ref={userRef}
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  placeholder="Usuario"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest">
                    Contraseña
                  </label>
                  {/* <Link
                    href="/forgot-password"
                    className="text-xs text-cnt-blue hover:text-cnt-blue transition-colors"
                  >
                    ¿Olvidaste tu contraseña?
                  </Link> */}
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-cnt-surface border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-blue transition-colors"
                  placeholder="Contraseña"
                />
                <Link
                  href="/forgot-password"
                  className="text-xs text-cnt-blue hover:text-cnt-blue transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="cursor-pointer mt-8 w-full bg-cnt-blue hover:bg-blue-700 disabled:bg-blue-900 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
            >
              {loading ? 'Verificando...' : 'Ingresar'}
            </button>

            <Link
              href="https://nube.tvctepa.com/CNTClientes/register"
              className="mt-4 block w-full text-center border border-cnt-border hover:border-cnt-red text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
            >
              ¿No tienes cuenta? Regístrate
            </Link>
          </form>
        </div>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="min-h-screen bg-cnt-dark flex">
      <div className="flex-1 flex items-center justify-center p-8 bg-cnt-dark">
        <div className="w-full max-w-md" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}