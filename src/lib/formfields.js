// Positional extraction from filled visa application forms.
//
// Why this exists
// ---------------
// The plain-text extractor pairs "Label: value" lines and therefore finds nothing
// in an official application form. Measured on the real forms: 7/7 fields from a
// booking confirmation, 0 from every application form. The reason is spatial, not
// textual — the text is perfectly readable, it simply sits in a different box
// from its label.
//
// The geometry was captured, not assumed (see test/fixtures/geometry-real.json
// and tools/geometry-probe.html). A filled form looks like this:
//
//     x= 39 y=585  '1.'                      field number, left gutter
//     x= 61 y=585  'Surname (Family name):'  label
//     x= 61 y=567  'SMIRNOVA'                value, ~18px BELOW, same x
//
//     x= 61 y=471  'Date of birth'           label, wraps across lines
//     x= 61 y=459  '(day-month-year):'       label continues, still ends ':'
//     x= 61 y=441  '05-06-1987'              value sits below the whole block
//
// So the rule that actually works is:
//   1. find a field number in the gutter
//   2. take the label to its right
//   3. walk DOWNWARDS at the same x; label lines end with ':', values do not
//   4. the first line that is not a label is the value
//
// Everything here is pure and deterministic — no model, no guessing, and it
// returns nothing rather than a wrong answer when the layout is unfamiliar.

// A label line almost always ends with a colon. Values (names, dates, places)
// almost never do. That single distinction separates label from value.
const isLabelish = (s) => /[:：(]\s*$/.test(s) || /^[\[(]?\s*\d+\s*[\])]?$/.test(s);

// Field numbers sit in a left-hand gutter, but NOT always in the far-left column.
// On the captured filled form, fields 4/5/7 share one baseline and their numbers
// sit at x=39, x=170 and x=302 — a second and third column of fields. So a field
// number is any short numeric token that begins a label, wherever it sits, as long
// as it is not inside the consulate's own column.
const FIELD_NUM_RE = /^(\d{1,2})\s*[\.\)]\s*$/;
const isGutterNum = (s) => /^\d{1,2}\s*[\.\)]?$/.test(s.trim());

// The right-hand "FOR OFFICIAL USE ONLY" column is filled by the consulate, never
// by the applicant. Anything past this is not applicant data.
const OFFICIAL_USE_MIN_X = 400;

// A field owns a horizontal BAND from its own gutter x to the next field's gutter
// x (or the official-use column). Only text that starts inside that band can be its
// value — this is what stops three fields sharing one baseline from stealing each
// other's values.
const BAND_SLACK = 6;

// A label-to-value gap is small but not zero; 30px covers the captured forms with
// room to spare without swallowing the next field.
const MAX_VALUE_GAP = 30;

// Values wrapped onto a second line (e.g. "Russian (Former" / "USSR)") continue at
// roughly line height below their first line.
const WRAP_GAP = 26;

/**
 * Group items into visual rows by baseline y.
 *
 * Two details matter and were both wrong in the first attempt, discovered by
 * running this against the captured geometry rather than reasoning about it:
 *
 *  1. A row often contains the gutter number, the label AND the start of the next
 *     column: '2. Surname at birth (Former family name(s)): Date of application:'.
 *     So the number is matched as a LEADING token, and the label is built only
 *     from items between the gutter and the next field-number position.
 *
 *  2. Averaging y into the running row baseline (`row.y = (row.y + it.y) / 2`)
 *     lets a tall row drift far enough to reorder rows and swallow neighbours.
 *     The first item seen defines the baseline and is not moved.
 */
function toRows(items) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    // 6px tolerance: same baseline in the captured geometry, but keep it loose
    // enough for forms that use slightly different font metrics.
    if (row && Math.abs(row.baseline - it.y) <= 6) {
      row.items.push(it);
    } else {
      rows.push({ baseline: it.y, items: [it] });
    }
  }
  for (const r of rows) {
    r.items.sort((a, b) => a.x - b.x);
    r.y = r.baseline;
    r.left = r.items[0].x;
    r.text = r.items.map((i) => i.s).join(' ').replace(/\s+/g, ' ').trim();
    r.textX = r.items[0].x;
  }
  return rows;
}

/**
 * Extract numbered fields and their filled values from a filled application form.
 *
 * @param {Array<{s:string,x:number,y:number}>} items pdf.js text items for ONE page.
 * @returns {{fields: Array, notes: string[]}}
 */
export function extractFormFields(items) {
  const notes = [];
  if (!Array.isArray(items) || !items.length) {
    return { fields: [], notes: ['The page contained no readable text.'] };
  }

  const rows = toRows(items);
    const fields = [];

    // A field start is a number token immediately followed by its label. Several
    // fields can share one baseline ('4. Date of birth' | '5. Place of birth:' |
    // '7. Current nationality:' all sit on y=474), so fields are detected per FIELD
    // NUMBER ITEM rather than per row. Each detection owns the horizontal band from
    // its own number's x to the next number's x on that row, or the official-use
    // column — which is what stops three fields sharing a baseline from stealing
    // each other's values.
    const gutterHits = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const it of row.items) {
        const fm = FIELD_NUM_RE.exec(it.s);
        if (!fm) continue;
        if (it.x >= OFFICIAL_USE_MIN_X) continue;   // consulate's own column
        const n = Number(fm[1]);
        if (n >= 1 && n <= 40) gutterHits.push({ row: i, x: it.x, number: n });
      }
    }
    gutterHits.sort((a, b) => a.row - b.row || a.x - b.x);

    for (let hi = 0; hi < gutterHits.length; hi++) {
      const hit = gutterHits[hi];
      const row = rows[hit.row];
      const nextHit = gutterHits[hi + 1];
      const nextSameRow = (nextHit && nextHit.row === hit.row) ? nextHit.x : OFFICIAL_USE_MIN_X;
      const stopX = nextSameRow;
      const inBand = (it) => it.x >= hit.x - BAND_SLACK && it.x < stopX - BAND_SLACK;

      // The label is the items after this field number, inside the band.
      const labelItems = row.items.filter((it) => it.x > hit.x + 2 && it.x < stopX);
      let label = labelItems.map((it) => it.s).join(' ').replace(/\s+/g, ' ').trim();
      if (!label) continue;

      // Walk down to find the value, accepting only text inside this field's band.
      let valueParts = [];
      let labelY = row.y;
      for (let j = hit.row + 1; j < rows.length; j++) {
        const below = rows[j];
        const gap = labelY - below.y;

        // Stop at the next field number anywhere in this row.
        if (below.items.some((it) => FIELD_NUM_RE.test(it.s) && it.x < OFFICIAL_USE_MIN_X)) break;
        // Too far below to belong to this field.
        if (gap > MAX_VALUE_GAP * 1.6) break;

        // Restrict to text inside this field's band. Official-use column text and
        // neighbouring columns are skipped rather than ending the search, because
        // field 1's value sits below 'FOR OFFICIAL USE ONLY'.
        const bandItems = below.items.filter(inBand);
        if (!bandItems.length) continue;
        const bandText = bandItems.map((it) => it.s).join(' ').replace(/\s+/g, ' ').trim();

        if (!valueParts.length && isLabelish(bandText)) {
                // A wrapped label line — but only if it is genuinely a continuation of
                // THIS field. Field 6 ('Country of birth:') sits below field 7's wrapped
                // label ('Nationality at birth, if' / 'different:') on the captured form,
                // so a band that merely ends in ':' is not enough: it must not be another
                // field's label text. Reject a continuation that names a different field.
                if (startsNewFieldLabel(bandText)) break;
                label += ' ' + bandText;
                labelY = below.y;
                continue;
              }

        // This is the value line. Checkbox rows ('[-] Male [x] Female') are values
        // too: the ticked option is the answer.
        valueParts.push(bandText);
        let k = j + 1;
        while (k < rows.length) {
          const nxt = rows[k];
          const g = below.y - nxt.y;
          if (g > WRAP_GAP) break;
          if (nxt.items.some((it) => FIELD_NUM_RE.test(it.s) && it.x < OFFICIAL_USE_MIN_X)) break;
          const nxtBand = nxt.items.filter(inBand);
          if (!nxtBand.length) break;
          valueParts.push(nxtBand.map((it) => it.s).join(' ').replace(/\s+/g, ' ').trim());
          k++;
        }
        break;
      }

      const value = valueParts.join(' ').replace(/\s+/g, ' ').trim();
      fields.push({
        number: hit.number,
        label: label.replace(/\s+/g, ' ').trim(),
        value,
        filled: Boolean(value),
      });
    }

  if (!fields.length) {
    notes.push('No numbered fields were found on this page.');
  }
  return { fields, notes };
}

// The x a label's text begins at — used to keep value lines aligned with it.
function labelStartX(row) {
  // (unused: band filtering replaced x-alignment) //
  const first = row.items.find((it) => it.x > GUTTER_MAX_X);
  return first ? first.x : row.left;
}

// Label text that clearly begins a NEW field rather than continuing the current
// one. Harmless phrases that legitimately wrap ("(day-month-year):",
// "different:") are excluded.
const NEW_LABEL_STARTS = /^(nationality|country|date|place|surname|first name|sex|civil|type of|number of|main purpose|member state|address|occupation|employer|email|telephone|marital|single|married|entries|duration|signature|place and date)\b/i;
const WRAP_CONTINUATIONS = /^\((day-month-year|family name|given name|former family name)s?\)\s*:?$/i;

function startsNewFieldLabel(text) {
  const t = text.trim();
  if (!t || WRAP_CONTINUATIONS.test(t)) return false;
  return NEW_LABEL_STARTS.test(t);
}

/**
 * Is this extracted string plausibly an ANSWER rather than printed label text?
 *
 * Positional extraction can pull in a neighbouring field's label — field 6
 * ('Country of birth:') picked up 'Nationality at birth, if' from the column to its
 * right. A contaminated value is worse than a missing one: it gets cross-checked
 * against a passport or a booking and produces a confident, wrong finding. So this
 * gate rejects rather than repairs, and the UI simply shows nothing for that field.
 *
 * Structural, not semantic — it cannot know that "Business" is a plausible answer
 * for a purpose-of-journey field, only that "please specify:" is not an answer.
 */
const LABEL_WORDS = /(specify|different|indicate|applicant|please|member state|intended|first name|family name|given name|valid until|issued by|if applicable|tick the box|mark the box|only schengen|per the ticket|purpose|additional information|and e-mail|number of travel|relationship with|travel document)/i;

export function looksLikeValue(text) {
  const t = String(text ?? '').trim();
  if (!t) return false;
  // Dotted fill-in rules ('....................') are form furniture, not answers.
  if (/^\.{4,}$/.test(t)) return false;
  // More than one colon means two labels merged together.
  if ((t.match(/:/g) || []).length > 1) return false;
  if (LABEL_WORDS.test(t)) return false;
  // A checkbox row is a legitimate answer; a row where nothing is ticked is not.
  if (/^\[\s*-\s*\]/.test(t) && !/\[\s*[xX]\s*\]/.test(t)) return false;
  return true;
}

/**
 * Map harmonised Schengen form field numbers onto Previsa's field names.
 * Numbers are stable across the EU harmonised form and its national variants.
 */
export const SCHENGEN_FIELD_MAP = {
  1: 'surname',
  2: 'surnameAtBirth',
  3: 'firstNames',
  4: 'dateOfBirth',
  5: 'placeOfBirth',
  6: 'countryOfBirth',
  7: 'nationality',
  8: 'sex',
  9: 'civilStatus',
  11: 'nationalId',
  12: 'documentType',
  13: 'passportNumber',
  14: 'issueDate',
  15: 'passportExpiry',
  16: 'issuedBy',
  17: 'homeAddress',
  19: 'occupation',
  20: 'employerName',
  22: 'employerAddress',
  23: 'purposeOfJourney',
  25: 'mainDestination',
  26: 'firstEntry',
  27: 'entriesRequested',
  28: 'durationDays',
  29: 'priorVisas',
  31: 'arrivalDate',
  32: 'departureDate',
  34: 'hostName',
  35: 'hostAddress',
  37: 'costCoveredBy',
  39: 'signatureDate',
};