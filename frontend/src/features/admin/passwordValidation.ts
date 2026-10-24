export const MAX_PASSWORD_BYTES = 72;
const encoder = new TextEncoder();

export function passwordByteLength(value: string): number {
  return encoder.encode(value).length;
}

export function passwordExceedsLimit(value: string): boolean {
  return passwordByteLength(value) > MAX_PASSWORD_BYTES;
}
