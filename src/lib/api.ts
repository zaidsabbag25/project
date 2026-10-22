let csrfToken = '';
export function setCsrfToken(token: string) {
  csrfToken = token;
}
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (
    (options.body || (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))) &&
    !(options.body instanceof FormData)
  )
    headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method.toUpperCase()))
    headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch('/api' + path, { credentials: 'same-origin', ...options, headers });
  const result = await response
    .json()
    .catch(() => ({ error: 'The server returned an unexpected response.' }));
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  if (result.csrfToken) setCsrfToken(result.csrfToken);
  return result as T;
}
export const money = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const date = (value: string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
