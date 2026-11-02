import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../../api/admin';

/**
 * Utrzymuje token wyłącznie w pamięci karty i planuje lokalne wygaśnięcie sesji.
 * Nie zapisuje sekretu do localStorage; wylogowanie lokalne działa także przy awarii żądania logout.
 */
export function useAdminSession(onExpired: () => void) {
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  /** Zachowuje token w pamięci i wyznacza expiresAt z czasu życia otrzymanego z API. */
  const login = useCallback((token: string, expiresIn: number) => {
    setSession({ token, expiresAt: Date.now() + expiresIn * 1000 });
  }, []);
  /** Usuwa token z pamięci karty bez wykonywania żądania sieciowego. */
  const clear = useCallback(() => setSession(null), []);
  /** Czyści sesję lokalną i próbuje unieważnić token na serwerze; awaria sieci nie przywraca tokenu. */
  const logout = useCallback(() => {
    const token = session?.token;
    clear();
    if (token) void adminApi.logout(token).catch(/** Pozostawia lokalną sesję zakończoną, nawet jeśli serwer nie potwierdził wylogowania. */ () => {
      // Local logout still succeeds when the server cannot be reached.
    });
  }, [session, clear]);

  /** Planuje lokalne wygaśnięcie tokenu na podstawie expiresAt i usuwa poprzedni timer przy zmianie sesji. */
  useEffect(() => {
    if (!session) return;
    /** Czyści lokalną sesję i przekazuje informację o jej wygaśnięciu do rodzica. */
    const expire = () => { clear(); onExpired(); };
    const remaining = session.expiresAt - Date.now();
    if (remaining <= 0) { expire(); return; }
    const timer = window.setTimeout(expire, remaining);
    return /** Usuwa timer wygaśnięcia poprzedniej sesji. */ () => window.clearTimeout(timer);
  }, [session, clear, onExpired]);

  return { session, login, logout, clear };
}
