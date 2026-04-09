'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [shake, setShake]     = useState(false);
  const userRef = useRef<HTMLInputElement>(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: fd.get('username'), password: fd.get('password') }),
    });

    const data = await res.json();
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
            <p className="text-cnt-red font-mono text-sm tracking-widest uppercase mb-4">Portal de Clientes</p>
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
          <p className="text-gray-500 mb-10 text-sm">Ingresa tus credenciales para acceder al catálogo</p>

          <form onSubmit={handleSubmit} className={shake ? 'animate-shake' : ''}>
            {error && (
              <div className="mb-6 px-4 py-3 bg-red-950 border border-cnt-red rounded-lg text-red-300 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                </svg>
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
                  className="w-full bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  placeholder="tu_usuario"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="text-xs text-gray-400 uppercase tracking-widest">
                    Contraseña
                  </label>
                  <Link href="/forgot-password" className="text-xs text-cnt-red hover:text-red-400 transition-colors">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>
                <input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="mt-8 w-full bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm tracking-wide"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verificando...
                </>
              ) : 'Ingresar al portal'}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-gray-600">
            ¿No tienes cuenta?{' '}
            <a href="mailto:soporte@tvctepa.com" className="text-cnt-red hover:underline">
              Contacta a soporte
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
