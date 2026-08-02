export function sanitizeInput(value) {
  if (typeof value !== 'string') return value;
  return value
    .trim()
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .slice(0, 500);
}

export function sanitizeName(value) {
  if (typeof value !== 'string') return value;
  // While typing (onChange), we should NOT trim leading/trailing spaces 
  // because it prevents users from typing a space between first and last name.
  return value
    .replace(/[<>'"`;]/g, '')
    .slice(0, 50);
}

export function sanitizeNumber(value, min=1, max=9999) {
  const num = parseInt(value);
  if (isNaN(num)) return min;
  return Math.min(Math.max(num, min), max);
}
