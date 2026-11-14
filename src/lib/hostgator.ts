const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim().replace(/\/$/, '') || '/api';

export type ApiError = Error & { code?: string; status?: number };

function csrfCookie(): string {
  const entry = document.cookie.split('; ').find(value => value.startsWith('vf_csrf='));
  return entry ? decodeURIComponent(entry.slice('vf_csrf='.length)) : '';
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = csrfCookie();
    if (csrf) headers.set('X-CSRF-Token', csrf);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
      ...options,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw Object.assign(new Error('Não foi possível conectar à API do VagaFácil.'), { code: 'NETWORK_ERROR' }) as ApiError;
  }

  const payload = await response.json().catch(() => null) as
    | (T & { error?: { code?: string; message?: string } })
    | null;

  if (!response.ok) {
    const error = Object.assign(
      new Error(payload?.error?.message || `Falha na API (HTTP ${response.status}).`),
      { code: payload?.error?.code, status: response.status },
    ) as ApiError;
    throw error;
  }

  if (payload === null) {
    throw Object.assign(new Error('A API retornou uma resposta inválida.'), { code: 'INVALID_RESPONSE' }) as ApiError;
  }
  return payload;
}

export type ApiUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'supervisor' | 'agent' | 'citizen';
  is_active: boolean;
};

export const hostgatorAuth = {
  login: (email: string, password: string) =>
    apiRequest<{ ok: true; csrf_token: string; user: ApiUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => apiRequest<{ ok: true; csrf_token: string; user: ApiUser }>('/auth/me'),
  logout: () => apiRequest<{ ok: true }>('/auth/logout', { method: 'POST', body: '{}' }),
};
