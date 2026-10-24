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

export function SeriesIcon({ value, size = 18 }: { value?: string | null; size?: number }) {
  const selected = seriesIcons.find(item => item.value === value);
  return <Icon name={selected?.value ?? 'layers'} size={size}/>;
}

export function SeriesIconPicker({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const name = useId();
  const legacy = value !== '' && !seriesIcons.some(item => item.value === value);
  const options = [
    { value: '', label: 'Bez ikony' },
    ...seriesIcons,
    ...(legacy ? [{ value, label: 'Dotychczasowa' }] : []),
  ];
  return <fieldset className="series-icon-picker" disabled={disabled}>
    <legend>Ikona serii (opcjonalnie)</legend>
    <div className="series-icon-options">
      {options.map(option => <label className="series-icon-option" key={option.value}>
        <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)}/>
        <span>
          {option.value ? <SeriesIcon value={option.value} size={23}/> : <span className="series-icon-none" aria-hidden="true">—</span>}
          <span>{option.label}</span>
        </span>
      </label>)}
    </div>
  </fieldset>;
}
