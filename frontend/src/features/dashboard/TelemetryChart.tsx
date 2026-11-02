import { useLayoutEffect, useRef, useState } from 'react';
import type { Measurement, Series } from '../../api/client';
import { formatDate, formatValue } from './formatting';

/** Wzory linii współdzielone z legendą wydruku; indeks pochodzi z pełnej kolejności serii, niezależnie od filtrów. */
export const DASH_PATTERNS = ['none', '9 5', '3 4', '13 4 3 4'] as const;

/** Próbka przeliczona na współrzędne SVG, zachowująca ID, wartość i czas do zaznaczenia i opisu. */
interface ChartPoint {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: string;
}

/** Dane wykresu: widoczne serie, pełna kolejność legendy, próbki, zaznaczenie i tryb skali. */
interface TelemetryChartProps {
  series: Series[]; allSeries: Series[]; measurements: Measurement[]; selectedId: string | null; raw: boolean;
}

/**
 * Mierzy rzeczywisty kontener przez ResizeObserver i przekazuje jego rozmiar do SVG.
 * Nie wymusza szerokości desktopowej; efekt usuwa obserwator po odmontowaniu.
 */
export function TelemetryChart(props: TelemetryChartProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 880, height: 275 });

  /** Mierzy kontener przed malowaniem i rejestruje ResizeObserver; cleanup odłącza obserwator. */
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    /** Pomija niewidoczny kontener, zaokrągla dodatnie wymiary i unika aktualizacji identycznego rozmiaru. */
    const updateSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;
      const next = { width: Math.round(width), height: Math.round(height) };
      setSize(/** Zachowuje poprzednią referencję rozmiaru, jeśli wymiary kontenera nie uległy zmianie. */ previous => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    updateSize(element.clientWidth, element.clientHeight);
    const observer = new ResizeObserver(/** Przekazuje nowy rozmiar obszaru treści kontenera do stanu wykresu. */ ([entry]) => {
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return /** Odłącza obserwator rozmiaru po odmontowaniu wykresu. */ () => observer.disconnect();
  }, []);

  return <div className="chart-viewport" ref={viewport}><ChartPlot {...props} {...size}/></div>;
}

/**
 * Rysuje pomiary widocznych serii w SVG dopasowanym do kontenera.
 * Pozycję Y normalizuje względem zakresu serii, a opisy osi dobiera do trybu procentowego lub jednostek.
 * Liczba podpisów czasu zależy od szerokości, aby tekst pozostał czytelny na telefonie.
 */
function ChartPlot({ series, allSeries, measurements, selectedId, raw, width, height }: TelemetryChartProps & {
  width: number; height: number;
}) {
  const left = 60, right = 20, top = 21, bottom = 36;
  const values = measurements.filter(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ measurement => series.some(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ s => String(s.id) === String(measurement.seriesId)));
  if (values.length === 0) {
    return <div className="empty-chart"><strong>Brak pomiarów w wybranym zakresie</strong><span>Wybierz inne serie lub przedział czasu.</span></div>;
  }
  const stamps = values.map(/** Przelicza znacznik czasu próbki na milisekundy do porównania lub skalowania osi. */ p => new Date(p.timestamp).valueOf()).filter(Number.isFinite);
  const minTime = Math.min(...stamps);
  const maxTime = Math.max(...stamps);
  const span = Math.max(1, maxTime - minTime);
  const plotW = width - left - right, plotH = height - top - bottom;
  // Keep labels readable instead of shrinking the entire desktop SVG on phones.
  const timeTickCount = Math.max(2, Math.min(5, Math.floor(plotW / 80) + 1));
  const timeTicks = Array.from({ length: timeTickCount }, /** Wyznacza równomiernie rozmieszczony ułamek zakresu osi czasu. */ (_, index) => index / (timeTickCount - 1));
  const pointSets: { series: Series; points: ChartPoint[] }[] = series.map(/** Przelicza czas i wartość próbki na współrzędne wykresu, zachowując jej ID i dane opisu. */ item => ({
    series: item,
    points: values
      .filter(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ p => String(p.seriesId) === String(item.id))
      .map(/** Przelicza czas i wartość próbki na współrzędne wykresu, zachowując jej ID i dane opisu. */ p => ({
        id: String(p.id), value: p.value, timestamp: p.timestamp,
        x: left + (new Date(p.timestamp).valueOf() - minTime) / span * plotW,
        y: top + (1 - Math.min(1, Math.max(0, (p.value - item.minValue) / (item.maxValue - item.minValue)))) * plotH,
      }))
      .sort(/** Porządkuje punkty rosnąco według współrzędnej X przed narysowaniem ścieżki. */ (a, b) => a.x - b.x),
  }));
  const active = pointSets.flatMap(/** Spłaszcza zestawy serii do wspólnej listy punktów przy wyszukiwaniu zaznaczenia. */ group => group.points).find(/** Sprawdza zgodność ID próbki z zaznaczeniem na wykresie i w tabeli. */ point => point.id === selectedId);
  /** Wylicza etykietę czasu dla ułamka zakresu osi X, używając daty przy zakresie co najmniej doby i godziny przy krótszym. */
  const labelFor = (part: number) => {
    const date = new Date(minTime + part * span);
    return new Intl.DateTimeFormat('pl-PL', span >= 86_400_000 ? { month: '2-digit', day: '2-digit', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date);
  };
  /** Formatuje poziom osi Y jako procent lub wartość w zakresie wybranej serii w trybie raw. */
  const valueLabel = (part: number) => raw && series[0] ?
    formatValue(series[0].maxValue - part * (series[0].maxValue - series[0].minValue)) : Math.round((1 - part) * 100) + '%';
  return (
    <svg className="telemetry-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={raw ? 'Wykres wartości rzeczywistych wybranej serii. Szczegółowe pomiary znajdują się w tabeli.' : 'Wykres procentowych wartości względem zakresu każdej serii. Szczegóły w tabeli.'}>
      {[0, .25, .5, .75, 1].map(/** Buduje legendę wydruku z nazwą, jednostką i rozróżniającym wzorem linii. */ part => {
        const y = top + part * plotH;
        return <g key={part}><line className="grid-line" x1={left} y1={y} x2={width - right} y2={y}/><text className="grid-label" x={left - 10} y={y + 4} textAnchor="end">{valueLabel(part)}</text></g>;
      })}
      {timeTicks.map(/** Wyznacza współrzędną X i kotwicę podpisu czasu na osi wykresu. */ part => {
        const x = left + part * plotW;
        return <text key={part} className="grid-label" x={x} y={height - 8} textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'}>{labelFor(part)}</text>;
      })}
      {active && <line className="chart-cross" x1={active.x} x2={active.x} y1={top} y2={top + plotH}/>}
      {pointSets.map(/** Renderuje grupę SVG serii lub punktu z podświetleniem wybranego pomiaru. */ group => (
        <g key={String(group.series.id)}>
          {group.points.length > 1 && <path d={group.points.map(/** Zamienia kolejne punkty na segmenty M/L ścieżki SVG z ograniczoną precyzją zapisu. */ (point, i) => (i === 0 ? 'M' : 'L') + point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ')} fill="none" stroke={group.series.color} strokeWidth="2.5" strokeDasharray={DASH_PATTERNS[Math.max(0, allSeries.findIndex(/** Dopasowuje identyfikatory jako tekst, aby obsłużyć liczbowe i tekstowe ID kontraktu. */ item => String(item.id) === String(group.series.id))) % DASH_PATTERNS.length]} strokeLinecap="round" strokeLinejoin="round"/>}
          {group.points.map(/** Renderuje grupę SVG serii lub punktu z podświetleniem wybranego pomiaru. */ point => (
            <g key={point.id}>
              {point.id === selectedId && <circle cx={point.x} cy={point.y} r="11" stroke={group.series.color} strokeWidth="2" fill="none" opacity=".65"/>}
              <circle className="chart-point" cx={point.x} cy={point.y} r={point.id === selectedId ? 5 : 2.5} fill={group.series.color} stroke="#1a252a" strokeWidth="1">
                <title>{group.series.name + ': ' + formatValue(point.value) + ' ' + (group.series.unit || '') + ', ' + formatDate(point.timestamp)}</title>
              </circle>
            </g>
          ))}
        </g>
      ))}
    </svg>
  );
}

