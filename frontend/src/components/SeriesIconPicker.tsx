import { useId } from 'react';
import { Icon, type IconName } from './Icon';

const seriesIcons = [
  { value: 'thermometer', label: 'Temperatura' },
  { value: 'droplet', label: 'Wilgotność' },
  { value: 'battery', label: 'Akumulator' },
  { value: 'gauge', label: 'Ciśnienie' },
  { value: 'wind', label: 'Wiatr' },
  { value: 'sun', label: 'Światło' },
  { value: 'activity', label: 'Sygnał' },
  { value: 'radio', label: 'Czujnik' },
] satisfies { value: IconName; label: string }[];

/** Wyświetla rozpoznaną ikonę serii; brak lub nieznana nazwa daje neutralne layers. */
export function SeriesIcon({ value, size = 18 }: { value?: string | null; size?: number }) {
  const selected = seriesIcons.find(/** Sprawdza dopasowanie wybranej nazwy ikony do dostępnych opcji. */ item => item.value === value);
  return <Icon name={selected?.value ?? 'layers'} size={size}/>;
}

/**
 * Renderuje dostępną grupę radio z wyborem ikony lub jej braku.
 * useId izoluje nazwy grup, a nieznana dotychczasowa wartość pozostaje możliwa do zachowania.
 */
export function SeriesIconPicker({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const name = useId();
  const legacy = value !== '' && !seriesIcons.some(/** Sprawdza dopasowanie wybranej nazwy ikony do dostępnych opcji. */ item => item.value === value);
  const options = [
    { value: '', label: 'Bez ikony' },
    ...seriesIcons,
    ...(legacy ? [{ value, label: 'Dotychczasowa' }] : []),
  ];
  return <fieldset className="series-icon-picker" disabled={disabled}>
    <legend>Ikona serii (opcjonalnie)</legend>
    <div className="series-icon-options">
      {options.map(/** Renderuje pojedynczą opcję radio wyboru ikony serii. */ option => <label className="series-icon-option" key={option.value}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={/** Przekazuje wybór ikony z grupy radio do formularza rodzica. */ () => onChange(option.value)}/>
        <span>
          {option.value ? <SeriesIcon value={option.value} size={23}/> : <span className="series-icon-none" aria-hidden="true">—</span>}
          <span>{option.label}</span>
        </span>
      </label>)}
    </div>
  </fieldset>;
}
