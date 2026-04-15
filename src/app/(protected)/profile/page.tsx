'use client';
import { useState, useEffect } from 'react';
import { apiPath } from '@/lib/api-path';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<'info' | 'password'>('info');
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    fetch(apiPath('/api/users/profile'))
      .then(r => r.json())
      .then(d => { setProfile(d); setLoading(false); });
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    const fd   = new FormData(e.currentTarget);
    const body: Record<string, string> = {};
    fd.forEach((v, k) => { if (String(v).trim()) body[k] = String(v).trim(); });

    const res  = await fetch('/api/users/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setSaving(false);
    setMsg(res.ok
      ? { type: 'ok', text: 'Perfil actualizado correctamente' }
      : { type: 'err', text: data.error ?? 'Error guardando cambios' }
    );
    if (res.ok) {
      fetch('/api/users/profile').then(r => r.json()).then(setProfile);
    }
  }

  if (loading) return (
    <div className="max-w-xl mx-auto space-y-4 animate-pulse">
      <div className="h-8 bg-cnt-surface rounded w-1/3" />
      <div className="h-64 bg-cnt-surface rounded-xl" />
    </div>
  );

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Mi cuenta</p>
        <h1 className="font-display text-3xl text-white">Mi Perfil</h1>
      </div>

      {/* Avatar / info básica */}
      <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 mb-6 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-cnt-dark border border-cnt-border flex items-center justify-center shrink-0">
          <span className="text-xl font-bold text-cnt-red">
            {(profile?.username ?? 'U')[0].toUpperCase()}
          </span>
        </div>
        <div>
          <p className="text-white font-semibold">{profile?.username}</p>
          <p className="text-gray-500 text-sm">{profile?.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
              profile?.rol === 'admin' ? 'bg-red-950 text-cnt-red' : 'bg-cnt-dark text-gray-500'
            }`}>
              {profile?.rol}
            </span>
            {profile?.ultimo_login && (
              <span className="text-gray-600 text-xs">
                Último acceso: {new Date(profile.ultimo_login).toLocaleDateString('es-MX')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-cnt-surface border border-cnt-border rounded-lg p-1">
        {(['info', 'password'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setMsg(null); }}
            className={`cursor-pointer flex-1 py-2 rounded-md text-sm transition-colors ${
              tab === t ? 'bg-cnt-dark text-white' : 'text-gray-500 hover:text-white'
            }`}>
            {t === 'info' ? 'Información personal' : 'Cambiar contraseña'}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
          msg.type === 'ok' ? 'bg-green-950 text-green-300 border-green-800' : 'bg-red-950 text-red-300 border-cnt-red'
        }`}>
          {msg.text}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-cnt-surface border border-cnt-border rounded-xl p-6">
        {tab === 'info' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Nombre</label>
                <input name="nombre" defaultValue={profile?.nombre ?? ''} placeholder="Tu nombre"
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
              </div>
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Apellidos</label>
                <input name="apellidos" defaultValue={profile?.apellidos ?? ''} placeholder="Tus apellidos"
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Teléfono</label>
              <input name="telefono" defaultValue={profile?.telefono ?? ''} placeholder="(378) 000-0000" type="tel"
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Empresa / Organización</label>
              <input name="empresa" defaultValue={profile?.empresa ?? ''} placeholder="Nombre de tu empresa (opcional)"
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Contraseña actual</label>
              <input name="password_actual" type="password" required placeholder="••••••••"
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
            </div>
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">Nueva contraseña</label>
              <input name="password_nuevo" type="password" required placeholder="Mínimo 8 caracteres" minLength={8}
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors" />
            </div>
          </div>
        )}

        <button type="submit" disabled={saving}
          className="cursor-pointer mt-6 w-full bg-cnt-red hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
