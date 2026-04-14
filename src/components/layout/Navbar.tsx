'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import type { SessionUser } from '@/types';
import { apiPath } from '@/lib/api-path';

interface NavbarProps { user: SessionUser }

const navLinks = [
  { href: '/catalog', label: 'Catálogo' },
  { href: '/payments/history', label: 'Mis Pagos' },
  { href: '/profile', label: 'Mi Perfil' },
];

export default function Navbar({ user }: NavbarProps) {
  const router   = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch(apiPath('/api/auth/logout'), { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 bg-cnt-dark/95 backdrop-blur border-b border-cnt-border">
      <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/catalog" className="flex items-center gap-3 group">
          <div className="w-7 h-7 bg-cnt-red rounded-sm flex items-center justify-center shrink-0">
            <span className="text-white font-black text-[10px]">CNT</span>
          </div>
          <span className="font-display text-white text-lg tracking-wide group-hover:text-gray-200 transition-colors hidden sm:block">
            TV Cable Tepa
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-md text-sm transition-colors ${
                pathname.startsWith(href)
                  ? 'text-white bg-cnt-surface'
                  : 'text-gray-400 hover:text-white hover:bg-cnt-surface/50'
              }`}
            >
              {label}
            </Link>
          ))}
          {user.rol === 'admin' && (
            <Link
              href="/admin"
              className={`px-4 py-2 rounded-md text-sm transition-colors duration-200 ${
                pathname.startsWith('/admin')
                  ? 'text-white bg-red-950/40'
                  : 'text-gray-400 hover:text-red-300 hover:bg-red-950/20'
              }`}
            >
              Admin
            </Link>
          )}
        </nav>

        {/* User actions */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-gray-500">
            {user.username}
            {user.rol === 'admin' && (
              <span className="ml-1.5 px-1.5 py-0.5 bg-red-950 text-cnt-red rounded text-[10px] uppercase tracking-wider">
                admin
              </span>
            )}
          </span>
          <button
            onClick={logout}
            className="cursor-pointer px-3 py-1.5 text-xs text-gray-400 hover:text-white border border-cnt-border hover:border-gray-500 rounded-md transition-all"
          >
            Salir
          </button>

          {/* Mobile menu btn */}
          <button onClick={() => setOpen(!open)} className="md:hidden text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {open
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16"/>
              }
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      {open && (
        <div className="md:hidden border-t border-cnt-border bg-cnt-surface">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="block px-6 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
            >
              {label}
            </Link>
          ))}
          {user.rol === 'admin' && (
            <Link href="/admin" onClick={() => setOpen(false)}
              className="block px-6 py-3 text-sm text-cnt-red hover:bg-red-950/20 transition-colors">
              Panel Admin
            </Link>
          )}
        </div>
      )}
    </header>
  );
}
