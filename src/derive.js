// Which fields a finding implicates.
//
// This is a verbatim port of fieldRefs() from the vanilla src/app.js, and it is
// ported rather than rewritten on purpose. Every branch in it encodes a bug that
// was found and fixed:
//
//   - a rule that PASSED or could not be evaluated must highlight nothing
//     (R12b passed while addressCountry showed as failing)
//   - R02 marks only the fields that are actually wrong, not every name field
//   - R08 sweeps up any field whose name looks like money, so the fix list stays
//     correct when a document gains a new cost field
//
// Rewriting it "cleanly" for React would mean re-deriving all of that from scratch
// and hoping none of it regresses. The React win is in the rendering layer, not
// here — this is logic, and logic that already works should move unchanged.
//
// Only 'fail' and 'warn' ever reach the field layer.

// Fields that can carry the APPLICANT's name, and so are checked for consistency
// against the passport by R02.
//
// Kept exactly as the vanilla list. Two fields that look like candidates are
// deliberately absent, and adding either reintroduces a wrong-value highlight:
//
//   passportNo     is a document NUMBER, not a name. It never equals the
//                  passport's full name, so including it made every application
//                  permanently 'fail R02' on a field that is actually correct.
//                  R03 owns passport-number consistency.
//   passengerName  is real, but airlines print it surname-first with a slash
//                  ('MENON/JOSE THOMAS'), which no name-normaliser can match to
//                  'Jose Thomas Menon'. Flagging it tells the applicant to "fix"
//                  a correct name, so it is left to R02's own comparison rather
//                  than guessed at here.
const APPLICANT_NAME_FIELDS = ['fullName', 'guestName', 'employeeName', 'accountHolder', 'policyHolder'];

const blank = (v) => v == null || String(v).trim() === '';

/** Normalise a name for comparison: uppercase, punctuation stripped. */
export function normNameKey(s) {
  return String(s ?? '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/g, ' ');
}

/**
 * @param {object} finding a rule finding
 * @param {object} app     the whole application (needed for the data-driven rules)
 * @returns {Array<{doc:string, field:string}>}
 */
export function fieldRefs(finding, app) {
  const refs = [];
  const hit = (doc, field) => {
    if (field && doc && app.docs[doc]?.fields && Object.keys(app.docs[doc].fields).includes(field)) {
      refs.push({ doc, field });
    }
  };

  if (finding.status === 'pass' || finding.status === 'na') return refs;

  if (finding.id === 'R01') { hit('passport', 'expiryDate'); }
  if (finding.id === 'R04') {
    for (const key of Object.keys(app.docs)) {
      for (const [fk, fv] of Object.entries(app.docs[key].fields)) {
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(fv).trim())) hit(key, fk);
      }
    }
  }
  if (finding.id === 'R05' || finding.id === 'R05b') {
    hit('itinerary', 'outboundArr'); hit('itinerary', 'returnArr');
    hit('accommodation', 'checkIn'); hit('accommodation', 'checkOut');
    hit('hostLetter', 'arrivalDate'); hit('hostLetter', 'departureDate');
  }
  if (finding.id === 'R03') { hit('application', 'passportNo'); }
  if (finding.id === 'R09b') { hit('insurance', 'startDate'); hit('insurance', 'endDate'); }
  if (finding.id === 'R07') { hit('bankStatement', 'statementDate'); }
  if (finding.id === 'R08') {
    hit('bankStatement', 'closingBalanceEUR'); hit('bankStatement', 'closingBalance');
    for (const key of Object.keys(app.docs)) {
      for (const fk of Object.keys(app.docs[key].fields)) {
        if (/^(fare|total|support|salary)/i.test(fk)) hit(key, fk);
      }
    }
  }
  if (finding.id === 'R10' || finding.id === 'R10b') { hit('employment', 'dateOfJoining'); hit('employment', 'leavePeriod'); }
  if (finding.id === 'R11') {
    const docKey = finding.title.includes('Passport') ? 'passport'
      : finding.title.includes('accommodation') || finding.title.includes('Hotel') ? 'accommodation'
        : 'application';
    for (const fk of Object.keys(app.docs[docKey]?.fields ?? {})) {
      if (new RegExp(fk, 'i').test(finding.detail) && blank(app.docs[docKey].fields[fk])) hit(docKey, fk);
    }
  }
  if (finding.id === 'R12' || finding.id === 'R12b') {
    for (const key of Object.keys(app.docs)) {
      const fk = Object.keys(app.docs[key].fields).find((n) => n === 'addressLine' || n === 'hostAddress' || n === 'addressCountry');
      if (fk) hit(key, fk);
    }
  }
  if (finding.id === 'R13' || finding.id === 'R13b') {
    for (const fk of Object.keys(app.docs.hostLetter?.fields ?? {})) {
      if (new RegExp(fk, 'i').test(finding.detail) && blank(app.docs.hostLetter.fields[fk])) hit('hostLetter', fk);
    }
    hit('hostLetter', 'signedDate');
  }
  if (finding.id === 'R14' || finding.id === 'R14b') { hit('application', 'previousStay'); }
  if (finding.id === 'R02' || finding.id === 'R02b') {
    // Only mark the fields that are actually WRONG. Attaching the hint to every
    // name field (including the correct ones) printed the same sentence under
    // each, burying the one field the user needs to edit.
    const canon = normNameKey(app.docs.passport.fields.fullName ?? '');
    for (const key of Object.keys(app.docs)) {
      if (key === 'passport' || key === 'hostLetter') continue;
      for (const fk of APPLICANT_NAME_FIELDS) {
        if (!Object.keys(app.docs[key].fields).includes(fk)) continue;
        const v = app.docs[key].fields[fk];
        if (blank(v)) continue;
        if (normNameKey(v) !== canon) hit(key, fk);
      }
    }
  }
  return refs;
}

// ---------------------------------------------------------------- derived views

/** doc key -> set of fields that need fixing (drives the red border). */
export function badFieldsByDoc(findings, app) {
  const out = new Map();
  for (const f of findings) {
    if (f.status !== 'fail' && f.status !== 'warn') continue;
    for (const ref of fieldRefs(f, app)) {
      if (!out.has(ref.doc)) out.set(ref.doc, new Set());
      out.get(ref.doc).add(ref.field);
    }
  }
  return out;
}

/** doc key -> number of fields to fix (drives the panel badge). */
export function failCountByDoc(findings, app) {
  const out = new Map();
  for (const f of findings) {
    if (f.status !== 'fail' && f.status !== 'warn') continue;
    for (const ref of fieldRefs(f, app)) {
      out.set(ref.doc, (out.get(ref.doc) ?? 0) + 1);
    }
  }
  return out;
}

// Short label per document, used only in the fix list. The full label is on the
// panel the row jumps to, so a long one there is fine; here it made every row wrap
// to two lines and the list 680px instead of 340.
const DOC_TAG = {
  passport: 'PASSPORT',
  application: 'APPLICATION',
  itinerary: 'ITINERARY',
  accommodation: 'HOTEL',
  hostLetter: 'HOST',
  bankStatement: 'BANK',
  insurance: 'INSURANCE',
  employment: 'EMPLOYMENT',
};

/**
 * One actionable row per implicated field.
 *
 * Sorted into document-panel order so the list reads in the same sequence as the
 * panels above it — a fix list that jumps around while the eye tracks down the
 * panels is harder to use than one that mirrors them.
 *
 * Rows carry no editor: the input lives once, in the document panel, and the row
 * navigates to it. See the comment at the top of FixList.jsx for why a second set
 * of inputs here was actively harmful.
 */
export function fixRows(findings, app) {
  const seen = new Set();
  const rows = [];
  for (const f of findings) {
    if (f.status !== 'fail' && f.status !== 'warn') continue;
    for (const ref of fieldRefs(f, app)) {
      const key = `${ref.doc}.${ref.field}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        ...ref,
        value: app.docs?.[ref.doc]?.fields?.[ref.field] ?? '',
        docLabel: app.docs?.[ref.doc]?.label ?? ref.doc,
        docTag: DOC_TAG[ref.doc] ?? String(ref.doc).toUpperCase(),
        id: f.id,
        status: f.status,
        hint: f.fix,
      });
    }
  }
  const order = Object.keys(app.docs ?? {});
  rows.sort((a, b) => {
    const d = order.indexOf(a.doc) - order.indexOf(b.doc);
    return d !== 0 ? d : (a.field < b.field ? -1 : 1);
  });
  return rows;
}

/** Documents to open on load: passport plus anything with a problem. */
export function docsToOpen(findings, app) {
  const set = new Set(['passport']);
  for (const f of findings) {
    if (f.status !== 'fail' && f.status !== 'warn') continue;
    for (const ref of fieldRefs(f, app)) set.add(ref.doc);
  }
  return set;
}

export { APPLICANT_NAME_FIELDS };