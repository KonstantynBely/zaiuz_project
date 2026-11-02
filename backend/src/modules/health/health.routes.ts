import type { FastifyInstance } from 'fastify';

/**
 * Rejestruje publiczny healthcheck procesu HTTP.
 * Odpowiedź ok nie sprawdza bieżącego połączenia z bazą; jej kontrolę startową wykonuje server.ts.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/health', /** Zwraca kontraktowy stan ok procesu HTTP bez wykonywania zapytania do bazy. */ async () => ({ status: 'ok' as const }));
}
