// Value normalisation for values extracted from a filled visa application form.
//
// This was written inline in the old src/app.js. It is pure logic with no DOM
// dependency, so it belongs in lib/ where the tests can reach it directly rather
// than reaching into a UI module and re-implementing it.
//
// A filled form writes answers in whatever shape the form demands. Two shapes need
// real handling rather than tidying:
//
//   checkboxes  '[-] Male [x] Female'       -> 'Female'
//   ranked list '1. DoubleTree by Hilton'   -> 'DoubleTree by Hilton'
//
// Stripping the '[x]' marker without reading it first would turn '[-] Male [x]
// Female' into 'Male Female', which is not an answer at all — it would be applied
// to a field and then cross-checked as though the applicant had written both.

/**
 * @param {string} raw  the raw extracted text
 * @returns {string} the answer, with form scaffolding removed
 */
export function cleanFormValue(raw) {
  const text = String(raw);

  // A checkbox row: keep only what is ticked. If nothing is ticked there is no
  // answer here — return '' and let the caller drop the field, rather than
  // returning the labels with their markers stripped.
  //
  // Order matters. An earlier version fell through to plain cleanup when no box was
  // ticked, which turned '[-] Single [-] Two' into 'Single Two'. That string looks
  // like a plausible answer, passes every downstream check, and would be applied to
  // a field as though the applicant had written two options. Once the markers are
  // gone there is nothing left to detect, so the decision has to happen HERE.
  if (/^\s*\[/.test(text)) {
    if (!/\[\s*[xX]\s*\]/.test(text)) return '';
    const picked = [];
    // Each '[x] Label' runs to the next bracket or end of line.
    const re = /\[\s*[xX]\s*\]\s*([^[\]]+?)(?=\s*\[\s*[-\sxX]|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const label = m[1].trim();
      if (label) picked.push(label);
    }
    return picked.join(', ');
  }

  return text
    .replace(/\[\s*[xX]\s*\]/g, '')
    .replace(/\[\s*-\s*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+[.)]\s*/, '')
    .trim();
}