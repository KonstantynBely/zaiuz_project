import { useEffect, useMemo, useState } from 'react';
import type { Measurement, Series } from '../../api/client';
import { groupMeasurements } from './measurementRows';
import { Icon } from '../../components/Icon';
import { DASH_PATTERNS } from './TelemetryChart';
import { formatDate, formatValue } from './formatting';

type TimeRange = 'all' | '24h' | '7d' | '30d' | 'custom';

interface Props {
  series: Series[];
  visibleSeries: Series[];
  filtered: Measurement[];
  selectedId: string | null;
  onSelect: (id: string, seriesId: string) => void;
  chartMode: 'percent' | 'raw';
  range: TimeRange;
  customDates: { from?: string; to?: string };
  preview: boolean;
  loading: boolean;
}

export function MeasurementHistory({
  series, visibleSeries, filtered, selectedId, onSelect, chartMode,
  range, customDates, preview, loading,
}: Props) {
  const [tablePage, setTablePage] = useState(0);
  const visibleIds = visibleSeries.map(item => String(item.id)).join(',');
  useEffect(() => { setTablePage(0); },
    [visibleIds, range, customDates.from, customDates.to, preview]);
  const groupedRows = useMemo(
    () => groupMeasurements(visibleSeries, filtered), [visibleSeries, filtered],
  );
  const rowsPerPage = 35;
  const lastPage = Math.max(0, Math.ceil(groupedRows.length / rowsPerPage) - 1);
  const safePage = Math.min(tablePage, lastPage);
  const pageRows = groupedRows.slice(safePage * rowsPerPage, (safePage + 1) * rowsPerPage);
  return (<>
          <section className="panel table-panel" id="records" aria-labelledby="records-heading">
            <div className="panel-heading"><div><h2 id="records-heading">Historia pomiarów</h2><p className="subtle">Kliknij wartość, aby zaznaczyć ją na wykresie.</p></div><button className="section-action" type="button" onClick={() => window.print()}><Icon name="print" size={15}/> Drukuj</button></div>
            {groupedRows.length ? <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th scope="col">Czas pomiaru (UTC)</th>{visibleSeries.map(item => <th scope="col" key={String(item.id)}><span className="legend-dot" style={{ display: 'inline-block', marginRight: 9, backgroundColor: item.color }}/>{item.name} {item.unit ? '(' + item.unit + ')' : ''}</th>)}</tr></thead>
                <tbody>{pageRows.map(row =>
                  <tr key={row.key} className={[...row.cells.values()].some(item => String(item.id) === selectedId) ? 'selected' : undefined}>
                    <th scope="row" className="measurement-time">{formatDate(row.timestamp)}</th>
                    {visibleSeries.map(item => {
                      const sample = row.cells.get(String(item.id));
                      return <td key={String(item.id)} className={sample ? undefined : 'is-empty'}>{sample ?
                        <button className="measurement-cell-button" type="button" aria-pressed={String(sample.id) === selectedId}
                          title={'Zaznacz: ' + item.name + ', ' + formatDate(sample.timestamp)} onClick={() => { onSelect(String(sample.id), String(sample.seriesId)); }}>{formatValue(sample.value)}</button> : '—'}</td>;
                    })}
                  </tr>,
                )}</tbody>
              </table>
            </div> : <p className="placeholder">{loading ? 'Wczytywanie…' : 'Brak pomiarów odpowiadających filtrom.'}</p>}
            <div className="table-foot"><span>Wiersze {groupedRows.length ? safePage * rowsPerPage + 1 : 0}–{Math.min((safePage + 1) * rowsPerPage, groupedRows.length)} z {groupedRows.length} wczytanych</span>
              <div className="table-pagination">
                <button type="button" disabled={safePage === 0} onClick={() => setTablePage(page => Math.max(0, page - 1))}>← Poprzednia</button>
                <span>Strona {safePage + 1} / {lastPage + 1}</span>
                <button type="button" disabled={safePage >= lastPage} onClick={() => setTablePage(page => Math.min(lastPage, page + 1))}>Następna →</button>
              </div>
            </div>
          </section>
          <section className="print-report" aria-label="Raport pomiarów do wydruku">
            <header className="print-report-head">
              <h2>RoverSense — raport telemetrii</h2>
              <p>Zakres: {range === 'custom' ? [customDates.from ? formatDate(customDates.from) : 'początek', customDates.to ? formatDate(customDates.to) : 'teraz'].join(' – ') : range === 'all' ? 'wszystkie wczytane pomiary' : range === '24h' ? 'ostatnie 24 godziny' : range === '7d' ? 'ostatnie 7 dni' : 'ostatnie 30 dni'} · Wykres: {chartMode === 'raw' ? 'jednostki serii' : '% zakresu serii'}</p>
              <p>Widoczne serie: {visibleSeries.length}.</p>
              <ul className="print-legend">
                {visibleSeries.map(item => <li key={String(item.id)}>
                  <svg viewBox="0 0 42 12" width="42" height="12" aria-hidden="true"><line x1="2" y1="6" x2="40" y2="6" stroke={item.color} strokeWidth="3" strokeDasharray={DASH_PATTERNS[Math.max(0, series.findIndex(s => String(s.id) === String(item.id))) % DASH_PATTERNS.length]}/></svg>
                  {item.name}{item.unit ? ' (' + item.unit + ')' : ''}
                </li>)}
              </ul>
              <p>{preview ? 'Lokalne dane demonstracyjne. ' : ''}Wydruk obejmuje wszystkie wczytane odczyty spełniające filtry (do 1000 ostatnich wyników pobranych z API). Czas w UTC.</p>
            </header>
            <table className="print-table">
              <thead><tr><th scope="col">Czas pomiaru (UTC)</th>{visibleSeries.map(item => <th scope="col" key={String(item.id)}>{item.name}{item.unit ? ' (' + item.unit + ')' : ''}</th>)}</tr></thead>
              <tbody>{groupedRows.map(row => <tr key={row.key}><th scope="row">{formatDate(row.timestamp)}</th>{visibleSeries.map(item => <td key={String(item.id)}>{row.cells.has(String(item.id)) ? formatValue(row.cells.get(String(item.id))!.value) : '—'}</td>)}</tr>)}</tbody>
            </table>
          </section>
  </>);
}
