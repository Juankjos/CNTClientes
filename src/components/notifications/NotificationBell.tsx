//src/components/notifications/NotificationBell.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiPath } from '@/lib/api-path';

type NotificationItem = {
    id: number;
    actor_usuario_id: number | null;
    actor_username: string | null;
    peticion_id: number | null;
    tipo: string;
    titulo: string;
    mensaje: string;
    url: string | null;
    leida_at: string | null;
    created_at: string;
};

const TYPE_STYLE: Record<string, string> = {
    nueva_peticion: 'bg-blue-950 text-blue-300 border-blue-800',
    comentario_admin: 'bg-yellow-950 text-yellow-300 border-yellow-800',
    cambio_estatus: 'bg-purple-950 text-purple-300 border-purple-800',
    cambio_fecha: 'bg-green-950 text-green-300 border-green-800',
    archivos_eliminados: 'bg-red-950 text-red-300 border-red-800',

    paquete_inicio: 'bg-green-950 text-green-300 border-green-800',
    paquete_dia: 'bg-cyan-950 text-cyan-300 border-cyan-800',
    paquete_fin: 'bg-orange-950 text-orange-300 border-orange-800',
    paquete_omitido: 'bg-gray-900 text-gray-300 border-gray-700',
};

function parseMysqlUtcDate(value: string) {
    const text = String(value ?? '').trim();

    if (!text) return null;

    if (text.includes('T') && /Z$|[+-]\d{2}:\d{2}$/.test(text)) {
        const date = new Date(text);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    const normalized = text.replace(' ', 'T');
    const date = new Date(`${normalized}Z`);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatNotificationDate(value: string) {
    const date = parseMysqlUtcDate(value);

    if (!date) return '—';

    return new Intl.DateTimeFormat('es-MX', {
        timeZone: 'America/Mexico_City',
        dateStyle: 'short',
        timeStyle: 'short',
        hour12: true,
    }).format(date);
}

export default function NotificationBell() {
    const router = useRouter();
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [open, setOpen] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unread, setUnread] = useState(0);
    const [loading, setLoading] = useState(false);

    async function fetchNotifications() {
        try {
            setLoading(true);

            const res = await fetch(apiPath('/api/notifications?limit=10'));
            const data = await res.json().catch(() => null);

            if (!res.ok) {
                throw new Error(data?.error || `HTTP ${res.status}`);
            }

            setNotifications(data.notifications ?? []);
            setUnread(Number(data.unread ?? 0));
        } catch (error) {
            console.error('[NotificationBell]', error);
        } finally {
            setLoading(false);
        }
    }

    async function markAsRead(notification: NotificationItem) {
        if (!notification.leida_at) {
            await fetch(apiPath(`/api/notifications/${notification.id}`), {
                method: 'PATCH',
            });

            setNotifications((items) =>
                items.map((item) =>
                    item.id === notification.id
                    ? { ...item, leida_at: new Date().toISOString() }
                    : item
                )
            );

            setUnread((value) => Math.max(0, value - 1));
        }

        setOpen(false);

        if (notification.url) {
            const peticionId = Number(notification.peticion_id);

            const isAdminPeticionUrl =
                notification.url.startsWith('/admin') &&
                Number.isInteger(peticionId) &&
                peticionId > 0;

            const currentPath = window.location.pathname.replace('/CNTClientes', '');

            if (isAdminPeticionUrl) {
                const targetUrl = `/admin?tab=peticiones&peticionId=${peticionId}`;

                if (currentPath === '/admin') {
                window.dispatchEvent(
                    new CustomEvent('cnt:open-admin-peticion', {
                    detail: {
                        peticionId,
                    },
                    })
                );

                return;
                }

                router.push(targetUrl);
                return;
            }

            router.push(notification.url);
        }
    }

    async function markAllAsRead() {
        await fetch(apiPath('/api/notifications'), {
            method: 'PATCH',
        });

        setNotifications((items) =>
            items.map((item) => ({
                ...item,
                leida_at: item.leida_at ?? new Date().toISOString(),
            }))
        );

        setUnread(0);
    }

    useEffect(() => {
        fetchNotifications();

        const interval = window.setInterval(fetchNotifications, 30000);

        return () => window.clearInterval(interval);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
        if (
            dropdownRef.current &&
            !dropdownRef.current.contains(event.target as Node)
        ) {
            setOpen(false);
        }
        }

        if (open) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    return (
        <div ref={dropdownRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="relative cursor-pointer rounded-md border-cnt-border px-3 py-1.5 text-xs text-gray-400 transition-all hover:border-gray-500 hover:text-white"
                aria-label="Notificaciones"
            >
            🔔

                {unread > 0 && (
                    <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white ring-2 ring-cnt-dark tabular-nums">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

        {open && (
            <div className="absolute right-0 top-10 z-[80] w-96 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-cnt-border bg-cnt-dark shadow-2xl">
            <div className="flex items-center justify-between border-b border-cnt-border px-4 py-3">
                <div>
                <p className="text-sm font-semibold text-white">Notificaciones</p>
                <p className="text-xs text-gray-500">
                    {unread > 0 ? `${unread} sin leer` : 'Sin pendientes'}
                </p>
                </div>

                {unread > 0 && (
                <button
                    type="button"
                    onClick={markAllAsRead}
                    className="cursor-pointer text-xs text-gray-400 hover:text-white"
                >
                    Marcar todas
                </button>
                )}
            </div>

            <div className="max-h-96 overflow-y-auto">
                {loading && notifications.length === 0 ? (
                <div className="space-y-3 p-4">
                    {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 animate-pulse rounded-lg bg-cnt-surface" />
                    ))}
                </div>
                ) : notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                    No tienes notificaciones.
                </div>
                ) : (
                notifications.map((notification) => (
                    <button
                    key={notification.id}
                    type="button"
                    onClick={() => markAsRead(notification)}
                    className={`block w-full cursor-pointer border-b border-cnt-border px-4 py-3 text-left transition-colors hover:bg-cnt-surface/70 ${
                        notification.leida_at ? 'opacity-70' : 'bg-cnt-surface/30'
                    }`}
                    >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <span
                        className={`rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                            TYPE_STYLE[notification.tipo] ??
                            'border-gray-700 bg-gray-900 text-gray-300'
                        }`}
                        >
                        {notification.tipo.replaceAll('_', ' ')}
                        </span>

                        {!notification.leida_at && (
                        <span className="h-2 w-2 rounded-full bg-cnt-red" />
                        )}
                    </div>

                    <p className="text-sm font-semibold text-white">
                        {notification.titulo}
                    </p>

                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-gray-400">
                        {notification.mensaje}
                    </p>

                    <p className="mt-2 text-[10px] text-white">
                        {formatNotificationDate(notification.created_at)}
                    </p>
                    </button>
                ))
                )}
            </div>
            </div>
        )}
        </div>
    );
}