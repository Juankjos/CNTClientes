//src/app/(protected)/admin/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { apiPath } from '@/lib/api-path';

const NIVEL_STYLE: Record<string, string> = {
  debug:   'bg-gray-800 text-gray-400',
  info:    'bg-blue-900/50 text-blue-300',
  warning: 'bg-yellow-900/50 text-yellow-300',
  error:   'bg-red-950 text-cnt-red',
};

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'logs' | 'pagos'>('users');

  // --- Users state ---
  const [users, setUsers]     = useState<any[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [userTotal, setUserTotal] = useState(0);
  const [userQ, setUserQ]     = useState('');
  const [userLoading, setUserLoading] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [userMsg, setUserMsg]   = useState('');

  // --- Logs state ---
  const [logs, setLogs]         = useState<any[]>([]);
  const [logPage, setLogPage]   = useState(1);
  const [logTotal, setLogTotal] = useState(0);
  const [logNivel, setLogNivel] = useState('');

  // --- Pagos admin state ---
  const [pagos, setPagos]       = useState<any[]>([]);
  const [pagosPage, setPagosPage] = useState(1);
  const [pagosTotal, setPagosTotal] = useState(0);

  const fetchUsers = useCallback(async () => {
    setUserLoading(true);
    const params = new URLSearchParams({ page: String(userPage) });
    if (userQ) params.set('q', userQ);
    const res = await fetch(apiPath(`/api/admin/users?${params.toString()}`));
    const data = await res.json();
    setUsers(data.users ?? []);
    setUserTotal(data.pagination?.total ?? 0);
    setUserLoading(false);
  }, [userPage, userQ]);

  const fetchLogs = useCallback(async () => {
    const params = new URLSearchParams({ page: String(logPage) });
    if (logNivel) params.set('nivel', logNivel);
    const res  = await fetch(apiPath(`/api/admin/logs?${params.toString()}`));
    const data = await res.json();
    setLogs(data.logs ?? []);
    setLogTotal(data.pagination?.total ?? 0);
  }, [logPage, logNivel]);

  const fetchPagos = useCallback(async () => {
    const res  = await fetch(apiPath(`/api/payments?page=${pagosPage}`));
    const data = await res.json();
    setPagos(data.pagos ?? []);
    setPagosTotal(data.pagination?.total ?? 0);
  }, [pagosPage]);

  useEffect(() => { if (tab === 'users') fetchUsers(); }, [tab, fetchUsers]);
  useEffect(() => { if (tab === 'logs')  fetchLogs(); },  [tab, fetchLogs]);
  useEffect(() => { if (tab === 'pagos') fetchPagos(); }, [tab, fetchPagos]);

  async function toggleUser(id: number, activo: number) {
    await fetch(apiPath(`/api/admin/users/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activo: activo === 1 ? 0 : 1 }),
    });
    fetchUsers();
  }

  async function desbloquearUser(id: number) {
    await fetch(apiPath(`/api/admin/users/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ desbloquear: true }),
    });
    fetchUsers();
  }

  async function confirmPago(id: number, estatus: string) {
    await fetch(apiPath(`/api/payments/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estatus }),
    });
    fetchPagos();
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Panel de administración</p>
          <h1 className="font-display text-3xl text-white">Administrador CNT</h1>
        </div>
        <Link href="/admin/catalog"
          className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors">
          Gestionar Catálogo
        </Link>
        <Link href="/catalog"
          className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors">
          ← Portal
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-cnt-surface border border-cnt-border rounded-lg p-1 w-fit">
        {(['users', 'pagos', 'logs'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-md text-sm transition-colors capitalize ${
              tab === t ? 'bg-cnt-dark text-white' : 'text-gray-500 hover:text-white'
            }`}>
            {t === 'users' ? 'Usuarios' : t === 'pagos' ? 'Pagos' : 'Logs'}
          </button>
        ))}
      </div>

      {/* ======================== USUARIOS ======================== */}
      {tab === 'users' && (
        <div>
          <div className="flex gap-3 mb-5">
            <input value={userQ} onChange={e => setUserQ(e.target.value)}
              placeholder="Buscar usuario..."
              className="flex-1 max-w-sm bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-cnt-red transition-colors"
              onKeyDown={e => e.key === 'Enter' && fetchUsers()}
            />
            <button onClick={fetchUsers}
              className="px-4 py-2 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors">
              Buscar
            </button>
            <span className="px-3 py-2 text-gray-500 text-sm">{userTotal} usuarios</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Usuario</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Email</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Rol</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Estado</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Último login</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border">
                {userLoading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="bg-cnt-dark">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-cnt-surface rounded animate-pulse" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : users.map(u => (
                  <tr key={u.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{u.username}</td>
                    <td className="px-4 py-3 text-gray-400">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                        u.rol === 'admin' ? 'bg-red-950 text-cnt-red' : 'bg-cnt-surface text-gray-400'
                      }`}>{u.rol}</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? (
                        <span className="text-cnt-red text-xs">🔒 Bloqueado</span>
                      ) : (
                        <span className={`text-xs ${u.activo ? 'text-green-400' : 'text-gray-600'}`}>
                          {u.activo ? '● Activo' : '○ Inactivo'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {u.ultimo_login ? new Date(u.ultimo_login).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => toggleUser(u.id, u.activo)}
                          className="px-2 py-1 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded text-xs transition-colors">
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        {u.bloqueado_hasta && (
                          <button onClick={() => desbloquearUser(u.id)}
                            className="px-2 py-1 bg-yellow-950/50 border border-yellow-800 text-yellow-300 hover:text-yellow-200 rounded text-xs transition-colors">
                            Desbloquear
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ======================== PAGOS ======================== */}
      {tab === 'pagos' && (
        <div>
          <div className="mb-4 flex items-center gap-3">
            <span className="text-gray-500 text-sm">{pagosTotal} pagos totales</span>
          </div>
          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  {['Referencia', 'Cliente', 'Contenido', 'Monto', 'Método', 'Estatus', 'Fecha', 'Acciones'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border">
                {pagos.map((p: any) => (
                  <tr key={p.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-cnt-red">{p.referencia}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{p.nombre ?? p.email}</td>
                    <td className="px-4 py-3 text-white text-xs max-w-32 truncate">{p.titulo}</td>
                    <td className="px-4 py-3 text-white font-medium">${Number(p.monto).toFixed(2)}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs capitalize">{p.metodo_pago}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded border text-[10px] uppercase ${
                        p.estatus === 'pagado' ? 'bg-green-900/50 text-green-300 border-green-800'
                        : p.estatus === 'pendiente' ? 'bg-yellow-900/50 text-yellow-300 border-yellow-800'
                        : 'bg-gray-800 text-gray-400 border-gray-700'
                      }`}>{p.estatus}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(p.created_at).toLocaleDateString('es-MX')}
                    </td>
                    <td className="px-4 py-3">
                      {p.estatus === 'pendiente' && (
                        <div className="flex gap-1">
                          <button onClick={() => confirmPago(p.id, 'pagado')}
                            className="px-2 py-1 bg-green-900/50 border border-green-800 text-green-300 hover:text-green-200 rounded text-xs">
                            Confirmar
                          </button>
                          <button onClick={() => confirmPago(p.id, 'cancelado')}
                            className="px-2 py-1 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded text-xs">
                            Cancelar
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pagosTotal > 10 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={pagosPage <= 1} onClick={() => setPagosPage(p => p - 1)}
                className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40">
                ← Anterior
              </button>
              <button disabled={pagosPage * 10 >= pagosTotal} onClick={() => setPagosPage(p => p + 1)}
                className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ======================== LOGS ======================== */}
      {tab === 'logs' && (
        <div>
          <div className="flex gap-2 mb-5">
            {['', 'debug', 'info', 'warning', 'error'].map(n => (
              <button key={n} onClick={() => { setLogNivel(n); setLogPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs transition-colors border ${
                  logNivel === n ? 'border-cnt-red bg-red-950/30 text-white' : 'border-cnt-border text-gray-500 hover:text-white'
                }`}>
                {n === '' ? 'Todos' : n}
              </button>
            ))}
            <span className="px-3 py-1.5 text-gray-600 text-xs">{logTotal} registros</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-cnt-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cnt-border bg-cnt-surface">
                  {['Nivel', 'Usuario', 'Acción', 'Módulo', 'Descripción', 'IP', 'Fecha'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-gray-500 uppercase tracking-widest">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-cnt-border font-mono">
                {logs.map((l: any) => (
                  <tr key={l.id} className="bg-cnt-dark hover:bg-cnt-surface/50 transition-colors">
                    <td className="px-4 py-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase ${NIVEL_STYLE[l.nivel] ?? 'bg-gray-800 text-gray-400'}`}>
                        {l.nivel}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-400 text-xs">{l.username ?? '—'}</td>
                    <td className="px-4 py-2.5 text-white text-xs">{l.accion}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{l.modulo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs max-w-48 truncate">{l.descripcion ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{l.ip ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600 text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {logTotal > 20 && (
            <div className="flex justify-center gap-2 mt-4">
              <button disabled={logPage <= 1} onClick={() => setLogPage(p => p - 1)}
                className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40">
                ← Anterior
              </button>
              <button disabled={logPage * 20 >= logTotal} onClick={() => setLogPage(p => p + 1)}
                className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40">
                Siguiente →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
