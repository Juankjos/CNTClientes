//src/app/(protected)/catalog/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiPath } from '@/lib/api-path';
import { formatMoney } from '@/lib/formatters';

const CATEGORIAS = ['', 'reportaje', 'noticia', 'entrevista', 'especial'] as const;
const LABELS: Record<string, string> = {
  '': 'Todo',
  reportaje:  'Reportajes',
  noticia:    'Noticias',
  entrevista: 'Entrevistas',
  especial:   'Especiales',
};
const BADGES: Record<string, string> = {
  reportaje:  'bg-blue-900 text-blue-300',
  noticia:    'bg-green-900 text-green-300',
  entrevista: 'bg-purple-900 text-purple-300',
  especial:   'bg-yellow-900 text-yellow-300',
};

interface CatalogItem {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: string;
  precio: number;
  imagen: string | null;
  fecha_publicacion: string;
  ya_pagado: number;
}

export default function CatalogPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems]     = useState<CatalogItem[]>([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState(searchParams.get('q') ?? '');
  const categoria = searchParams.get('cat') ?? '';
  const page      = parseInt(searchParams.get('page') ?? '1');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (categoria) params.set('categoria', categoria);
    if (busqueda)  params.set('q', busqueda);
    params.set('page', String(page));

    const res = await fetch(apiPath(`/api/catalog?${params.toString()}`));
    const data = await res.json();
    setItems(data.items ?? []);
    setPagination(data.pagination ?? { page: 1, pages: 1, total: 0 });
    setLoading(false);
  }, [categoria, busqueda, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  function navigate(params: Record<string, string>) {
    const sp = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([k, v]) => v ? sp.set(k, v) : sp.delete(k));
    sp.delete('page');
    router.push(`/catalog?${sp}`);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ q: busqueda });
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <p className="text-white font-mono text-xs tracking-widest uppercase mb-1">Portal CNT</p>
        <h1 className="font-display text-3xl text-white mb-1">Catálogo de Contenido</h1>
        <p className="text-gray-500 text-sm">{pagination.total} publicaciones disponibles</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 mb-8">
        {/* Búsqueda */}
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <input
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por título o descripción..."
            className="flex-1 bg-cnt-surface border border-cnt-border text-white placeholder-gray-600 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-cnt-red transition-colors"
          />
          <button type="submit" className="cursor-pointer px-4 py-2.5 bg-cnt-red hover:bg-red-700 text-white rounded-lg text-sm transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
          </button>
        </form>

        {/* Categorías */}
        <div className="flex gap-2 overflow-x-auto pb-1 shrink-0">
          {CATEGORIAS.map(cat => (
            <button
              key={cat}
              onClick={() => navigate({ cat })}
              className={`cursor-pointer px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-colors ${
                categoria === cat
                  ? 'bg-cnt-red text-white'
                  : 'bg-cnt-surface text-gray-400 hover:text-white border border-cnt-border'
              }`}
            >
              {LABELS[cat]}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-cnt-surface rounded-xl h-72 animate-pulse border border-cnt-border" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-5xl mb-4">📭</p>
          <p className="text-gray-400">No se encontraron publicaciones</p>
          {(busqueda || categoria) && (
            <button onClick={() => { setBusqueda(''); navigate({ cat: '', q: '' }); }}
              className="cursor-pointer mt-4 text-white text-sm hover:underline">
              Limpiar filtros
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map(item => (
            <Link key={item.id} href={`/catalog/${item.id}`}
              className="group bg-cnt-surface border border-cnt-border rounded-xl overflow-hidden hover:border-gray-600 transition-all duration-200 hover:-translate-y-0.5">

              {/* Imagen */}
              <div className="relative w-full h-48 bg-gray-100 rounded-t-lg overflow-hidden">
                {item.imagen ? (
                  <Image
                    src={item.imagen}
                    alt={item.titulo}
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    className="object-cover"
                    unoptimized // Quita esto si controlas el dominio de las imágenes
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400">
                    <span>Sin imagen</span>
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-semibold ${BADGES[item.categoria] ?? 'bg-gray-800 text-gray-300'}`}>
                    {item.categoria}
                  </span>
                </div>
                {item.ya_pagado > 0 && (
                  <div className="absolute top-2 right-2">
                    <span className="px-2 py-0.5 bg-green-900 text-green-300 rounded text-[10px] tracking-wider">✓ Adquirido</span>
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="text-white text-sm font-semibold line-clamp-2 mb-2 group-hover:text-gray-200 transition-colors">
                  {item.titulo}
                </h3>
                {item.descripcion && (
                  <p className="text-gray-500 text-xs line-clamp-2 mb-3">{item.descripcion}</p>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-white font-semibold text-sm">
                    {Number(item.precio) === 0 ? 'Gratuito' : `$${formatMoney(item.precio)} MXN`}
                  </span>
                  {/* <span className="text-gray-600 text-xs">
                    {new Date(item.fecha_publicacion).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                  </span> */}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Paginación */}
      {pagination.pages > 1 && (
        <div className="flex justify-center gap-2 mt-10">
          <button disabled={page <= 1}
            onClick={() => navigate({ page: String(page - 1) })}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40 hover:text-white transition-colors">
            ← Anterior
          </button>
          <span className="px-4 py-2 text-gray-400 text-sm">
            {page} / {pagination.pages}
          </span>
          <button disabled={page >= pagination.pages}
            onClick={() => navigate({ page: String(page + 1) })}
            className="px-4 py-2 bg-cnt-surface border border-cnt-border text-gray-400 rounded-lg text-sm disabled:opacity-40 hover:text-white transition-colors">
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
