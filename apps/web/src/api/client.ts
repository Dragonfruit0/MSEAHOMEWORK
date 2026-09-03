import axios from 'axios';

export const api = axios.create({ baseURL: '/api', withCredentials: true });

export function getAccessToken(): string | null {
  return localStorage.getItem('hp_access_token');
}

export function setAccessToken(token: string | null) {
  if (token) localStorage.setItem('hp_access_token', token);
  else localStorage.removeItem('hp_access_token');
}

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Silent refresh: a 15-minute access token will routinely expire mid-session.
// On a 401, try the httpOnly refresh cookie once and replay the original
// request; concurrent 401s share a single in-flight refresh so a page that
// fires several requests at once doesn't burn multiple refresh rotations
// (each rotation revokes the previous refresh token).
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = api
      .post('/auth/refresh')
      .then((res) => {
        setAccessToken(res.data.accessToken);
        return res.data.accessToken as string;
      })
      .catch(() => {
        setAccessToken(null);
        return null;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

// Attachment downloads must go through this (not a plain <a href>) because
// the download route requires the bearer token, which a browser navigation
// never sends — it lives in localStorage, not a cookie. Axios follows the
// route's redirect to the storage provider's own signed URL transparently,
// so this works the same whether files are stored locally or in Supabase.
export async function downloadAttachment(url: string, filename: string): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(blobUrl);
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original?._retried && !original?.url?.includes('/auth/login') && !original?.url?.includes('/auth/refresh')) {
      original._retried = true;
      const newToken = await refreshAccessToken();
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);
