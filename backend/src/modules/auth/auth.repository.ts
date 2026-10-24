import type { Pool } from 'pg';
import { transaction } from '../../common/transaction.js';

interface AdminRow { id: string; username: string; password_hash: string }

export function createAuthRepository(pool: Pool) {
  return {
    async findAdmin(username: string): Promise<AdminRow | null> {
      const rows = await pool.query<AdminRow>(
        'SELECT id::text, username, password_hash FROM admins WHERE username=$1', [username]);
      return rows.rows[0] ?? null;
    },
    async findSession(tokenHash: string): Promise<AdminRow | null> {
      const rows = await pool.query<AdminRow>(
        `SELECT a.id::text, a.username, a.password_hash
         FROM access_tokens t JOIN admins a ON t.admin_id=a.id
         WHERE t.token_hash=$1 AND t.revoked_at IS NULL AND t.expires_at > now()`, [tokenHash]);
      return rows.rows[0] ?? null;
    },
    async storeToken(adminId: string, expectedHash: string, tokenHash: string, expiresAt: Date): Promise<boolean> {
      return transaction(pool, async client => {
        // Password changes lock this same row until all old sessions are revoked.
        const current = await client.query<{ password_hash: string }>(
          'SELECT password_hash FROM admins WHERE id=$1 FOR UPDATE', [adminId]);
        if (current.rows[0]?.password_hash !== expectedHash) return false;
        await client.query('INSERT INTO access_tokens(token_hash,admin_id,expires_at) VALUES($1,$2,$3)',
          [tokenHash, adminId, expiresAt]);
        return true;
      });
    },
    async revokeToken(tokenHash: string): Promise<void> {
      await pool.query('UPDATE access_tokens SET revoked_at=now() WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash]);
    },
    async changePassword(adminId: string, currentHash: string, nextHash: string): Promise<boolean> {
      return transaction(pool, async client => {
        const result = await client.query(
          'UPDATE admins SET password_hash=$3 WHERE id=$1 AND password_hash=$2 RETURNING id',
          [adminId, currentHash, nextHash]);
        if (!result.rowCount) return false;
        await client.query('UPDATE access_tokens SET revoked_at=now() WHERE admin_id=$1 AND revoked_at IS NULL', [adminId]);
        return true;
      });
    },
  };
}
export type AuthRepository = ReturnType<typeof createAuthRepository>;
