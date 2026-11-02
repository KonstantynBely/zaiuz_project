import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

// Jeden korzeń React obsługuje SPA; brak kontenera oznacza błąd integracji z index.html.
// StrictMode pomaga wykryć efekty bez poprawnego sprzątania w środowisku developerskim.
const container = document.getElementById('root');
if (!container) throw new Error('Nie znaleziono elementu root');
createRoot(container).render(<StrictMode><App /></StrictMode>);
