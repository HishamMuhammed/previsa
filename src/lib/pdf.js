// PDF text extraction — the parsing half of the import feature.
//
// Pure as far as it can be: it takes a parsed pdf.js text content array and
// returns clean lines. The pdf.js call itself lives in importPdf(), which is the
// only part that needs a browser, so the line-reconstruction logic below is
// unit-testable in Node in milliseconds.
//
// Design constraint carried from the rest of the app: this never decides
// anything. It returns text and positions; src/extract.js turns those into
// suggestions with a confidence, and the user accepts or corrects them.

/**
 * Rebuild lines from pdf.js text items.
 *
 * pdf.js emits fragments in content-stream order, which is often NOT reading
 * order — a two-column booking can interleave, and a value can be split across
 * several items ("Jose" / "Thomas" / "Menon"). Joining everything with spaces
 * (the naive approach) produces one enormous run-on line and destroys the
 * structure that field extraction depends on.
 *
 * So: bucket items by their y baseline, sort buckets top-to-bottom, then order
 * each line left-to-right by x. Items on the same line are joined with a single
 * space. `hasEOL` is honoured as an explicit break because some generators only
 * emit a new y for paragraph breaks.
 */
export function buildLines(items) {
  // A line-height tolerance in PDF points. Text on one visual line always has
  // baselines within a few points; different lines are further apart. 2.5 is
  // tight enough to keep separate rows apart and loose enough to survive
  // sub-pixel rounding and slightly rotated scans.
  const TOLERANCE = 2.5;

  const lines = [];
  let current = null;

  for (const it of items) {
    if (!it || typeof it.str !== 'string') continue;
    const x = Array.isArray(it.transform) ? it.transform[4] : 0;
    const y = Array.isArray(it.transform) ? it.transform[5] : 0;

    // Y position is the ONLY authority on whether fragments share a line.
    //
    // hasEOL is ignored entirely. Real pdf.js output sets hasEOL=true on nearly
    // every item — including items in the middle of a visual line — so it
    // carries no usable signal about line breaks. Treating it as one split
    // "Guest name:" from "Jose Menon" and destroyed the label/value structure
    // that field extraction depends on. Generators that put two unrelated runs
    // at an identical baseline are rarer than the hasEOL noise, and y alone
    // handles them correctly.
    const sameLine = current != null && Math.abs(y - current.y) <= TOLERANCE;

    if (!sameLine) {
      if (current) lines.push(finishLine(current));
      current = { y, items: [{ x, str: it.str, width: it.width ?? 0 }] };
    } else {
      current.items.push({ x, str: it.str, width: it.width ?? 0 });
    }
  }
  if (current) lines.push(finishLine(current));

  return lines.map((l) => l.text).filter((t) => t.trim() !== '');
}

function finishLine(bucket) {
  const parts = bucket.items
    .slice()
    .sort((a, b) => a.x - b.x)
    .map((i) => i.str)
    .filter((s) => s !== '');
  // Collapse runs of whitespace introduced by position-based joining.
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim() };
}

/**
 * Extract text lines from a pdf.js document, page by page.
 *
 * Also returns the raw positioned items per page. The line reconstruction is for
 * documents that print "Label: value"; official application forms put the value in
 * a separate box, so src/formfields.js needs the x/y of every item instead.
 * Returning both avoids parsing the document twice.
 */
export async function extractLines(pdfDoc) {
  const pages = [];
  const geometry = [];
  for (let p = 1; p <= pdfDoc.numPages; p++) {
    const page = await pdfDoc.getPage(p);
    const tc = await page.getTextContent();
    pages.push(buildLines(tc.items));
    geometry.push(tc.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5] })));
  }
  return { pages, geometry };
}

/**
 * Does this document have a usable text layer anywhere?
 *
 * Any non-whitespace counts. An earlier version required more than one
 * character, which classified a page containing only "9" as having no text —
 * technically defensible, practically wrong: a one-character text layer is
 * still a text layer, and telling the user their PDF is a scan because of it
 * would be a confident falsehood.
 */
export function hasTextLayer(pages) {
  return pages.some((page) => (page ?? []).some((line) => String(line ?? '').trim().length > 0));
}

/**
 * Parse a File/ArrayBuffer with pdf.js.
 *
 * Returns a discriminated result rather than throwing, because "this PDF has no
 * text layer" and "this PDF is password-protected" are ordinary, expected
 * outcomes the user needs told in plain language — not exceptions to surface as
 * a stack trace.
 */
export async function importPdf(buf, pdfjsLib) {
  try {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const { pages, geometry } = await extractLines(doc);
    const text = hasTextLayer(pages);
    return {
      ok: true,
      pages,
      geometry,
      pageCount: doc.numPages,
      textLayer: text,
      chars: pages.flat().join(' ').trim().length,
    };
  } catch (err) {
    // pdf.js does not necessarily throw PasswordException directly: the failure
    // is usually wrapped by the loading task, with the real cause on `.cause`
    // (or nested one level deeper). Matching only the top-level name made an
    // encrypted PDF report "unknown error" — which is exactly the case where the
    // user most needs a specific, actionable message.
    const chain = [];
    for (let e = err, i = 0; e && i < 5; e = e.cause, i++) chain.push(e);
    const names = chain.map((e) => `${e.name ?? ''} ${e.code ?? ''}`.toLowerCase());
    const isEncrypted = chain.some((e) => e?.name === 'PasswordException' || e?.code === 1)
      || names.some((s) => s.includes('password'));
    const isInvalid = chain.some((e) => e?.name === 'InvalidPDFException');

    if (isEncrypted) {
      return {
        ok: false,
        reason: 'encrypted',
        message: 'This PDF is password-protected. Previsa cannot open it — '
          + 're-export it without a password, or enter the password here.',
      };
    }
    if (isInvalid) {
      return {
        ok: false,
        reason: 'invalid',
        message: 'That file is not a readable PDF.',
      };
    }
    return {
      ok: false,
      reason: 'unknown',
      message: `Could not read that PDF: ${err?.message ?? 'unknown error'}.`,
    };
  }
}

/** The message shown when a PDF has pages but no extractable text. */
export const NO_TEXT_MESSAGE =
  'This PDF has no text layer — it is a scan or a photo of a document. '
  + 'Previsa can only read PDFs that contain selectable text, so it has nothing '
  + 'to extract from this one. Re-export or print-to-PDF from the original to get a '
  + 'text version.';