/** Konfiguracja wymaga jawnego DATABASE_URL; aplikacja nie przełącza się na inną bazę. */
export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  const port = Number(env.PORT ?? '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT musi być liczbą całkowitą z zakresu 1–65535');
  }
  return {
    host: env.HOST ?? '127.0.0.1',
    port,
    databaseUrl: env.DATABASE_URL,
  };
}

export function requiredDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL;
  if (!url) throw new Error('Ustaw DATABASE_URL (PostgreSQL + TimescaleDB)');
  const parsed = new URL(url);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error('DATABASE_URL musi wskazywać PostgreSQL');
  }
  return url;
}
