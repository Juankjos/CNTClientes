//src/app/(auth)/reset-password/page.tsx
'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import Swal from 'sweetalert2';
import { apiPath } from '@/lib/api-path';

function ResetPasswordContent() {
    const router = useRouter();
    const searchParams = useSearchParams();

    const token = searchParams.get('token') ?? '';

    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();

        if (loading) return;

        setLoading(true);
        setMsg(null);

        const form = e.currentTarget;
        const fd = new FormData(form);

        const res = await fetch(apiPath('/api/auth/reset-password'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
            token,
            password: fd.get('password'),
            confirmPassword: fd.get('confirmPassword'),
            }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            setLoading(false);

            setMsg({
            type: 'err',
            text: data.error ?? 'No se pudo actualizar la contraseña',
            });

            return;
        }

        form.reset();

        await Swal.fire({
            icon: 'success',
            title: 'Contraseña actualizada',
            text:
            data.message ??
            'Contraseña actualizada correctamente. Ya puedes iniciar sesión.',
            confirmButtonText: 'Ir al login',
            background: '#111827',
            color: '#ffffff',
            confirmButtonColor: '#2563eb',
            allowOutsideClick: false,
            allowEscapeKey: false,
        });

        router.push('/login');
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
                        Nueva contraseña
                    </h1>
                    <p className="text-gray-500 text-sm leading-relaxed">
                        Crea una nueva contraseña para recuperar el acceso a tu cuenta.
                    </p>
                </div>

                {!token ? (
                    <div className="rounded-lg px-4 py-3 text-sm border bg-red-950 text-red-300 border-cnt-red">
                        El enlace de recuperación no es válido.
                    </div>
                ) : (
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
                            Nueva contraseña
                        </label>

                        <div className="relative">
                            <input
                            name="password"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="Mínimo 8 caracteres"
                            className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 pr-20 text-sm focus:outline-none focus:border-cnt-blue transition-colors"
                            />

                            <button
                            type="button"
                            onClick={() => setShowPassword((prev) => !prev)}
                            className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 hover:text-white transition-colors"
                            aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                            aria-pressed={showPassword}
                            >
                            {showPassword ? 'Ocultar' : 'Mostrar'}
                            </button>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                            Confirmar contraseña
                        </label>

                        <input
                            name="confirmPassword"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={8}
                            autoComplete="new-password"
                            placeholder="Confirma tu contraseña"
                            className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-cnt-blue transition-colors"
                        />
                    </div>

                    <button
                    type="submit"
                    disabled={loading}
                    className="cursor-pointer w-full bg-cnt-blue hover:bg-blue-700 disabled:bg-blue-900 disabled:opacity-70 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200"
                    >
                        {loading ? 'Actualizando contraseña...' : 'Actualizar contraseña'}
                    </button>
                </form>
                )}
            </div>
        </div>
    );
}

function ResetPasswordFallback() {
    return (
        <div className="min-h-screen bg-cnt-dark flex items-center justify-center p-8">
            <div className="w-full max-w-md bg-cnt-surface border border-cnt-border rounded-2xl p-8" />
        </div>
    );
}

export default function ResetPasswordPage() {
    return (
        <Suspense fallback={<ResetPasswordFallback />}>
            <ResetPasswordContent />
        </Suspense>
    );
}