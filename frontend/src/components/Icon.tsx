import type { ReactNode } from 'react';
export type IconName = 'dashboard' | 'chart' | 'layers' | 'radio' | 'clock' | 'settings' | 'refresh' | 'menu' | 'activity' | 'database' | 'planet' | 'print' | 'lock' | 'logout' | 'thermometer' | 'droplet' | 'battery' | 'gauge' | 'wind' | 'sun';
/**
 * Renderuje wybraną ikonę SVG o podanym rozmiarze w kolorze currentColor.
 * SVG jest dekoracyjne (aria-hidden); nazwę dostępną musi zapewnić otaczający element.
 */
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    thermometer: <><path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z"/><path d="M12 9v9"/><circle cx="12" cy="18" r="1"/></>,
    droplet: <><path d="M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Z"/><path d="M8 15a4 4 0 0 0 4 4"/></>,
    battery: <><rect x="2" y="6" width="17" height="12" rx="2"/><path d="M22 10v4M6 10v4m4-4v4m4-4v4"/></>,
    gauge: <><path d="M4 19a10 10 0 1 1 16 0Z"/><path d="m12 13 5-5M5 12h1m6-7v1m6 6h1"/><circle cx="12" cy="13" r="1"/></>,
    wind: <><path d="M3 8h12a3 3 0 1 0-3-3M2 12h17a3 3 0 1 1-3 3M4 16h5a3 3 0 1 1-3 3"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
    dashboard: <><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></>,
    chart: <><path d="M3 20V4M3 20h18"/><path d="m6 15 4-5 4 3 6-8"/></>,
    layers: <><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/></>,
    radio: <><circle cx="12" cy="12" r="2"/><path d="M7 7a7 7 0 0 0 0 10m10-10a7 7 0 0 1 0 10M4 4a11 11 0 0 0 0 16m16-16a11 11 0 0 1 0 16"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 12-3L20 12M4 12l2.4 6a7 7 0 0 0 12-3"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    activity: <><path d="M2 12h5l3-8 4 16 3-8h5"/></>,
    database: <><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/></>,
    planet: <><circle cx="12" cy="12" r="6"/><path d="M2 15c3 3 17 1 20-6"/></>,
    print: <><path d="M6 9V3h12v6M6 17H4V9h16v8h-2M6 14h12v7H6z"/></>,
    logout: <><path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

