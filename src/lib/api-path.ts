export const APP_BASE_PATH = '/CNTClientes';

export function apiPath(path: string) {
    const normalized = path.startsWith('/') ? path : `/${path}`;

    if (!normalized.startsWith('/api/')) {
        throw new Error(`apiPath solo debe usarse con rutas /api/*: ${path}`);
    }

    return `${APP_BASE_PATH}${normalized}`;
}