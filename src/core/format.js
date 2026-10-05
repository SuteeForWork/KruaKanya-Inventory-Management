/** Number, currency, weight and date formatting. */

/** Format a number with a fixed number of decimals and thousands separators. */
export function n(value, decimals = 0) {
  const x = Number(value) || 0;
  return x.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/** Thai baht — whole baht when the amount is whole, satang (2 decimals)
 *  when it isn't, so a decimal unit price doesn't display as a rounded-off
 *  total. Pass `decimals` to force a fixed precision. */
export function baht(value, decimals) {
  const x = Number(value) || 0;
  const d = decimals ?? (Math.abs(x - Math.round(x)) >= 0.005 ? 2 : 0);
  return '฿' + n(x, d);
}

/** A kg amount as a plain number — one decimal normally, three for a
 *  sub-1kg amount so a gram-scale item (e.g. 0.025 kg) doesn't round away
 *  to "0.0". Table columns that already carry "(กก.)" in the header use
 *  this directly; `kg()` below just adds the unit suffix. */
export function kgNum(value) {
  const x = Number(value) || 0;
  return n(x, Math.abs(x) > 0 && Math.abs(x) < 1 ? 3 : 1);
}

/** Kilograms, with the unit suffix — see kgNum() for the decimal rule. */
export function kg(value) {
  return kgNum(value) + ' กก.';
}

/**
 * Filters what was typed into a numeric field down to digits and at most one
 * decimal point. Numeric fields are plain text inputs rather than
 * type="number" — a number input decides what counts as a decimal point from
 * the browser/OS locale and silently rejects or wipes the rest, so "." could
 * simply not be typed on some setups. Thai digits are converted, and commas
 * are dropped as thousands separators (Thai usage), so "1,500" still works.
 */
export function cleanDecimal(raw) {
  const s = String(raw ?? '')
    .replace(/[๐-๙]/g, d => '๐๑๒๓๔๕๖๗๘๙'.indexOf(d))
    .replace(/[^0-9.]/g, '');
  const dot = s.indexOf('.');
  return dot < 0 ? s : s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
}

/** A weight typed in 'g' or 'kg' → kg, the unit every stored weight uses. */
export function toKg(value, unit) {
  const x = Number(value) || 0;
  return unit === 'g' ? x / 1000 : x;
}

/** Add days to a YYYY-MM-DD date, returning YYYY-MM-DD. */
export function addDays(date, days) {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return toISODate(d);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function diffDays(from, to) {
  return Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);
}

/** YYYY-MM-DD → DD/MM/YY. */
export function shortDate(date) {
  const d = new Date(date + 'T00:00:00');
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' +
         String(d.getFullYear() % 100);
}

/** Date → YYYY-MM-DD in local time (avoids the UTC shift of toISOString). */
export function toISODate(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/** Current wall-clock time as HH:MM. */
export function clockTime() {
  return new Date().toTimeString().slice(0, 5);
}

/** A `timestamptz` (or any parseable ISO string) → 'DD/MM/YY HH:MM' in local time. */
export function fullDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return String(d.getDate()).padStart(2, '0') + '/' +
         String(d.getMonth() + 1).padStart(2, '0') + '/' +
         String(d.getFullYear() % 100) + ' ' +
         String(d.getHours()).padStart(2, '0') + ':' +
         String(d.getMinutes()).padStart(2, '0');
}
