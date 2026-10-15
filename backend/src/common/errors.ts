import type { FastifyError, FastifyInstance } from 'fastify';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

const titles: Record<number, string> = {
  400: 'Niepoprawne żądanie', 401: 'Brak autoryzacji', 403: 'Brak dostępu',
  404: 'Nie znaleziono zasobu', 406: 'Nieakceptowany format odpowiedzi',
  409: 'Konflikt', 415: 'Nieobsługiwany format danych',
  422: 'Niepoprawna wartość', 500: 'Błąd serwera',
};

/** Wspólna obsługa RFC 9457 bez ujawniania danych dostępowych lub stosów wywołań. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).type('application/problem+json').send({
      type: 'about:blank', title: titles[404], status: 404,
    });
  });
  app.setErrorHandler((error: FastifyError | ApiError, request, reply) => {
    let status = error instanceof ApiError ? error.status : error.statusCode ?? 500;
    if (!(error instanceof ApiError) && error.validation) status = 400;
    if (!(error instanceof ApiError) && error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') status = 415;
    if (!(error instanceof ApiError) && (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY' || error.code === 'FST_ERR_CTP_EMPTY_JSON_BODY')) status = 400;
    if (status < 400 || status > 599) status = 500;
    if (status >= 500) request.log.error({ err: error }, 'Błąd aplikacji');
    reply.code(status).type('application/problem+json').send({
      type: 'about:blank', title: titles[status] ?? 'Błąd żądania',
      status, ...((error instanceof ApiError && status < 500) ? { detail: error.message } : {}),
    });
  });
}

/** Weryfikuje negocjację formatów odpowiedzi, także dla żądań bez body. */
export function acceptsJson(value: string | undefined): boolean {
  if (!value) return true;
  return value.split(',').some(part => {
    const [type, ...options] = part.trim().toLowerCase().split(';');
    if (!['*/*', 'application/*', 'application/json', 'application/problem+json'].includes(type ?? '')) return false;
    const q = options.find(x => x.trim().startsWith('q='));
    return !q || Number(q.trim().slice(2)) > 0;
  });
}
