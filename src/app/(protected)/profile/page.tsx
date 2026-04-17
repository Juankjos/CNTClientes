// src/app/[protected]/profile/page.tsx
'use client';
import { useState, useEffect } from 'react';
import { apiPath } from '@/lib/api-path';

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [tab, setTab]         = useState<'info' | 'password'>('info');
  const [msg, setMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  type AddressForm = {
    calle: string;
    numero_exterior: string;
    numero_interior: string;
    colonia: string;
    ciudad: string;
    municipio: string;
    estado: string;
    codigo_postal: string;
    referencias: string;
  };

  const EMPTY_ADDRESS: AddressForm = {
    calle: '',
    numero_exterior: '',
    numero_interior: '',
    colonia: '',
    ciudad: '',
    municipio: '',
    estado: '',
    codigo_postal: '',
    referencias: '',
  };

  function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function extractField(text: string, label: string, nextLabels: string[]) {
    const lookAhead = nextLabels.length
      ? `(?=,\\s*(?:${nextLabels.map(escapeRegExp).join('|')})|$)`
      : '$';

    const regex = new RegExp(`${escapeRegExp(label)}\\s*(.*?)${lookAhead}`);
    return text.match(regex)?.[1]?.trim() ?? '';
  }

  function parseDomicilio(domicilio?: string | null): AddressForm {
    const text = String(domicilio ?? '').trim();
    if (!text) return EMPTY_ADDRESS;

    return {
      calle: extractField(text, 'Calle:', ['Num. ext:', 'Num. int:', 'Colonia:']),
      numero_exterior: extractField(text, 'Num. ext:', ['Num. int:', 'Colonia:']),
      numero_interior: extractField(text, 'Num. int:', ['Colonia:']),
      colonia: extractField(text, 'Colonia:', ['Ciudad:']),
      ciudad: extractField(text, 'Ciudad:', ['Municipio:']),
      municipio: extractField(text, 'Municipio:', ['Estado:']),
      estado: extractField(text, 'Estado:', ['CP:']),
      codigo_postal: extractField(text, 'CP:', ['Referencias:']),
      referencias: extractField(text, 'Referencias:', []),
    };
  }

  const [address, setAddress] = useState<AddressForm>(EMPTY_ADDRESS);

  useEffect(() => {
    fetch(apiPath('/api/users/profile'))
      .then(r => r.json())
      .then(d => {
        setProfile(d);
        setAddress(parseDomicilio(d?.domicilio));
        setLoading(false);
      });
  }, []);

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);

    const fd = new FormData(e.currentTarget);

    if (tab === 'info') {
      const calle = address.calle.trim();
      const numeroExterior = address.numero_exterior.trim();
      const numeroInterior = address.numero_interior.trim();
      const colonia = address.colonia.trim();
      const ciudad = address.ciudad.trim();
      const municipio = address.municipio.trim();
      const estado = address.estado.trim();
      const codigoPostal = address.codigo_postal.trim();

      if (!calle || !colonia || !ciudad || !municipio || !estado || !codigoPostal) {
        setSaving(false);
        setMsg({ type: 'err', text: 'Completa todos los campos obligatorios del domicilio' });
        return;
      }

      if (!numeroExterior && !numeroInterior) {
        setSaving(false);
        setMsg({ type: 'err', text: 'Captura número exterior o número interior' });
        return;
      }

      if (!/^\d{5}$/.test(codigoPostal)) {
        setSaving(false);
        setMsg({ type: 'err', text: 'El código postal debe tener 5 dígitos' });
        return;
      }
    }

    const body =
      tab === 'info'
        ? {
            nombre: String(fd.get('nombre') ?? '').trim(),
            apellidos: String(fd.get('apellidos') ?? '').trim(),
            telefono: String(fd.get('telefono') ?? '').trim(),
            empresa: String(fd.get('empresa') ?? '').trim(),

            calle: address.calle.trim(),
            numero_exterior: address.numero_exterior.trim(),
            numero_interior: address.numero_interior.trim(),
            colonia: address.colonia.trim(),
            ciudad: address.ciudad.trim(),
            municipio: address.municipio.trim(),
            estado: address.estado.trim(),
            codigo_postal: address.codigo_postal.trim(),
            referencias: address.referencias.trim(),
          }
        : {
            password_actual: String(fd.get('password_actual') ?? ''),
            password_nuevo: String(fd.get('password_nuevo') ?? ''),
          };

    const res = await fetch(apiPath('/api/users/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    setSaving(false);
    setMsg(
      res.ok
        ? { type: 'ok', text: 'Perfil actualizado correctamente' }
        : { type: 'err', text: data.error ?? 'Error guardando cambios' }
    );

    if (res.ok) {
      fetch(apiPath('/api/users/profile'))
        .then(r => r.json())
        .then(d => {
          setProfile(d);
          setAddress(parseDomicilio(d?.domicilio));
        });
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

            <div className="border-t border-cnt-border pt-4 mt-2">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-4">Domicilio</p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Calle
                  </label>
                  <input
                    name="calle"
                    value={address.calle}
                    onChange={(e) => setAddress(prev => ({ ...prev, calle: e.target.value }))}
                    required
                    placeholder="Calle"
                    className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Número exterior
                    </label>
                    <input
                      name="numero_exterior"
                      value={address.numero_exterior}
                      onChange={(e) => setAddress(prev => ({ ...prev, numero_exterior: e.target.value }))}
                      required={!address.numero_interior.trim()}
                      placeholder="Ej. 123"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Número interior
                    </label>
                    <input
                      name="numero_interior"
                      value={address.numero_interior}
                      onChange={(e) => setAddress(prev => ({ ...prev, numero_interior: e.target.value }))}
                      required={!address.numero_exterior.trim()}
                      placeholder="Ej. 4B"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Colonia
                  </label>
                  <input
                    name="colonia"
                    value={address.colonia}
                    onChange={(e) => setAddress(prev => ({ ...prev, colonia: e.target.value }))}
                    required
                    placeholder="Colonia"
                    className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Ciudad
                    </label>
                    <input
                      name="ciudad"
                      value={address.ciudad}
                      onChange={(e) => setAddress(prev => ({ ...prev, ciudad: e.target.value }))}
                      required
                      placeholder="Ciudad"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Municipio
                    </label>
                    <input
                      name="municipio"
                      value={address.municipio}
                      onChange={(e) => setAddress(prev => ({ ...prev, municipio: e.target.value }))}
                      required
                      placeholder="Municipio"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Estado
                    </label>
                    <input
                      name="estado"
                      value={address.estado}
                      onChange={(e) => setAddress(prev => ({ ...prev, estado: e.target.value }))}
                      required
                      placeholder="Estado"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                      Código postal
                    </label>
                    <input
                      name="codigo_postal"
                      value={address.codigo_postal}
                      onChange={(e) =>
                        setAddress(prev => ({
                          ...prev,
                          codigo_postal: e.target.value.replace(/\D/g, '').slice(0, 5),
                        }))
                      }
                      required
                      inputMode="numeric"
                      maxLength={5}
                      pattern="\d{5}"
                      placeholder="44800"
                      className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Referencias
                  </label>
                  <textarea
                    name="referencias"
                    value={address.referencias}
                    onChange={(e) => setAddress(prev => ({ ...prev, referencias: e.target.value }))}
                    rows={3}
                    placeholder="Opcional"
                    className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors resize-none"
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Contraseña actual
              </label>

              <div className="relative">
                <input
                  name="password_actual"
                  type={showCurrentPassword ? 'text' : 'password'}
                  required
                  placeholder="Ingresa tu contraseña actual"
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 pr-24 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label={showCurrentPassword ? 'Ocultar contraseña actual' : 'Mostrar contraseña actual'}
                  aria-pressed={showCurrentPassword}
                >
                  {showCurrentPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Nueva contraseña
              </label>

              <div className="relative">
                <input
                  name="password_nuevo"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 pr-24 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-3 flex items-center text-xs text-gray-400 hover:text-white transition-colors"
                  aria-label={showNewPassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'}
                  aria-pressed={showNewPassword}
                >
                  {showNewPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
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
