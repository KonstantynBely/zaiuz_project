/** Odmowa HTTP z kodem statusu, odróżniana w UI od błędów sieci i anulowania. */
export class ApiRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/**
 * Wysyła żądanie JSON bez cache z opcjonalnym Bearer i sygnałem anulowania.
 * Dla 204 nie parsuje body, a dla odmowy odczytuje Problem Details lub używa kodu HTTP.
 * @returns Odpowiedź JSON rzutowana na T; nie wykonuje walidacji struktury danych w runtime.
 * @throws ApiRequestError dla statusu spoza 2xx; błędy sieci i anulowanie zachowują typ fetch.
 */
export async function request<T>(path: string, options: {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  token?: string;
  body?: object;
  signal?: AbortSignal;
} = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method ?? 'GET',
    cache: 'no-store',
    signal: options.signal,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  if (!response.ok) {
    let detail = '';
    try {
      const problem = await response.json() as { detail?: string; title?: string };
      detail = problem.detail || problem.title || '';
    } catch { /* Odpowiedź reverse proxy nie musi zawierać JSON. */ }
    throw new ApiRequestError(response.status, detail || 'Serwer zwrócił HTTP ' + response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
