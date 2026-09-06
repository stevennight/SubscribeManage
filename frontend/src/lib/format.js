/** Small formatting helpers shared across pages. */

/** Format a number as a fixed-2 amount with optional currency suffix. */
export function money(amount, currency) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return currency ? `— ${currency}` : '—';
  const s = n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${s} ${currency}` : s;
}

/** ISO date string → localized short date; passthrough for falsy. */
export function shortDate(value) {
  if (!value) return '—';
  const iso = typeof value === 'string' && !value.endsWith('Z') && value.includes('T')
    ? value + 'Z'
    : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('zh-CN');
}
