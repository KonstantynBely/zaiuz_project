import type { Measurement, Series } from '../../api/client';
import { formatDate, formatValue } from './formatting';

export const DASH_PATTERNS = ['none', '9 5', '3 4', '13 4 3 4'] as const;

interface ChartPoint {
  id: string;
  x: number;
  y: number;
  value: number;
  timestamp: string;
}

/** Wspólny wykres w % zakresów lub rzeczywiste wartości jednej wybranej serii. */
export function TelemetryChart({ series, allSeries, measurements, selectedId, raw }: {
  series: Series[]; allSeries: Series[]; measurements: Measurement[]; selectedId: string | null; raw: boolean;
}) {
  const width = 880, height = 275;
  const left = 60, right = 20, top = 21, bottom = 36;
  const values = measurements.filter(measurement => series.some(s => String(s.id) === String(measurement.seriesId)));
  if (values.length === 0) {
    return <div className="empty-chart"><strong>Brak pomiarów w wybranym zakresie</strong><span>Wybierz inne serie lub przedział czasu.</span></div>;
  }
  const stamps = values.map(p => new Date(p.timestamp).valueOf()).filter(Number.isFinite);
  const minTime = Math.min(...stamps);
  const maxTime = Math.max(...stamps);
  const span = Math.max(1, maxTime - minTime);
  const plotW = width - left - right, plotH = height - top - bottom;
  const pointSets: { series: Series; points: ChartPoint[] }[] = series.map(item => ({
    series: item,
    points: values
      .filter(p => String(p.seriesId) === String(item.id))
      .map(p => ({
        id: String(p.id), value: p.value, timestamp: p.timestamp,
        x: left + (new Date(p.timestamp).valueOf() - minTime) / span * plotW,
        y: top + (1 - Math.min(1, Math.max(0, (p.value - item.minValue) / (item.maxValue - item.minValue)))) * plotH,
      }))
      .sort((a, b) => a.x - b.x),
  }));
  const active = pointSets.flatMap(group => group.points).find(point => point.id === selectedId);
  const labelFor = (part: number) => {
    const date = new Date(minTime + part * span);
    return new Intl.DateTimeFormat('pl-PL', span >= 86_400_000 ? { month: '2-digit', day: '2-digit', timeZone: 'UTC' } : { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(date);
  };
  const valueLabel = (part: number) => raw && series[0] ?
    formatValue(series[0].maxValue - part * (series[0].maxValue - series[0].minValue)) : Math.round((1 - part) * 100) + '%';
  return (
    <div className="chart-viewport">
      <svg className="telemetry-chart" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={raw ? 'Wykres wartości rzeczywistych wybranej serii. Szczegółowe pomiary znajdują się w tabeli.' : 'Wykres procentowych wartości względem zakresu każdej serii. Szczegóły w tabeli.'}>
        {[0, .25, .5, .75, 1].map(part => {
          const y = top + part * plotH;
          return <g key={part}><line className="grid-line" x1={left} y1={y} x2={width - right} y2={y}/><text className="grid-label" x={left - 10} y={y + 4} textAnchor="end">{valueLabel(part)}</text></g>;
        })}
        {[0, .25, .5, .75, 1].map(part => {
          const x = left + part * plotW;
          return <text key={part} className="grid-label" x={x} y={height - 8} textAnchor={part === 0 ? 'start' : part === 1 ? 'end' : 'middle'}>{labelFor(part)}</text>;
        })}
        {active && <line className="chart-cross" x1={active.x} x2={active.x} y1={top} y2={top + plotH}/>}
        {pointSets.map(group => (
          <g key={String(group.series.id)}>
            {group.points.length > 1 && <path d={group.points.map((point, i) => (i === 0 ? 'M' : 'L') + point.x.toFixed(2) + ',' + point.y.toFixed(2)).join(' ')} fill="none" stroke={group.series.color} strokeWidth="2.5" strokeDasharray={DASH_PATTERNS[Math.max(0, allSeries.findIndex(item => String(item.id) === String(group.series.id))) % DASH_PATTERNS.length]} strokeLinecap="round" strokeLinejoin="round"/>}
            {group.points.map(point => (
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
    </div>
  );
}

