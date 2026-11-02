import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';

/**
 * Utrzymuje token wyłącznie w pamięci karty i planuje lokalne wygaśnięcie sesji.
 * Nie zapisuje sekretu do localStorage; wylogowanie lokalne działa także przy awarii żądania logout.
 */
export function useAdminSession(onExpired: () => void) {
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const login = useCallback((token: string, expiresIn: number) => {
    setSession({ token, expiresAt: Date.now() + expiresIn * 1000 });
  }, []);
  const clear = useCallback(() => setSession(null), []);
  const logout = useCallback(() => {
    const token = session?.token;
    clear();
    if (token) void adminApi.logout(token).catch( () => {
      // Local logout still succeeds when the server cannot be reached.
    });
  }, [session, clear]);

  useEffect(() => {
    if (!session) return;
    const expire = () => { clear(); onExpired(); };
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, remaining);
    return () => window.clearTimeout(timer);
  }, [session, clear, onExpired]);

  return { session, login, logout, clear };
}
