/** Number, currency, weight and date formatting. */

/** Format a number with a fixed number of decimals and thousands separators. */
export function n(value, decimals = 0) {
  const x = Number(value) || 0;
  return x.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

/** Thai baht. */
export function baht(value, decimals = 0) {
  return '฿' + n(value, decimals);
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
