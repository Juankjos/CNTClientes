// src/app/(protected)/admin/catalog/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CatalogoItem, CatalogoFormData } from '@/types';
import { apiPath } from '@/lib/api-path';

const CATEGORIAS = ['reportaje', 'noticia', 'entrevista', 'especial'] as const;

const emptyForm = (): CatalogoFormData => ({
  titulo: '',
  descripcion: '',
  categoria: 'reportaje',
  precio: 0,
  imagen: '',
  activo: true,
});

const formatCategoria = (categoria: string) =>
  categoria.charAt(0).toUpperCase() + categoria.slice(1);

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

  const resetForm = () => {
    setEditId(null);
    setForm(emptyForm());
    setPreview('');
    setImageFile(null);
  };

  const handleSubmit = async () => {
    try {
      setLoading(true);
      setMsg(null);

      const uploadedImageUrl = await uploadSelectedImage();

      const payload = {
        ...form,
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

    setForm({
      titulo: item.titulo,
      descripcion: item.descripcion ?? '',
      categoria: item.categoria,
      precio: Number(item.precio),
      imagen: item.imagen ?? '',
      activo: Boolean(item.activo),
    });

    setPreview(item.imagen ?? '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Eliminar este item del catálogo?')) return;
    await fetch(apiPath(`/api/admin/catalog/${id}`), { method: 'DELETE' });
    fetchItems();
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-cnt-red font-mono text-xs tracking-widest uppercase mb-1">
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
          ← Volver
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
                  onChange={e =>
                    setForm(f => ({ ...f, categoria: e.target.value as typeof form.categoria }))
                  }
                  className="w-full bg-cnt-dark border border-cnt-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors cursor-pointer"
                >
                  {CATEGORIAS.map(categoria => (
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
                  Vista previa
                </label>
                <div className="relative w-full h-56 rounded-xl overflow-hidden border border-cnt-border bg-cnt-dark">
                  <img
                    src={preview}
                    alt="Vista previa"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            <label
              htmlFor="activo"
              className="flex items-center gap-3 rounded-lg border border-cnt-border bg-cnt-dark px-4 py-3 cursor-pointer"
            >
              <input
                type="checkbox"
                id="activo"
                checked={form.activo}
                onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))}
                className="h-4 w-4 accent-red-600 cursor-pointer"
              />
              <span className="text-sm text-gray-300">
                Publicado / Activo
              </span>
            </label>

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
                className="bg-cnt-red hover:bg-red-700 disabled:bg-red-900 disabled:cursor-not-allowed cursor-pointer text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all"
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

          <div className="space-y-3 max-h-[900px] overflow-y-auto pr-1">
            {items.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-cnt-border rounded-xl bg-cnt-dark">
                <p className="text-4xl mb-3">🗂️</p>
                <p className="text-gray-400 text-sm">Aún no hay ítems registrados</p>
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 bg-cnt-dark border border-cnt-border rounded-xl p-4 hover:border-gray-600 transition-colors"
                >
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

                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{item.titulo}</p>
                    <p className="text-sm text-gray-500">
                      {formatCategoria(item.categoria)} · ${Number(item.precio).toFixed(2)}
                    </p>
                    <span
                      className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full ${
                        item.activo
                          ? 'bg-green-900/50 text-green-300 border border-green-800'
                          : 'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}
                    >
                      {item.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-sm text-white hover:underline text-left cursor-pointer"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="text-sm text-red-300 hover:underline text-left cursor-pointer"
                    >
                      Eliminar
                    </button>
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