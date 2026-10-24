import type { ComponentPropsWithoutRef } from 'react';
import { MAX_PASSWORD_BYTES, passwordByteLength } from '../features/admin/passwordValidation';

type Props = Omit<ComponentPropsWithoutRef<'input'>, 'type' | 'value' | 'onChange'> & {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

export function PasswordInput({ id, value, onChange, ...props }: Props) {
  const bytes = passwordByteLength(value);
  const tooLong = bytes > MAX_PASSWORD_BYTES;
  const errorId = id + '-length-error';
  return <>
    <input {...props} id={id} type="password" value={value}
      onChange={event => onChange(event.target.value)}
      aria-invalid={tooLong || undefined} aria-describedby={tooLong ? errorId : undefined}/>
    {tooLong && <p id={errorId} className="form-message error" role="alert">
      Hasło jest za długie: {bytes} z maksymalnie {MAX_PASSWORD_BYTES} bajtów UTF-8.
      {' '}Polskie znaki i emoji mogą zajmować więcej niż jeden bajt.
    </p>}
  </>;
}
