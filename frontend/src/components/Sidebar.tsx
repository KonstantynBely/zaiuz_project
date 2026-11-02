import type { RefObject } from 'react';
import type { AdminView } from '../features/admin/AdminPanel';
import { Icon } from './Icon';

/** Widok całej aplikacji: publiczny pulpit lub jeden z paneli zarządzania. */
type Screen = 'dashboard' | 'simulations' | AdminView;
/** Dozwolone kotwice publicznego pulpitu, odpowiadające sekcjom dokumentu HTML. */
type DashboardSection = 'dashboard' | 'telemetry' | 'records';

/** Kontrakt właściwości komponentu Sidebar: dane kontrolowane i callbacki właściciela stanu. */
interface Props {
  sidebarElement: RefObject<HTMLElement | null>;
  menuOpen: boolean;
  compact: boolean;
  signedIn: boolean;
  screen: Screen;
  activeSection: string;
  onDashboardSection: (section: DashboardSection) => void;
  onAdminSection: (view: AdminView | 'simulations') => void;
  onLogout: () => void;
}

/**
 * Renderuje publiczną nawigację i opcje administratora zależne od sesji.
 * Na małym ekranie ukryty panel jest inert; zarządzanie fokusem i zmianą widoku pozostawia App.
 */
export function Sidebar({
  sidebarElement, menuOpen, compact, signedIn, screen, activeSection,
  onDashboardSection, onAdminSection, onLogout,
}: Props) {
  return (
      <aside ref={sidebarElement} id="mission-navigation" className={'sidebar ' + (menuOpen ? 'is-open' : '')} aria-label="Menu aplikacji" aria-hidden={compact && !menuOpen} inert={compact && !menuOpen}>
        <a className="brand" href="#dashboard" onClick={/** Wybiera wskazaną kotwicę publicznego pulpitu przez callback nawigacji rodzica. */ () => onDashboardSection("dashboard")}>
          <span className="brand-symbol"><Icon name="planet" size={25}/></span>
          <span className="brand-copy"><strong>RoverSense</strong></span>
        </a>
        <nav className="side-nav" aria-label="Nawigacja główna">
          <a className={'nav-link ' + (screen === 'dashboard' && activeSection === 'dashboard' ? 'active' : '')} href="#dashboard" aria-current={screen === 'dashboard' && activeSection === 'dashboard' ? 'location' : undefined} onClick={/** Wybiera wskazaną kotwicę publicznego pulpitu przez callback nawigacji rodzica. */ () => onDashboardSection('dashboard')}><Icon name="dashboard"/>Pulpit</a>
          <a className={'nav-link ' + (screen === 'dashboard' && activeSection === 'telemetry' ? 'active' : '')} href="#telemetry" aria-current={screen === 'dashboard' && activeSection === 'telemetry' ? 'location' : undefined} onClick={/** Wybiera wskazaną kotwicę publicznego pulpitu przez callback nawigacji rodzica. */ () => onDashboardSection('telemetry')}><Icon name="chart"/>Wykres pomiarów</a>
          <a className={'nav-link ' + (screen === 'dashboard' && activeSection === 'records' ? 'active' : '')} href="#records" aria-current={screen === 'dashboard' && activeSection === 'records' ? 'location' : undefined} onClick={/** Wybiera wskazaną kotwicę publicznego pulpitu przez callback nawigacji rodzica. */ () => onDashboardSection('records')}><Icon name="clock"/>Historia pomiarów</a>
        </nav>
        {signedIn && (
          <div className="nav-secondary">
            <p className="nav-caption">Zarządzanie</p>
            <button className={"nav-link " + (screen === "series" ? "active" : "")} type="button" onClick={/** Otwiera wskazaną zakładkę zarządzania lub formularz logowania przez rodzica. */ () => onAdminSection("series")}><Icon name="layers"/>Serie pomiarowe</button>
            <button className={"nav-link " + (screen === "sensors" ? "active" : "")} type="button" onClick={/** Otwiera wskazaną zakładkę zarządzania lub formularz logowania przez rodzica. */ () => onAdminSection("sensors")}><Icon name="radio"/>Czujniki</button>
            <button className={"nav-link " + (screen === "simulations" ? "active" : "")} type="button" onClick={/** Otwiera wskazaną zakładkę zarządzania lub formularz logowania przez rodzica. */ () => onAdminSection("simulations")}><Icon name="activity"/>Symulatory</button>
            <button className={"nav-link " + (screen === "account" ? "active" : "")} type="button" onClick={/** Otwiera wskazaną zakładkę zarządzania lub formularz logowania przez rodzica. */ () => onAdminSection("account")}><Icon name="settings"/>Zmiana hasła</button>
          </div>
        )}
        <div className="sidebar-bottom">
          {signedIn ? <button className="sidebar-login-button" type="button" onClick={onLogout}><Icon name="logout" size={15}/> Wyloguj się</button> : <button className="sidebar-login-button" type="button" onClick={/** Otwiera wskazaną zakładkę zarządzania lub formularz logowania przez rodzica. */ () => onAdminSection('account')}><Icon name="lock" size={15}/> Zaloguj się</button>}
        </div>
      </aside>
  );
}
