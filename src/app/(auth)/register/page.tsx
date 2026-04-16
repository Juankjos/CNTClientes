// src/app/(auth)/register/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

export default function RegisterPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const fd = new FormData(e.currentTarget);

    const payload = {
        username: fd.get('username'),
        email: fd.get('email'),
        password: fd.get('password'),
        confirmPassword: fd.get('confirmPassword'),
        nombre: fd.get('nombre'),
        apellidos: fd.get('apellidos'),
        telefono: fd.get('telefono'),
        empresa: fd.get('empresa'),
        captchaToken: fd.get('captchaToken'),
    };

    const res = await fetch(apiPath('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? 'No se pudo completar el registro' });
        return;
    }

    setMsg({
        type: 'ok',
        text: data.message ?? 'Cuenta creada. Revisa tu correo para verificarla.',
    });

    e.currentTarget.reset();
    setTimeout(() => router.push('/login'), 1800);
  }

  return (
    <div className="min-h-screen bg-cnt-dark flex items-center justify-center p-8">
      <div className="w-full max-w-2xl bg-cnt-surface border border-cnt-border rounded-2xl p-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl text-white mb-2">Crear cuenta</h1>
          <p className="text-gray-500 text-sm">
            Regístrate para acceder al catálogo de CNT Clientes.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {msg && (
            <div
              className={`rounded-lg px-4 py-3 text-sm border ${
                msg.type === 'ok'
                  ? 'bg-green-950 text-green-300 border-green-800'
                  : 'bg-red-950 text-red-300 border-cnt-red'
              }`}
            >
              {msg.text}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="nombre" required placeholder="Nombre"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
            <input name="apellidos" required placeholder="Apellidos"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="w-full">
              <input
                name="username"
                required
                placeholder="Usuario"
                className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
              />
            </div>

            <div className="w-full">
              <input
                name="email"
                type="email"
                required
                placeholder="Correo electrónico"
                className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red"
              />
              <p className="mt-2 text-gray-500 text-sm text-right">
                Te enviaremos un correo de verificación para activar tu cuenta.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="telefono" placeholder="Teléfono"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
            <input name="empresa" placeholder="Empresa"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input name="password" type="password" required placeholder="Contraseña"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
            <input name="confirmPassword" type="password" required placeholder="Confirmar contraseña"
              className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-red" />
          </div>

          <div className="rounded-lg border border-dashed border-cnt-border p-4 text-sm text-gray-400">
            CAPTCHA
            <input type="hidden" name="captchaToken" value="token-del-captcha" />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white font-semibold py-3 px-6 rounded-lg transition-all text-sm cursor-pointer"
          >
            {loading ? 'Creando cuenta...' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-cnt-red hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}