// src/lib/api-path.ts
export const APP_BASE_PATH = process.env.APP_BASE_PATH || '/CNTClientes';

export function withBasePath(path: string) {
    const normalized = path.startsWith('/') ? path : `/${path}`;
    return `${APP_BASE_PATH}${normalized}`;
}

export function apiPath(path: string) {
    const normalized = path.startsWith('/') ? path : `/${path}`;

    if (!normalized.startsWith('/api/')) {
        throw new Error(`apiPath solo debe usarse con rutas /api/*: ${path}`);
    }

    return withBasePath(normalized);
}