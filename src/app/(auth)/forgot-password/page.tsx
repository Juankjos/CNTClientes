//src/app/(auth)/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';

export default function ForgotPasswordPage() {
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        setLoading(true);
        setMsg(null);

        const fd = new FormData(e.currentTarget);

        const res = await fetch(apiPath('/api/auth/forgot-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: fd.get('email'),
            }),
        });

        const data = await res.json().catch(() => ({}));

        setLoading(false);

        if (!res.ok) {
            setMsg({
                type: 'err',
                text: data.error ?? 'No se pudo procesar la solicitud',
            });
            return;
        }

        setMsg({
            type: 'ok',
            text:
                data.message ??
                'Si el correo existe en nuestro sistema, recibirás un enlace para restablecer tu contraseña.',
        });

        e.currentTarget.reset();
    }

    return (
        <div className="min-h-screen bg-cnt-dark flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-cnt-surface border border-cnt-border rounded-2xl p-8">
                <Link
                href="/login"
                className="inline-flex items-center gap-2 mb-6 text-sm text-gray-400 hover:text-white transition-colors"
                aria-label="Volver al login"
                >
                    <span aria-hidden="true">←</span>
                    <span>Volver al login</span>
                </Link>

                <div className="mb-8">
                    <h1 className="font-display text-3xl text-white mb-2">
                        Recuperar contraseña
                    </h1>
                    <p className="text-gray-500 text-sm leading-relaxed">
                        Ingresa el correo asociado a tu cuenta. Te enviaremos un enlace para
                        crear una nueva contraseña.
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

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Correo electrónico
                        </label>
                        <input
                        name="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder="correo@ejemplo.com"
                        className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-blue transition-colors"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="cursor-pointer w-full bg-cnt-blue hover:bg-blue-700 disabled:bg-blue-900 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
                    >
                        {loading ? 'Enviando...' : 'Enviar enlace'}
                    </button>
                </form>
            </div>
        </div>
    );
}