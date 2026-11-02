/** Limit bcrypt współdzielony znaczeniowo z backendem; dotyczy bajtów UTF-8, nie liczby znaków. */
export const MAX_PASSWORD_BYTES = 72;
const encoder = new TextEncoder();

/** Liczy bajty kodowania UTF-8 przez TextEncoder; polskie znaki i emoji nie są jednym bajtem. */
export function passwordByteLength(value: string): number {
  return encoder.encode(value).length;
}

/** Sprawdza limit 72 bajtów bcrypt, nie modyfikując ani nie skracając hasła. */
export function passwordExceedsLimit(value: string): boolean {
  return passwordByteLength(value) > MAX_PASSWORD_BYTES;
}
