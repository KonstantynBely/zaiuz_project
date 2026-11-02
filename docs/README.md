# Dokumentacja aplikacji

Notatki techniczne do rozwijania, testowania i utrzymywania RoverSense. Opisują zachowanie kodu i konfigurację zapisaną w repozytorium; aktualny stan wdrożenia wymaga osobnego sprawdzenia.

| Dokument | Zawartość |
| --- | --- |
| [Architektura](ARCHITECTURE.md) | Podział aplikacji, przepływ pomiarów, REST/SSE, symulacje i ograniczenia. |
| [API](API.md) | Dostęp do endpointów, filtry, błędy oraz rozszerzenia SSE i symulacji. |
| [Model danych](ERD.md) | Diagram tabel, relacje, usuwanie danych i kolejka sprzątania. |
| [Bezpieczeństwo](SECURITY.md) | Hasła, sesje, klucze urządzeń, walidacja i konfiguracja HTTP. |
| [Testowanie](TESTING.md) | Testy bez bazy, izolowana integracja, dane testowe i scenariusze ręczne. |
| [Mapa kodu](CODE.md) | Punkty wejścia, odpowiedzialności modułów i konwencje komentarzy. |

Instrukcja uruchomienia lokalnego i generatora znajduje się w [głównym README](../README.md). Konfiguracje usług, aktywacja wydań i backupy są opisane w [dokumentacji serwera](../server/README.md).
