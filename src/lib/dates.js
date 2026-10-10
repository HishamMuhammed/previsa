// Date helpers. Everything internal is an ISO yyyy-mm-dd string or a UTC epoch ms.
// Slash-form dates are treated as untrusted input: they are parsed against an
// explicitly declared order and flagged when the two readings diverge.

export const DAY = 86400000;

/** Strict ISO date -> epoch ms, or null if malformed / impossible. */
export function iso(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(t);
  // reject 31 Feb style rollover
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null;
  return t;
}

/** dd/mm/yyyy or mm/dd/yyyy -> ISO string, or null. */
export function fromSlash(raw, order) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  let day = +m[1], mon = +m[2];
  if (order === 'mdy') { const t = day; day = mon; mon = t; }
  const out = `${m[3]}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return iso(out) == null ? null : out;
}

/**
 * Whole days from a to b. Accepts ISO strings OR epoch ms in any position —
 * rules routinely hold one parsed (iso() -> ms) and one raw string, and silently
 * returning NaN there made those checks degrade to `na` instead of running.
 */
export function daysBetween(a, b) {
  const t = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^-?\d{13}$/.test(v.trim())) return Number(v.trim());
    return iso(v);
  };
  const x = t(a), y = t(b);
  if (x == null || y == null) return NaN;
  return Math.round((y - x) / DAY);
}

export function addMonths(s, n) {
  const t = iso(s);
  if (t == null) return null;
  const d = new Date(t);
  const day = d.getUTCDate();
  const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString().slice(0, 10);
}

/** '2027-01-08' or an epoch ms -> '08 Jan 2027'. Falls back to the raw value. */
export function human(v) {
  if (v == null) return '—';
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{13}$/.test(v.trim()))) {
    const t = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(t)) return new Date(t).toLocaleDateString('en-GB',
      { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  const t = iso(String(v));
  return t == null ? String(v) : new Date(t).toLocaleDateString('en-GB',
    { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export const SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
export const isSlash = (s) => SLASH_RE.test(String(s ?? '').trim());

/** A slash date whose two readings are both valid AND different days. */
export function isGenuinelyAmbiguous(raw) {
  const m = SLASH_RE.exec(String(raw ?? '').trim());
  if (!m) return false;
  const a = +m[1], b = +m[2];
  if (a !== b && a >= 1 && a <= 12 && b >= 1 && b <= 12) return true;
  return false;
}

/** ISO date string -> Set of every day in [from, to] inclusive. */
export function eachDay(from, to) {
  const a = iso(from), b = iso(to);
  const days = new Set();
  if (a == null || b == null || b < a) return days;
  for (let t = a; t <= b; t += DAY) days.add(new Date(t).toISOString().slice(0, 10));
  return days;
}

export const nameTokens = (s) =>
  String(s ?? '').toUpperCase().replace(/[^A-Z ]/g, ' ').split(/\s+/).filter(Boolean);

/** Compare key: initials dropped, deduped, sorted. 'A. MENON' == 'MENON'. */
export function normNameKey(s) {
  return [...new Set(nameTokens(s).filter((t) => t.length > 1))].sort().join(' ');
}

export const normText = (s) =>
  String(s ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);

/**
 * Order-PRESERVING normalisation, for addresses.
 *
 * normKey sorts and dedupes tokens (right for names, where "MENON JOSE" and
 * "JOSE MENON" are the same person). Addresses are the opposite case: word order
 * is part of the address, so "44B Kunnamangalam Road" and "Kunnamangalam Road
 * 44B" are genuinely different strings that a consular officer will read as
 * inconsistent. This collapses spacing/punctuation/case but keeps sequence.
 */
export const normAddr = (s) =>
  String(s ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');

export const normKey = (s) => [...new Set(normText(s))].sort().join(' ');

export const money = (n) =>
  'EUR ' + Number(n || 0).toLocaleString('en-GB', { maximumFractionDigits: 0 });