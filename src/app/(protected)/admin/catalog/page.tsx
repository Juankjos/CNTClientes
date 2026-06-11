// src/app/(protected)/admin/catalog/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Swal from 'sweetalert2';
import type { CatalogoItem, CatalogoFormData } from '@/types';
import { apiPath } from '@/lib/api-path';
import DatePicker, { registerLocale } from 'react-datepicker';
import { es } from 'date-fns/locale/es';
import { formatMoney } from '@/lib/formatters';

registerLocale('es', es);

const CATEGORIAS = ['reportaje', 'noticia', 'entrevista', 'especial'] as const;

const emptyForm = (): CatalogoFormData => ({
  titulo: '',
  descripcion: '',
  categoria: 'reportaje',
  usa_rango_fechas: false,
  rango_dias: null,
  usa_hora_cita: false,

  bloquea_sabado: false,
  bloquea_domingo: false,
  bloquea_dias_festivos: false,

  incluye_fines_semana: true,
  incluye_dias_festivos: true,
  bloquea_fechas_personalizadas: false,
  fechas_bloqueadas: [],

  precio: 0,
  imagen: '',
  activo: true,
});

const formatCategoria = (categoria: string) =>
  categoria.charAt(0).toUpperCase() + categoria.slice(1);

type CatalogoCategoria = CatalogoFormData['categoria'];

const normalizeCategoria = (value: unknown): CatalogoCategoria => {
  const categoria = String(value ?? '').trim().toLowerCase();

  return CATEGORIAS.includes(categoria as CatalogoCategoria)
    ? (categoria as CatalogoCategoria)
    : 'reportaje';
};

const toBooleanDb = (value: unknown) => {
  return value === true || value === 1 || value === '1';
};

const toNullableNumber = (value: unknown) => {
  if (value === undefined || value === null || value === '') return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
};

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function toDateOnly(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function parseFechasBloqueadas(value: CatalogoItem['fechas_bloqueadas_json']) {
  if (Array.isArray(value)) return value;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

type ToggleSwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  id?: string;
  disabled?: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
};

function ToggleSwitch({
  checked,
  onChange,
  id,
  disabled = false,
  activeLabel = 'Activo',
  inactiveLabel = 'Inactivo',
}: ToggleSwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/40 ${
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer'
      } ${
        checked
          ? 'border-[#E34234] bg-[#E34234] hover:border-[#c9362a] hover:bg-[#c9362a]'
          : 'border-cnt-border bg-cnt-surface hover:border-gray-500'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-5' : 'translate-x-1'
        }`}
      />

      <span className="sr-only">
        {checked ? activeLabel : inactiveLabel}
      </span>
    </button>
  );
}

export default function AdminCatalogPage() {
  const [items, setItems] = useState<CatalogoItem[]>([]);
  const [form, setForm] = useState<CatalogoFormData>(emptyForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [preview, setPreview] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);

  const fetchItems = async () => {
    const res = await fetch(apiPath('/api/admin/catalog'));
    if (res.ok) setItems(await res.json());
  };

  useEffect(() => {
    fetchItems();
  }, []);

  const handleImageUrl = (url: string) => {
    setImageFile(null);
    setForm(f => ({ ...f, imagen: url }));
    setPreview(url);
  };

  const handleImageFile = (file: File | null) => {
    setImageFile(file);

    if (!file) {
      setPreview(form.imagen || '');
      return;
    }

    const localPreview = URL.createObjectURL(file);
    setPreview(localPreview);
  };

  const uploadSelectedImage = async (): Promise<string> => {
    if (!imageFile) return form.imagen;

    const fd = new FormData();
    fd.append('file', imageFile);

    const res = await fetch(apiPath('/api/admin/catalog/upload'), {
      method: 'POST',
      body: fd,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Error al subir imagen');
    }

    return data.url as string;
  };

  const toggleFechaBloqueada = (date: Date) => {
    const value = toDateOnly(date);

    setForm((f) => {
      const exists = f.fechas_bloqueadas.includes(value);

      return {
        ...f,
        fechas_bloqueadas: exists
          ? f.fechas_bloqueadas.filter((item) => item !== value)
          : [...f.fechas_bloqueadas, value].sort(),
      };
    });
  };

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm());
    setPreview('');
    setImageFile(null);
  };
  
  const handleCategoriaChange = (categoria: CatalogoFormData['categoria']) => {
    setForm((f) => ({
      ...f,
      categoria,
    }));
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setMsg(null);

      if (
        form.usa_rango_fechas &&
        (!Number.isInteger(form.rango_dias) || Number(form.rango_dias) <= 0)
      ) {
        setMsg({
          text: 'Debes capturar un total de días válido para el rango de fechas.',
          type: 'error',
        });
        setLoading(false);
        return;
      }

      if (
        form.usa_rango_fechas &&
        form.bloquea_fechas_personalizadas &&
        form.fechas_bloqueadas.length === 0
      ) {
        setMsg({
          text: 'Seleccionaste bloquear fechas personalizadas, pero no elegiste ninguna fecha.',
          type: 'error',
        });
        setLoading(false);
        return;
      }

      const uploadedImageUrl = await uploadSelectedImage();

      const usaRango = Boolean(form.usa_rango_fechas);

      const payload = {
        ...form,

        usa_rango_fechas: usaRango,
        usa_hora_cita: Boolean(form.usa_hora_cita),

        rango_dias: usaRango ? Number(form.rango_dias) : null,

        bloquea_sabado: usaRango ? Boolean(form.bloquea_sabado) : false,

        bloquea_domingo: usaRango ? Boolean(form.bloquea_domingo) : false,

        bloquea_dias_festivos: usaRango ? Boolean(form.bloquea_dias_festivos) : false,

        incluye_fines_semana: usaRango
          ? !form.bloquea_sabado && !form.bloquea_domingo
          : true,

        incluye_dias_festivos: usaRango
          ? !form.bloquea_dias_festivos
          : true,

        bloquea_fechas_personalizadas: usaRango
          ? Boolean(form.bloquea_fechas_personalizadas)
          : false,

        fechas_bloqueadas:
          usaRango && form.bloquea_fechas_personalizadas
            ? form.fechas_bloqueadas
            : [],

        imagen: uploadedImageUrl || null,
      };

      const url = editId
        ? apiPath(`/api/admin/catalog/${editId}`)
        : apiPath('/api/admin/catalog');

      const method = editId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setMsg({ text: data.error || 'Error al guardar', type: 'error' });
        return;
      }

      setMsg({
        text: editId ? 'Actualizado correctamente' : 'Creado correctamente',
        type: 'ok',
      });

      resetForm();
      fetchItems();
    } catch (error: any) {
      setMsg({ text: error.message || 'Error inesperado', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (item: CatalogoItem) => {
    setEditId(item.id);
    setImageFile(null);
    setMsg(null);

    const categoria = normalizeCategoria(item.categoria);
    const usaRango = toBooleanDb(item.usa_rango_fechas);

    setForm({
      titulo: item.titulo,
      descripcion: item.descripcion ?? '',
      categoria,
      usa_rango_fechas: usaRango,
      rango_dias:
        usaRango && item.rango_dias
          ? Number(item.rango_dias)
          : null,
      usa_hora_cita: toBooleanDb(item.usa_hora_cita),

      bloquea_sabado:
        usaRango && toBooleanDb(item.bloquea_sabado),

      bloquea_domingo:
        usaRango && toBooleanDb(item.bloquea_domingo),

      bloquea_dias_festivos:
        usaRango && toBooleanDb(item.bloquea_dias_festivos),

      incluye_fines_semana:
        item.incluye_fines_semana === undefined
          ? true
          : toBooleanDb(item.incluye_fines_semana),

      incluye_dias_festivos:
        item.incluye_dias_festivos === undefined
          ? true
          : toBooleanDb(item.incluye_dias_festivos),

      bloquea_fechas_personalizadas:
        usaRango && toBooleanDb(item.bloquea_fechas_personalizadas),

      fechas_bloqueadas:
        usaRango && toBooleanDb(item.bloquea_fechas_personalizadas)
          ? parseFechasBloqueadas(item.fechas_bloqueadas_json)
          : [],

      precio: Number(item.precio),
      imagen: item.imagen ?? '',
      activo: toBooleanDb(item.activo),
    });

    setPreview(item.imagen ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    const result = await Swal.fire({
      title: '¿Estás seguro que quieres eliminarlo?',
      text: 'Esta acción intentará eliminar permanentemente el item del catálogo.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      reverseButtons: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#374151',
    });

    if (!result.isConfirmed) return;

    try {
      setLoading(true);
      setMsg(null);

      const res = await fetch(apiPath(`/api/admin/catalog/${id}`), {
        method: 'DELETE',
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 409 || data.code === 'CATALOGO_CON_RELACIONES') {
          await Swal.fire({
            title: 'No se puede eliminar permanentemente',
            text:
              data.error ||
              'No se recomienda eliminar permanentemente este item. Puedes Editarlo o Desactivarlo al público.',
            icon: 'info',
            confirmButtonText: 'Entendido',
            confirmButtonColor: '#dc2626',
          });

          return;
        }

        await Swal.fire({
          title: 'Error',
          text: data.error || 'No se pudo eliminar el item.',
          icon: 'error',
          confirmButtonText: 'Entendido',
          confirmButtonColor: '#dc2626',
        });

        return;
      }

      await Swal.fire({
        title: 'Eliminado',
        text: 'El item fue eliminado correctamente.',
        icon: 'success',
        confirmButtonText: 'Aceptar',
        confirmButtonColor: '#16a34a',
      });

      fetchItems();
    } catch (error: any) {
      await Swal.fire({
        title: 'Error inesperado',
        text: error?.message || 'Ocurrió un error al eliminar el item.',
        icon: 'error',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#dc2626',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">
            Panel de administración
          </p>
          <h1 className="font-display text-3xl text-white">
            {editId ? 'Editar ítem del catálogo' : 'Gestión de catálogo'}
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Crea, actualiza y publica contenido del catálogo.
          </p>
        </div>

        <Link
          href="/admin"
          className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white rounded-lg text-sm transition-colors"
        >
          ← Volver al panel
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">
        <section className="bg-cnt-surface border border-cnt-border rounded-xl p-6">
          <div className="mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
              {editId ? 'Edición' : 'Nuevo registro'}
            </p>
            <h2 className="text-white text-xl font-semibold">
              {editId ? 'Actualizar contenido' : 'Agregar contenido'}
            </h2>
          </div>

          <div className="space-y-5">
            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Título
              </label>
              <input
                placeholder="Título del contenido *"
                value={form.titulo}
                onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Descripción
              </label>
              <textarea
                placeholder="Descripción breve del contenido"
                value={form.descripcion}
                onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                rows={4}
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors resize-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-4">
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Categoría
                </label>
                <select
                  value={form.categoria}
                  onChange={(e) => handleCategoriaChange(normalizeCategoria(e.target.value))}
                  className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors cursor-pointer"
                >
                  {CATEGORIAS.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {formatCategoria(categoria)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Precio del paquete
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Precio del paquete"
                  value={form.precio}
                  onChange={e => setForm(f => ({ ...f, precio: Number(e.target.value) }))}
                  className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                />
              </div>
            </div>

              <div className="md:col-span-2 rounded-xl border border-cnt-border bg-cnt-dark p-4 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      ¿Agregar rango de fechas?
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Si se habilita, el cliente elegirá una fecha inicial y el sistema calculará la fecha final según el total de días.
                    </p>
                  </div>

                  <ToggleSwitch
                    id="usa_rango_fechas"
                    checked={form.usa_rango_fechas}
                    activeLabel="Rango de fechas activo"
                    inactiveLabel="Rango de fechas inactivo"
                    onChange={(checked) => {
                      setForm((f) => ({
                        ...f,
                        usa_rango_fechas: checked,
                        rango_dias: checked ? f.rango_dias ?? 1 : null,

                        bloquea_sabado: checked ? f.bloquea_sabado : false,
                        bloquea_domingo: checked ? f.bloquea_domingo : false,
                        bloquea_dias_festivos: checked ? f.bloquea_dias_festivos : false,

                        incluye_fines_semana: checked ? f.incluye_fines_semana : true,
                        incluye_dias_festivos: checked ? f.incluye_dias_festivos : true,

                        bloquea_fechas_personalizadas: checked
                          ? f.bloquea_fechas_personalizadas
                          : false,

                        fechas_bloqueadas: checked ? f.fechas_bloqueadas : [],
                      }));
                    }}
                  />
                </div>

                {form.usa_rango_fechas && (
                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                        Total de días
                      </label>

                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.rango_dias ?? ''}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            rango_dias: e.target.value ? Number(e.target.value) : null,
                          }))
                        }
                        placeholder="Ej. 3"
                        className="w-full bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
                      />
                    </div>

                    <div className="rounded-lg border border-cnt-border bg-cnt-surface p-4">
                      <div className="flex flex-col gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            ¿Bloquear fines de semana?
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Selecciona los días del fin de semana no aplicarán para el catálogo: Sábados, Domingos o Ambos.
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                bloquea_sabado: !f.bloquea_sabado,
                              }))
                            }
                            className={`cursor-pointer px-4 py-2 rounded-lg text-sm border transition-colors ${
                              form.bloquea_sabado
                                ? 'bg-cnt-red border-cnt-red text-white'
                                : 'bg-cnt-dark border-cnt-border text-gray-300'
                            }`}
                          >
                            Sábados
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                bloquea_domingo: !f.bloquea_domingo,
                              }))
                            }
                            className={`cursor-pointer px-4 py-2 rounded-lg text-sm border transition-colors ${
                              form.bloquea_domingo
                                ? 'bg-cnt-red border-cnt-red text-white'
                                : 'bg-cnt-dark border-cnt-border text-gray-300'
                            }`}
                          >
                            Domingos
                          </button>
                        </div>

                        {(form.bloquea_sabado || form.bloquea_domingo) && (
                          <p className="text-xs text-yellow-300">
                            Días bloqueados:{' '}
                            {[
                              form.bloquea_sabado ? 'Sábados' : null,
                              form.bloquea_domingo ? 'Domingos' : null,
                            ]
                              .filter(Boolean)
                              .join(' y ')}
                            .
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-cnt-border bg-cnt-surface p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            ¿Bloquear días festivos?
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Si eliges Sí, el conteo saltará los festivos configurados: 1 de enero,
                            2 de febrero, 16 de marzo, 1 de mayo, 16 de septiembre,
                            20 de noviembre y 25 de diciembre.
                          </p>
                        </div>

                        <ToggleSwitch
                          checked={form.bloquea_dias_festivos}
                          activeLabel="Bloqueo de días festivos activo"
                          inactiveLabel="Bloqueo de días festivos inactivo"
                          onChange={(checked) =>
                            setForm((f) => ({
                              ...f,
                              bloquea_dias_festivos: checked,
                            }))
                          }
                        />
                      </div>
                    </div>

                    <div className="rounded-lg border border-cnt-border bg-cnt-surface p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-sm font-semibold text-white">
                            ¿Bloquear fechas personalizadas?
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            Selecciona los días que no aplicarán para el catálogo.
                          </p>
                        </div>

                        <ToggleSwitch
                          checked={form.bloquea_fechas_personalizadas}
                          activeLabel="Fechas personalizadas activas"
                          inactiveLabel="Fechas personalizadas inactivas"
                          onChange={(checked) =>
                            setForm((f) => ({
                              ...f,
                              bloquea_fechas_personalizadas: checked,
                              fechas_bloqueadas: checked ? f.fechas_bloqueadas : [],
                            }))
                          }
                        />
                      </div>

                      {form.bloquea_fechas_personalizadas && (
                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
                          <div className="rounded-lg overflow-hidden border border-cnt-border bg-cnt-dark p-2">
                            <DatePicker
                              inline
                              locale="es"
                              selected={null}
                              onChange={(date: Date | null) => {
                                if (date) toggleFechaBloqueada(date);
                              }}
                              minDate={new Date()}
                              highlightDates={form.fechas_bloqueadas.map(fromDateOnly)}
                            />
                          </div>

                          <div>
                            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                              Fechas bloqueadas
                            </p>

                            {form.fechas_bloqueadas.length === 0 ? (
                              <p className="text-sm text-gray-500">
                                No has seleccionado fechas bloqueadas.
                              </p>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {form.fechas_bloqueadas.map((fecha) => (
                                  <button
                                    key={fecha}
                                    type="button"
                                    onClick={() =>
                                      setForm((f) => ({
                                        ...f,
                                        fechas_bloqueadas: f.fechas_bloqueadas.filter(
                                          (item) => item !== fecha
                                        ),
                                      }))
                                    }
                                    className="cursor-pointer rounded-full border border-blue-900/60 bg-blue-950/30 px-3 py-1 text-xs text-blue-200 hover:border-cnt-red hover:text-white"
                                    title="Quitar fecha"
                                  >
                                    {fecha} ×
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

            <div className="md:col-span-2 rounded-xl border border-cnt-border bg-cnt-dark p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">
                    ¿Agregar hora de cita o lanzamiento?
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Si se habilita, el cliente podrá seleccionar una hora. Si hay rango de fechas,
                    esa hora aplicará a todas las fechas aplicables del rango.
                  </p>
                </div>

                <ToggleSwitch
                  id="usa_hora_cita"
                  checked={form.usa_hora_cita}
                  activeLabel="Hora de cita activa"
                  inactiveLabel="Hora de cita inactiva"
                  onChange={(checked) =>
                    setForm((f) => ({
                      ...f,
                      usa_hora_cita: checked,
                    }))
                  }
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                Subir imagen
              </label>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => handleImageFile(e.target.files?.[0] ?? null)}
                className="w-full bg-cnt-dark border border-cnt-border text-gray-400 file:mr-4 file:border-0 file:bg-cnt-red file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-red-700 rounded-lg px-3 py-2 text-sm cursor-pointer file:cursor-pointer"
              />
            </div>

            {/* <div>
              <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                O usar URL externa
              </label>
              <input
                placeholder="https://ejemplo.com/imagen.jpg"
                value={form.imagen}
                onChange={e => handleImageUrl(e.target.value)}
                className="w-full bg-cnt-dark border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
              />
            </div> */}

            {preview && (
              <div>
                <label className="block text-xs text-gray-400 uppercase tracking-widest mb-2">
                  Vista previa Actual
                </label>
                <div className="relative w-full h-56 rounded-xl overflow-hidden border border-cnt-border bg-cnt-dark">
                  <img
                    src={preview}
                    alt="Vista previa actual"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-4 rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  Publicado / Activo
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Si está activo, el ítem será visible para los clientes.
                </p>
              </div>

              <ToggleSwitch
                id="activo"
                checked={form.activo}
                activeLabel="Publicado"
                inactiveLabel="Inactivo"
                onChange={(checked) =>
                  setForm((f) => ({
                    ...f,
                    activo: checked,
                  }))
                }
              />
            </div>

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

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="bg-cnt-red border border-cnt-border hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed cursor-pointer text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
              >
                {loading ? 'Guardando...' : editId ? 'Actualizar' : 'Crear'}
              </button>
              {editId && (
                <button
                  onClick={resetForm}
                  className="bg-cnt-surface border border-cnt-border text-gray-400 hover:text-white cursor-pointer px-6 py-2.5 rounded-lg text-sm transition-colors"
                >
                  Cancelar
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="bg-cnt-surface border border-cnt-border rounded-xl p-6">
          <div className="mb-6">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
              Resumen
            </p>
            <h2 className="text-white text-xl font-semibold">
              Ítems del catálogo ({items.length})
            </h2>
          </div>

          <div className="space-y-4 max-h-[900px] overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-cnt-border rounded-xl bg-cnt-dark">
                <p className="text-4xl mb-3">🗂️</p>
                <p className="text-gray-400 text-sm">Aún no hay ítems registrados</p>
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.id}
                  className="bg-cnt-dark border border-cnt-border rounded-xl p-4 hover:border-gray-600 transition-colors"
                >
                  <div className="grid grid-cols-[80px_1fr] gap-4">
                    <div className="w-20 h-16 bg-cnt-surface rounded-lg overflow-hidden flex-shrink-0">
                      {item.imagen ? (
                        <img
                          src={item.imagen}
                          alt={item.titulo}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                          Sin imagen
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <p className="font-medium text-white break-words leading-snug">
                        {item.titulo || 'Sin título'}
                      </p>

                      <p className="text-sm text-gray-500 mt-1">
                        {formatCategoria(item.categoria)} · ${formatMoney(item.precio)}
                      </p>

                      <div className="mt-2 flex flex-wrap gap-2">
                        {toBooleanDb(item.usa_rango_fechas) && Number(item.rango_dias) > 0 && (
                          <span className="inline-flex items-center rounded-full border border-blue-900/60 bg-blue-950/30 px-2 py-0.5 text-xs text-blue-300">
                            Rango: {Number(item.rango_dias)} día
                            {Number(item.rango_dias) === 1 ? '' : 's'}
                          </span>
                        )}

                        {toBooleanDb(item.usa_hora_cita) && (
                          <span className="inline-flex items-center rounded-full border border-purple-900/60 bg-purple-950/30 px-2 py-0.5 text-xs text-purple-300">
                            Permite hora
                          </span>
                        )}

                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs border ${
                            item.activo
                              ? 'bg-green-900/50 text-green-300 border-green-800'
                              : 'bg-gray-800 text-gray-400 border-gray-700'
                          }`}
                        >
                          {item.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-cnt-border pt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleEdit(item)}
                      className="w-full sm:w-auto rounded-lg border border-cnt-border bg-cnt-surface px-3 py-2 text-sm text-white hover:border-gray-500 transition-colors cursor-pointer"
                    >
                      Editar
                    </button>

                    <div className="sm:text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="w-full sm:w-auto rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300 hover:bg-red-900/40 hover:text-red-200 transition-colors cursor-pointer"
                      >
                        Eliminar permanentemente
                      </button>

                      <p className="mt-1 text-[11px] leading-snug text-gray-500 max-w-xs">
                        Solo aplica si nunca se ha comprado este ítem.
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}