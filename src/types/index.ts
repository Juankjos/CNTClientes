//src/types/index.ts
export interface SessionUser {
  id: number;
  username: string;
  email: string;
  rol: 'admin' | 'cliente';
}

export interface CatalogItem {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: 'reportaje' | 'noticia' | 'entrevista' | 'especial';
  usa_rango_fechas?: number | boolean;
  rango_dias?: number | null;
  precio: string | number;
  imagen: string | null; 
  archivo: string | null;
  activo: number;
  fecha_publicacion: string;
  ya_pagado?: number;
}

export interface Pago {
  id: number;
  cliente_id: number;
  catalogo_id: number;
  referencia: string;
  monto: string | number;
  estatus: 'pendiente' | 'pagado' | 'cancelado' | 'reembolsado';
  metodo_pago: string;
  respuesta: string | null;
  created_at: string;
  updated_at: string;
}

export interface Usuario {
  id: number;
  username: string;
  email: string;
  rol: 'admin' | 'cliente';
  activo: number;
  intentos_login: number;
  bloqueado_hasta: string | null;
  ultimo_login: string | null;
  ultima_ip: string | null;
  created_at: string;
}

export interface LogEntry {
  id: number;
  usuario_id: number | null;
  accion: string;
  modulo: string | null;
  descripcion: string | null;
  ip: string | null;
  nivel: 'debug' | 'info' | 'warning' | 'error';
  created_at: string;
  username?: string;
}

// Agrega esto al archivo existente

export type CatalogoItem = {
  id: number;
  titulo: string;
  descripcion: string | null;
  categoria: 'reportaje' | 'noticia' | 'entrevista' | 'especial';
  usa_rango_fechas: boolean | number;
  rango_dias: number | null;
  precio: number;
  imagen: string | null;
  archivo: string | null;
  activo: boolean;
  fecha_publicacion: string;
};

export type CatalogoFormData = {
  titulo: string;
  descripcion: string;
  categoria: 'reportaje' | 'noticia' | 'entrevista' | 'especial';
  usa_rango_fechas: boolean;
  rango_dias: number | null;
  precio: number;
  imagen: string;
  activo: boolean;
};

// Augment iron-session
declare module 'iron-session' {
  interface IronSessionData {
    user?: SessionUser;
  }
}
