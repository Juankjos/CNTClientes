// src/app/[protected]/profile/page.tsx
'use client';
'use client';
import { useEffect, useState } from 'react';
import { apiPath } from '@/lib/api-path';
import Swal from 'sweetalert2';

type AddressSlot = 1 | 2 | 3;

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

const ADDRESS_SLOTS: AddressSlot[] = [1, 2, 3];

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

  if (!text) return { ...EMPTY_ADDRESS };

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

function areAddressesEqual(a: AddressForm, b: AddressForm) {
  return (
    a.calle.trim() === b.calle.trim() &&
    a.numero_exterior.trim() === b.numero_exterior.trim() &&
    a.numero_interior.trim() === b.numero_interior.trim() &&
    a.colonia.trim() === b.colonia.trim() &&
    a.ciudad.trim() === b.ciudad.trim() &&
    a.municipio.trim() === b.municipio.trim() &&
    a.estado.trim() === b.estado.trim() &&
    a.codigo_postal.trim() === b.codigo_postal.trim() &&
    a.referencias.trim() === b.referencias.trim()
  );
}

function isAddressEmpty(address: AddressForm) {
  return (
    !address.calle.trim() &&
    !address.numero_exterior.trim() &&
    !address.numero_interior.trim() &&
    !address.colonia.trim() &&
    !address.ciudad.trim() &&
    !address.municipio.trim() &&
    !address.estado.trim() &&
    !address.codigo_postal.trim() &&
    !address.referencias.trim()
  );
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [tab, setTab] = useState<'info' | 'password'>('info');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [editingAddressSlot, setEditingAddressSlot] = useState<AddressSlot | null>(null);

  const [originalAddresses, setOriginalAddresses] = useState<Record<AddressSlot, AddressForm>>({
    1: { ...EMPTY_ADDRESS },
    2: { ...EMPTY_ADDRESS },
    3: { ...EMPTY_ADDRESS },
  });

  const [addresses, setAddresses] = useState<Record<AddressSlot, AddressForm>>({
    1: { ...EMPTY_ADDRESS },
    2: { ...EMPTY_ADDRESS },
    3: { ...EMPTY_ADDRESS },
  });

  async function loadProfile() {
    const res = await fetch(apiPath('/api/users/profile'));
    const data = await res.json();

    const parsedAddresses = {
      1: parseDomicilio(data?.domicilio_1),
      2: parseDomicilio(data?.domicilio_2),
      3: parseDomicilio(data?.domicilio_3),
    };

    setProfile(data);
    setAddresses(parsedAddresses);
    setOriginalAddresses(parsedAddresses);
    setLoading(false);
  }

  useEffect(() => {
    loadProfile();
  }, []);

  function setAddressField(slot: AddressSlot, key: keyof AddressForm, value: string) {
    setAddresses((prev) => ({
      ...prev,
      [slot]: {
        ...prev[slot],
        [key]: value,
      },
    }));
  }

  function validateAddress(address: AddressForm) {
    const calle = address.calle.trim();
    const numeroExterior = address.numero_exterior.trim();
    const numeroInterior = address.numero_interior.trim();
    const colonia = address.colonia.trim();
    const ciudad = address.ciudad.trim();
    const municipio = address.municipio.trim();
    const estado = address.estado.trim();
    const codigoPostal = address.codigo_postal.trim();

    if (!calle || !colonia || !ciudad || !municipio || !estado || !codigoPostal) {
      return 'Completa todos los campos obligatorios del domicilio';
    }

    if (!numeroExterior && !numeroInterior) {
      return 'Captura número exterior o número interior';
    }

    if (!/^\d{5}$/.test(codigoPostal)) {
      return 'El código postal debe tener 5 dígitos';
    }

    return null;
  }

  async function handleCancelAddress(slot: AddressSlot) {
    const current = addresses[slot];
    const original = originalAddresses[slot];
    const existsInDb = Boolean(profile?.[`domicilio_${slot}`]);

    const hasChanges = existsInDb
      ? !areAddressesEqual(current, original)
      : !isAddressEmpty(current);

    if (hasChanges) {
      const result = await Swal.fire({
        title: '¿Cancelar cambios?',
        text: 'Existen cambios realizados sin guardar ¿Continuar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Seguir editando',
        reverseButtons: true,
        background: '#1f2937',
        color: '#fff',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#374151',
      });

      if (!result.isConfirmed) return;
    }

    setAddresses((prev) => ({
      ...prev,
      [slot]: existsInDb ? { ...original } : { ...EMPTY_ADDRESS },
    }));

    setEditingAddressSlot(null);
    setMsg(null);
  }

  async function handleProfileSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingSection('profile');
    setMsg(null);

    const fd = new FormData(e.currentTarget);

    const body = {
      nombre: String(fd.get('nombre') ?? '').trim(),
      apellidos: String(fd.get('apellidos') ?? '').trim(),
      telefono: String(fd.get('telefono') ?? '').trim(),
      empresa: String(fd.get('empresa') ?? '').trim(),
    };

    const res = await fetch(apiPath('/api/users/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    setSavingSection(null);
    setMsg(
      res.ok
        ? { type: 'ok', text: 'Información personal actualizada correctamente' }
        : { type: 'err', text: data.error ?? 'Error guardando cambios' }
    );

    if (res.ok) {
      await loadProfile();
    }
  }

  async function handlePasswordSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSavingSection('password');
    setMsg(null);

    const fd = new FormData(e.currentTarget);

    const body = {
      password_actual: String(fd.get('password_actual') ?? ''),
      password_nuevo: String(fd.get('password_nuevo') ?? ''),
    };

    const res = await fetch(apiPath('/api/users/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    setSavingSection(null);
    setMsg(
      res.ok
        ? { type: 'ok', text: 'Contraseña actualizada correctamente' }
        : { type: 'err', text: data.error ?? 'Error guardando cambios' }
    );

    if (res.ok) {
      await loadProfile();
      (e.currentTarget as HTMLFormElement).reset();
      setShowCurrentPassword(false);
      setShowNewPassword(false);
    }
  }

  async function handleAddressSave(slot: AddressSlot) {
    const address = addresses[slot];
    const validationError = validateAddress(address);

    if (validationError) {
      setMsg({ type: 'err', text: validationError });
      return;
    }

    setSavingSection(`address-${slot}`);
    setMsg(null);

    const body = {
      domicilio_slot: slot,
      domicilio_action: 'save',
      calle: address.calle.trim(),
      numero_exterior: address.numero_exterior.trim(),
      numero_interior: address.numero_interior.trim(),
      colonia: address.colonia.trim(),
      ciudad: address.ciudad.trim(),
      municipio: address.municipio.trim(),
      estado: address.estado.trim(),
      codigo_postal: address.codigo_postal.trim(),
      referencias: address.referencias.trim(),
    };

    const res = await fetch(apiPath('/api/users/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const data = await res.json().catch(() => ({}));

    setSavingSection(null);
    setMsg(
      res.ok
        ? { type: 'ok', text: `Domicilio ${slot} guardado correctamente` }
        : { type: 'err', text: data.error ?? 'Error guardando domicilio' }
    );

    if (res.ok) {
      await loadProfile();
      setEditingAddressSlot(null);
    }
  }

  async function handleDeleteAddress(slot: AddressSlot) {
    const result = await Swal.fire({
      title: `¿Eliminar Domicilio ${slot}?`,
      text: 'Esta acción eliminará el domicilio actual.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      background: '#1f2937',
      color: '#fff',
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#374151',
    });

    if (!result.isConfirmed) return;

    setSavingSection(`address-${slot}`);
    setMsg(null);

    const res = await fetch(apiPath('/api/users/profile'), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domicilio_slot: slot,
        domicilio_action: 'delete',
      }),
    });

    const data = await res.json().catch(() => ({}));

    setSavingSection(null);
    setMsg(
      res.ok
        ? { type: 'ok', text: `Domicilio ${slot} eliminado correctamente` }
        : { type: 'err', text: data.error ?? 'Error eliminando domicilio' }
    );

    if (res.ok) {
      await loadProfile();
      setEditingAddressSlot(null);
    }
  }

  function handleAddAddress() {
    const nextEmpty = ADDRESS_SLOTS.find((slot) => !profile?.[`domicilio_${slot}`]);

    if (!nextEmpty) return;

    setAddresses((prev) => ({
      ...prev,
      [nextEmpty]: { ...EMPTY_ADDRESS },
    }));

    setEditingAddressSlot(nextEmpty);
    setMsg(null);
  }

  const addressCount = ADDRESS_SLOTS.filter((slot) => Boolean(profile?.[`domicilio_${slot}`])).length;
  const canAddAddress = addressCount < 3 && editingAddressSlot === null;
  const showPersonalInfoSection = editingAddressSlot === null;

  if (loading) {
    return (
      <div className="max-w-xl mx-auto space-y-4 animate-pulse">
        <div className="h-8 bg-cnt-surface rounded w-1/3" />
        <div className="h-64 bg-cnt-surface rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto">
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Mi cuenta</p>
        <h1 className="font-display text-3xl text-white">Mi Perfil</h1>
      </div>

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
            <span
              className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                profile?.rol === 'admin'
                  ? 'bg-red-950 text-cnt-red'
                  : 'bg-cnt-dark text-gray-500'
              }`}
            >
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

      <div className="flex gap-1 mb-6 bg-cnt-surface border border-cnt-border rounded-lg p-1">
        {(['info', 'password'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setMsg(null);
              setEditingAddressSlot(null);
            }}
            className={`cursor-pointer flex-1 py-2 rounded-md text-sm transition-colors ${
              tab === t ? 'bg-cnt-dark text-white' : 'text-gray-500 hover:text-white'
            }`}
          >
            {t === 'info' ? 'Información personal' : 'Cambiar contraseña'}
          </button>
        ))}
      </div>

      {msg && (
        <div
          className={`mb-6 px-4 py-3 rounded-lg text-sm border ${
            msg.type === 'ok'
              ? 'bg-green-950 text-green-300 border-green-800'
              : 'bg-red-950 text-red-300 border-cnt-red'
          }`}
        >
          {msg.text}
        </div>
      )}

      {tab === 'info' ? (
        <div className="bg-cnt-surface border border-cnt-border rounded-xl p-6 space-y-6">
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              showPersonalInfoSection
                ? 'max-h-[700px] opacity-100 translate-y-0'
                : 'max-h-0 opacity-0 -translate-y-2 pointer-events-none'
            }`}
          >
            <form onSubmit={handleProfileSave} className="space-y-4 pb-1">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Nombre
                  </label>
                  <input
                    name="nombre"
                    defaultValue={profile?.nombre ?? ''}
                    placeholder="Tu nombre"
                    className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                    Apellidos
                  </label>
                  <input
                    name="apellidos"
                    defaultValue={profile?.apellidos ?? ''}
                    placeholder="Tus apellidos"
                    className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Teléfono
                </label>
                <input
                  name="telefono"
                  defaultValue={profile?.telefono ?? ''}
                  placeholder="(378) 000-0000"
                  type="tel"
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Empresa / Organización
                </label>
                <input
                  name="empresa"
                  defaultValue={profile?.empresa ?? ''}
                  placeholder="Nombre de tu empresa (opcional)"
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={savingSection === 'profile'}
                className="cursor-pointer mt-2 w-full bg-cnt-red border border-cnt-border hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all"
              >
                {savingSection === 'profile' ? 'Guardando...' : 'Guardar información personal'}
              </button>
            </form>
          </div>

          <div
            className={`transition-all duration-300 ${
              showPersonalInfoSection ? 'border-t border-cnt-border pt-6' : 'pt-0'
            }`}
          >
            <div className="flex items-center justify-between gap-4 mb-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest">Domicilios</p>

              {canAddAddress && (
                <button
                  type="button"
                  onClick={handleAddAddress}
                  className="cursor-pointer text-sm px-3 py-2 rounded-lg border border-cnt-border text-white hover:border-cnt-red transition-colors"
                >
                  Agregar domicilio
                </button>
              )}
            </div>

            <div className="space-y-4">
              {ADDRESS_SLOTS.map((slot) => {
                const rawAddress = profile?.[`domicilio_${slot}`];
                const exists = Boolean(rawAddress);
                const isEditing = editingAddressSlot === slot;
                const address = addresses[slot];

                if (!exists && !isEditing) return null;

                return (
                  <div
                    key={slot}
                    className="border border-cnt-border rounded-xl p-4 bg-cnt-dark/40"
                  >
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        <p className="text-white font-semibold">Domicilio {slot}</p>
                        {!isEditing && (
                          <p className="text-sm text-gray-400 mt-1 leading-relaxed">
                            {rawAddress}
                          </p>
                        )}
                        {exists && (
                            <button
                              type="button"
                              onClick={() => handleDeleteAddress(slot)}
                              disabled={savingSection === `address-${slot}`}
                              className="cursor-pointer w-full sm:w-auto py-3 text-red-300"
                            >
                              Eliminar domicilio
                            </button>
                          )}
                      </div>

                      {!isEditing && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingAddressSlot(slot);
                            setMsg(null);
                          }}
                          className="cursor-pointer text-sm px-3 py-2 rounded-lg border border-cnt-border text-white hover:border-cnt-red transition-colors"
                        >
                          Editar
                        </button>
                      )}
                    </div>

                    {isEditing && (
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                            Calle
                          </label>
                          <input
                            value={address.calle}
                            onChange={(e) => setAddressField(slot, 'calle', e.target.value)}
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
                              value={address.numero_exterior}
                              onChange={(e) =>
                                setAddressField(slot, 'numero_exterior', e.target.value)
                              }
                              placeholder="Ej. 123"
                              className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                              Número interior
                            </label>
                            <input
                              value={address.numero_interior}
                              onChange={(e) =>
                                setAddressField(slot, 'numero_interior', e.target.value)
                              }
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
                            value={address.colonia}
                            onChange={(e) => setAddressField(slot, 'colonia', e.target.value)}
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
                              value={address.ciudad}
                              onChange={(e) => setAddressField(slot, 'ciudad', e.target.value)}
                              placeholder="Ciudad"
                              className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                              Municipio
                            </label>
                            <input
                              value={address.municipio}
                              onChange={(e) =>
                                setAddressField(slot, 'municipio', e.target.value)
                              }
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
                              value={address.estado}
                              onChange={(e) => setAddressField(slot, 'estado', e.target.value)}
                              placeholder="Estado"
                              className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                            />
                          </div>

                          <div>
                            <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                              Código postal
                            </label>
                            <input
                              value={address.codigo_postal}
                              onChange={(e) =>
                                setAddressField(
                                  slot,
                                  'codigo_postal',
                                  e.target.value.replace(/\D/g, '').slice(0, 5)
                                )
                              }
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
                            value={address.referencias}
                            onChange={(e) =>
                              setAddressField(slot, 'referencias', e.target.value)
                            }
                            rows={3}
                            placeholder="Opcional"
                            className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors resize-none"
                          />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                          <button
                            type="button"
                            onClick={() => handleCancelAddress(slot)}
                            disabled={savingSection === `address-${slot}`}
                            className="cursor-pointer w-full sm:w-auto px-4 py-3 rounded-lg border border-cnt-border text-white hover:border-gray-400 transition-colors"
                          >
                            Cancelar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddressSave(slot)}
                            disabled={savingSection === `address-${slot}`}
                            className="cursor-pointer flex-1 bg-cnt-red hover:bg-red-700 disabled:bg-red-900 border border-cnt-border text-white py-3 rounded-lg text-sm font-semibold transition-all"
                          >
                            {savingSection === `address-${slot}` ? 'Guardando...' : 'Guardar'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {addressCount === 0 && editingAddressSlot === null && (
                <p className="text-sm text-gray-500">
                  No has registrado domicilios todavía.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handlePasswordSave}
          className="bg-cnt-surface border border-cnt-border rounded-xl p-6"
        >
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
                  aria-label={
                    showCurrentPassword
                      ? 'Ocultar contraseña actual'
                      : 'Mostrar contraseña actual'
                  }
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
                  aria-label={
                    showNewPassword
                      ? 'Ocultar nueva contraseña'
                      : 'Mostrar nueva contraseña'
                  }
                  aria-pressed={showNewPassword}
                >
                  {showNewPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={savingSection === 'password'}
            className="cursor-pointer mt-6 w-full bg-cnt-red border border-cnt-border hover:bg-red-700 disabled:bg-red-900 text-white py-3 rounded-lg text-sm font-semibold transition-all"
          >
            {savingSection === 'password' ? 'Guardando...' : 'Guardar cambios'}
          </button>
        </form>
      )}
    </div>
  );
}