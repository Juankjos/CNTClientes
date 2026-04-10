export const APP_BASE_PATH = '/CNTClientes';

export function apiPath(path: string) {
    return `${APP_BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}