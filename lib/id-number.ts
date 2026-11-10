export function isValidIdNumber(value: string) {
  return /^\d{13}$/.test(value.trim());
}

export function normalizeIdNumber(value: string) {
  return value.trim().toUpperCase();
}
