// Field extraction from extracted PDF lines — the suggestion half of the import.
//
// This NEVER decides anything. It returns candidates with a confidence and the
// exact source text they came from; the user accepts or corrects each one. That
// restraint is the whole design: a visa application formats differently at
// every consulate, so an extractor that silently commits a value is worse than
// one that admits it guessed.
//
// Confidence vocabulary (shown verbatim in the UI):
//   high    - an explicit label matched and the value is well-formed
//   medium  - a label matched but the value is loose (multi-word, unusual shape)
//   low     - inferred from context rather than an explicit label
//   none    - not found

import { normAddr } from './dates.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// A labelled line is "Label: value". The label may end in a colon, or be
// followed by whitespace-separated words before the colon.
const LABELLED = /^\s*([A-Za-z][A-Za-z .'()/&-]{1,48}?)\s*[::]\s*(.+?)\s*$/;

// Values that are almost never the field itself: page furniture, totals that
// belong to a different label, legal boilerplate.
const NOISE = /^(page \d+|\d+ of \d+|continued|page)$/i;

/** Split a page's lines into {label, value} candidates. */
export function labelledPairs(lines) {
  const out = [];
  for (const line of lines) {
    const t = clean(line);
    if (!t || NOISE.test(t)) continue;
    const m = LABELLED.exec(t);
    if (m) out.push({ label: clean(m[1]), value: clean(m[2]) });
  }
  return out;
}

// --- field vocabulary -------------------------------------------------------
// Each entry: which document it belongs to, and the label patterns that identify
// it. Patterns are matched against the NORMALISED label, so "Check-in Date",
// "Check In Date" and "CHECK-IN DATE:" all hit the same entry.
const VOCAB = [
  // ---- hotel booking -> the "accommodation" document
  { doc: 'accommodation', field: 'guestName', kind: 'name',
    labels: ['guest name', 'guest', 'lead guest', 'name of guest', 'traveller name', 'traveler name', 'passenger name', 'booked by'] },
  { doc: 'accommodation', field: 'confirmationNo', kind: 'ref',
    labels: ['booking reference', 'booking ref', 'confirmation number', 'confirmation no', 'reference number', 'booking number', 'reservation number'] },
  { doc: 'accommodation', field: 'checkIn', kind: 'date',
    labels: ['check-in date', 'check in date', 'checkin date', 'check-in', 'arrival date', 'date of arrival', 'from'] },
  { doc: 'accommodation', field: 'checkOut', kind: 'date',
    labels: ['check-out date', 'check out date', 'checkout date', 'check-out', 'departure date', 'date of departure', 'to'] },
  { doc: 'accommodation', field: 'addressLine', kind: 'address',
    labels: ['address', 'hotel address', 'property address', 'street address'] },
  { doc: 'accommodation', field: 'addressCountry', kind: 'country',
    labels: ['country', 'destination', 'hotel country'] },
  { doc: 'accommodation', field: 'totalEUR', kind: 'money',
    labels: ['total', 'total amount', 'amount due', 'grand total', 'booking total', 'total price'] },

  // ---- flight itinerary -> the "itinerary" document
  { doc: 'itinerary', field: 'passengerName', kind: 'name',
    labels: ['passenger name', 'passenger', 'traveller name', 'traveler name', 'traveller', 'name'] },
  { doc: 'itinerary', field: 'outboundDep', kind: 'date',
    labels: ['departure date', 'date of departure', 'outbound departure date', 'outbound', 'departure', 'date'] },
  { doc: 'itinerary', field: 'returnArr', kind: 'date',
    labels: ['return date', 'date of return', 'inbound date', 'return', 'arrival date'] },
  { doc: 'itinerary', field: 'bookingRef', kind: 'ref',
    labels: ['booking reference', 'pnr', 'record locator', 'booking ref', 'ticket number', 'reference'] },
  { doc: 'itinerary', field: 'fareEUR', kind: 'money',
    labels: ['total fare', 'fare', 'total price', 'amount paid', 'total'] },

  // ---- bank statement -> the "bankStatement" document
  { doc: 'bankStatement', field: 'accountHolder', kind: 'name',
    labels: ['account holder', 'account name', 'name', 'customer name', 'holder'] },
  { doc: 'bankStatement', field: 'accountNo', kind: 'ref',
    labels: ['account number', 'account no', 'a/c no', 'account'] },
  { doc: 'bankStatement', field: 'closingBalanceEUR', kind: 'money',
    labels: ['closing balance', 'balance', 'closing balance eur', 'available balance', 'current balance'] },
  { doc: 'bankStatement', field: 'statementDate', kind: 'date',
    labels: ['statement date', 'date', 'closing date', 'as at', 'as of'] },
];

const normLabel = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Does this value look like the kind of thing we expect? */
function scoreValue(kind, value) {
  const v = clean(value);
  if (!v) return { ok: false, confidence: 'low', why: 'empty' };
  if (v.length > 90) return { ok: false, confidence: 'low', why: 'too long to be a field value' };

  switch (kind) {
    case 'date': {
      // Accept ISO and the common slash/spelled forms; anything else is a guess.
      const looksDate = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/.test(v);
      if (looksDate) return { ok: true, confidence: 'high', why: 'recognised date format' };
      // A bare year or a lone number is almost certainly a column heading.
      if (/^\d{1,2}$/.test(v)) return { ok: false, confidence: 'low', why: 'looks like a column number' };
      return { ok: true, confidence: 'medium', why: 'label matched, date format unrecognised' };
    }
    case 'money': {
      const m = v.replace(/,/g, '').match(/(?:[A-Z]{3}\s*|[$€£]\s*)?(\d+(?:\.\d{1,2})?)/);
      if (!m) return { ok: false, confidence: 'low', why: 'no number found' };
      return { ok: true, confidence: 'high', why: 'numeric amount found' };
    }
    case 'ref': {
      const compact = v.replace(/\s/g, '');
      if (compact.length >= 4 && compact.length <= 24) return { ok: true, confidence: 'high', why: 'reference-shaped' };
      return { ok: true, confidence: 'medium', why: 'label matched, value shape uncertain' };
    }
    case 'name': {
      const words = v.split(/\s+/).filter(Boolean);
      if (words.length >= 2 && words.length <= 6) return { ok: true, confidence: 'high', why: 'name-shaped' };
      if (words.length === 1) return { ok: true, confidence: 'medium', why: 'single token name' };
      return { ok: true, confidence: 'medium', why: 'unusually long name' };
    }
    case 'address':
      return v.split(/\s+/).length >= 3
        ? { ok: true, confidence: 'high', why: 'address-shaped' }
        : { ok: true, confidence: 'medium', why: 'short address' };
    case 'country':
      return v.length <= 40
        ? { ok: true, confidence: 'high', why: 'country-shaped' }
        : { ok: false, confidence: 'low', why: 'too long to be a country' };
    default:
      return { ok: true, confidence: 'medium', why: 'label matched' };
  }
}

/** Clean a value for the field it will populate (money -> digits, country -> title). */
function normaliseForField(kind, value) {
  const v = clean(value);
  if (kind === 'money') {
    const m = v.replace(/,/g, '').match(/(\d+(?:\.\d{1,2})?)/);
    return m ? String(Math.round(Number(m[1]) * 100) / 100) : v;
  }
  if (kind === 'country') return v.length <= 40 ? v : v.slice(0, 40);
  return v;
}

/**
 * Suggest field values for one document from its extracted lines.
 *
 * Returns {doc, suggestions: [{field, value, confidence, why, label, sourceLine}]}
 * — an array, not an object, because a field can be found twice (e.g. two date
 * labels matching "date") and the user should see both candidates rather than
 * have one silently win.
 */
export function suggestFields(pages, doc, opts = {}) {
  const limitTo = opts.doc ?? doc;
  const entries = VOCAB.filter((v) => v.doc === limitTo);
  if (!entries.length) return { doc: limitTo, suggestions: [] };

  const pairs = labelledPairs(pages.flat());
  const suggestions = [];

  for (const entry of entries) {
    for (const pair of pairs) {
      // Match the WHOLE label, never a prefix. A prefix match made
      // "Account holder" satisfy the "account" pattern for accountNo, offering
      // a person's name as the account number — a wrong-value suggestion is far
      // worse than no suggestion, because the user is invited to trust it.
      const nl = normLabel(pair.label);
      const exact = entry.labels.find((l) => nl === normLabel(l));
      // Prefix matching is allowed only when the label has enough words that a
      // prefix collision is implausible (>= 2 words, and >= 8 characters).
      const prefixed = exact ? null : entry.labels.find((l) => {
        const t = normLabel(l);
        return t.split(' ').length >= 2 && t.length >= 8 && nl.startsWith(t);
      });
      const hit = exact ?? prefixed;
      if (!hit) continue;

      const score = scoreValue(entry.kind, pair.value);
      // Only offer what is plausibly the right shape; a rejected value is not
      // shown at all rather than shown as garbage the user must dismiss.
      if (!score.ok) continue;

      suggestions.push({
        doc: entry.doc,
        field: entry.field,
        value: normaliseForField(entry.kind, pair.value),
        confidence: score.confidence,
        why: score.why,
        label: pair.label,
        sourceLine: `${pair.label}: ${pair.value}`,
      });
    }
  }

  return { doc: limitTo, suggestions };
}

/**
 * Pick the best candidate per field, and report which fields had more than one.
 *
 * A tie is NOT resolved silently: both candidates are returned so the UI can show
 * "2 candidates found" and let the user choose.
 */
export function bestPerField(suggestions) {
  const byField = new Map();
  for (const s of suggestions) {
    if (!byField.has(s.field)) byField.set(s.field, []);
    byField.get(s.field).push(s);
  }
  const out = [];
  for (const [field, list] of byField) {
    const rank = { high: 0, medium: 1, low: 2 };
    const sorted = list.slice().sort((a, b) => rank[a.confidence] - rank[b.confidence]);
    out.push({ ...sorted[0], alternatives: sorted.slice(1) });
  }
  return out;
}

/**
 * Which document does this text look like? Advisory only.
 *
 * Weights are per DISTINCT TERM, not per occurrence: a page that says
 * "balance" on four lines is not four times more bank-like. Counting
 * occurrences made a two-page file whose second page was a bank statement
 * outvote a first page that was plainly a hotel booking.
 *
 * This never decides anything — the user picks the document type. It only
 * offers a nudge, and returns null rather than guessing when the signal is weak.
 */
export function guessDocumentType(pages) {
  const text = pages.flat().join(' ').toUpperCase();
  const terms = (words) => words.filter((w) => text.includes(w)).length;
  const ranked = [
    ['accommodation', terms(['HOTEL', 'GUEST', 'CHECK-IN', 'CHECK IN', 'RESERVATION', 'ROOM', 'NIGHTS', 'BOOKING CONFIRMATION'])],
    ['itinerary', terms(['ITINERARY', 'PASSENGER', 'DEPARTURE', 'ARRIVAL', 'FLIGHT', 'AIRLINE', 'BOARDING', 'PNR', 'E-TICKET'])],
    ['bankStatement', terms(['BALANCE', 'ACCOUNT HOLDER', 'ACCOUNT NUMBER', 'STATEMENT', 'IBAN', 'SORT CODE', 'WITHDRAWAL', 'OVERDRAFT'])],
  ].sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0];
  // Require a decisive margin. This guess is only a nudge — the user picks the
  // document type — so it is better to say nothing than to nudge wrongly. A
  // one-term lead is not evidence: a combined PDF can carry a hotel page and a
  // bank page and still land within one term of a tie.
  const second = ranked[1]?.[1] ?? 0;
  if (bestScore < 3 || bestScore - second < 2) return null;
  return best;
}

export const DOC_LABELS = {
  accommodation: 'Hotel booking',
  itinerary: 'Flight itinerary',
  bankStatement: 'Bank statement',
  application: 'Visa application form',
  passport: 'Passport bio page',
};