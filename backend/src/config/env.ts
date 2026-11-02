/**
 * Odczytuje adres nasłuchiwania i weryfikuje całkowity port 1–65535.
 * @param env Środowisko procesu; jawny argument pozwala testować konfigurację bez globalnych zmian.
 * @returns Host i port; domyślnie 127.0.0.1:3000.
 * @throws Error przy niepoprawnym porcie.
 */
export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT musi być liczbą całkowitą z zakresu 1–65535');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
  };
}

/**
 * Wymaga jawnego DATABASE_URL wskazującego PostgreSQL.
 * Nie tworzy połączenia ani nie wybiera bazy zastępczej.
 * @throws Error przy braku adresu, błędnym URL lub innym protokole.
 */
export function requiredDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('Ustaw DATABASE_URL (PostgreSQL + TimescaleDB)');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL musi wskazywać PostgreSQL');
  }
  return url;
}
