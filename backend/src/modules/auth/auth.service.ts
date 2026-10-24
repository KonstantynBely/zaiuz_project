import { randomBytes, createHash } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { ApiError } from '../../common/errors.js';
import type { AuthRepository } from './auth.repository.js';
import type { LoginBody, PasswordBody } from './auth.schema.js';

export const MAX_PASSWORD_BYTES = 72;
export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    throw new ApiError(422, 'Hasło może mieć najwyżej 72 bajty UTF-8.');
  }
  return hash(password, 12);
}

const TOKEN_LIFETIME = 3600;
const digest = (token: string) => createHash('sha256').update(token).digest('hex');

/** Nieprzezroczyste tokeny mają losową entropię i mogą zostać odwołane po logout. */
export function createAuthService(repository: AuthRepository) {
  return {
    async login(input: LoginBody) {
      if (Buffer.byteLength(input.password, 'utf8') > MAX_PASSWORD_BYTES) {
        throw new ApiError(401, 'Niepoprawny login lub hasło');
      }
      const admin = await repository.findAdmin(input.username);
      // Porównanie również przy nieistniejącym loginie ogranicza różnice czasowe.
      const existingHash = admin?.password_hash ?? DUMMY_HASH;
      const ok = await compare(input.password, existingHash);
      if (!admin || !ok) throw new ApiError(401, 'Niepoprawny login lub hasło');
      const token = randomBytes(32).toString('hex');
      const stored = await repository.storeToken(admin.id, existingHash, digest(token), new Date(Date.now() + TOKEN_LIFETIME * 1000));
      if (!stored) throw new ApiError(401, 'Hasło zostało zmienione. Zaloguj się ponownie.');
      return { accessToken: token, tokenType: 'Bearer' as const, expiresIn: TOKEN_LIFETIME };
    },
    async requireAdmin(token: string) {
      if (!/^[0-9a-f]{64}$/i.test(token)) throw new ApiError(401, 'Niepoprawny token');
      const admin = await repository.findSession(digest(token));
      if (!admin) throw new ApiError(401, 'Token wygasł lub został unieważniony');
      return admin;
    },
    async logout(token: string) { await this.requireAdmin(token); await repository.revokeToken(digest(token)); },
    async changePassword(token: string, body: PasswordBody) {
      const admin = await this.requireAdmin(token);
      if (Buffer.byteLength(body.currentPassword, 'utf8') > MAX_PASSWORD_BYTES ||
          !await compare(body.currentPassword, admin.password_hash)) {
        throw new ApiError(403, 'Bieżące hasło jest niepoprawne');
      }
      if (body.newPassword.length < 8) throw new ApiError(422, 'Nowe hasło jest zbyt krótkie');
      const updated = await repository.changePassword(admin.id, admin.password_hash, await hashPassword(body.newPassword));
      if (!updated) throw new ApiError(409, 'Hasło zostało zmienione w innej sesji');
    },
  };
}

// Poprawny bcrypt hash wykorzystywany wyłącznie do porównania przy nieznanym loginie.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOT46fyWda0noRPuOFXqeJPPhxf69mrHu';
export type AuthService = ReturnType<typeof createAuthService>;
