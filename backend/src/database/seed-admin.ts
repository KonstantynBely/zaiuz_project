import { hashPassword } from '../modules/auth/auth.service.js';
import { createPool } from './pool.js';
import { transaction } from '../common/transaction.js';

/** Uruchamiany ręcznie po migracji; nie zapisuje hasła ani jego wartości w logach. */
async function main() {
  const username = process.env.ADMIN_USERNAME?.trim();
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password || password.length < 12) {
    throw new Error('Wymagane ADMIN_USERNAME oraz ADMIN_PASSWORD (minimum 12 znaków)');
  }
  const pool = createPool();
  try {
    const passwordHash = await hashPassword(password);
    await transaction(pool, async client => {
      await client.query(
        `INSERT INTO admins(username,password_hash) VALUES($1,$2)
         ON CONFLICT (username) DO UPDATE SET password_hash=EXCLUDED.password_hash`,
        [username, passwordHash],
      );
      // Upsert ponownie hashuje hasło, zatem poprzednie sesje muszą być cofnięte.
      await client.query(
        'UPDATE access_tokens SET revoked_at=now() WHERE admin_id=(SELECT id FROM admins WHERE username=$1) AND revoked_at IS NULL',
        [username],
      );
    });
    process.stdout.write('Konto administratora jest gotowe.\n');
  } finally { await pool.end(); }
}
main().catch(error => { console.error('Nie udało się przygotować konta:', error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
