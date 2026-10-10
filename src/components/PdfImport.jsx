// PDF import: choose a document, read it, get editable suggestions.
//
// The one rule this panel enforces without exception: Previsa SUGGESTS, it never
// fills. Every value arrives in an input the user must inspect, edit if wrong, and
// explicitly apply. An auto-filling tool for visa paperwork is a tool that can
// quietly introduce the exact inconsistency it exists to catch.
//
// Three things it also refuses to do, each stated plainly rather than hidden:
//   - read a scan or a photo (no text layer to read)
//   - open a password-protected PDF
//   - guess at a field it could not read cleanly

import { useState, useRef } from 'react';
import { importPdf, NO_TEXT_MESSAGE } from '../lib/pdf.js';
import { extractFormFields, SCHENGEN_FIELD_MAP, looksLikeValue } from '../lib/formfields.js';
import { scopeToDocument } from '../lib/formscope.js';
import { cleanFormValue } from '../lib/formvalue.js';

const DOC_CHOICES = [
  ['accommodation', 'Hotel booking'],
  ['itinerary', 'Flight itinerary'],
  ['bankStatement', 'Bank statement'],
  ['application', 'Visa application form'],
  ['passport', 'Passport bio page'],
];

const CONFIDENCE_WORD = { high: 'high confidence', medium: 'worth checking', low: 'low confidence', positional: 'read from the form layout' };

export default function PdfImport({ state, report, actions }) {
  const { importDoc, pendingImport, status } = state;
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const [edited, setEdited] = useState({});

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setEdited({});
    actions.setStatus({ text: `Reading ${file.name}…`, tone: 'busy' });

    let pdfjsLib = null;
    try {
      const lib = await import('../vendor/pdf.mjs');
      pdfjsLib = lib.default ?? lib;
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.mjs', import.meta.url).href;
    } catch {
      actions.setStatus({ text: 'Could not load the PDF reader. Reload the page and try again.', tone: 'bad' });
      setBusy(false);
      return;
    }

    const buf = await file.arrayBuffer();
    const result = await importPdf(buf, pdfjsLib);

    if (!result.ok) {
      actions.setStatus({ text: `${file.name}: ${result.message}`, tone: 'bad' });
      setBusy(false);
      return;
    }
    if (!result.textLayer) {
      actions.setStatus({ text: `${file.name}: no text layer. ${NO_TEXT_MESSAGE}`, tone: 'warn' });
      setBusy(false);
      return;
    }

    const { suggestFields, bestPerField, guessDocumentType, DOC_LABELS } = await import('../lib/extract.js');

    // Plain-text path: booking confirmations, itineraries, bank statements.
    const { suggestions } = suggestFields(result.pages, importDoc);
    let best = bestPerField(suggestions);
    let formFields = null;

    // Positional path: a numbered application form, where each value sits in its
    // own box rather than after "Label:". Run it always, and let it win only when
    // it finds strictly more — a hotel booking's dotted fill-in rules read as a
    // date under the text path, so "fewer than nothing" is not the right test.
    const form = runFormExtraction(result.geometry, importDoc, state.app);
    if (form && form.total > 0 && form.best.length > best.length) {
      best = form.best;
      formFields = form;
    }

    const skipped = result.pageCount > 1 ? ` · ${result.pageCount} pages` : '';
    let text;
    if (formFields) {
      const filled = formFields.fields.filter((f) => f.filled).length;
      const skippedNote = formFields.rejected ? ` ${formFields.rejected} skipped as unreadable rather than guessed at.` : '';
      text = `${file.name}: read ${best.length} fields from ${filled} filled of ${formFields.total} numbered fields${skipped}.${skippedNote}`;
    } else {
      const guessed = guessDocumentType(result.pages);
      const looks = guessed && guessed !== importDoc ? ` · this looks like a ${DOC_LABELS[guessed]?.toLowerCase() ?? guessed}` : '';
      text = `${file.name}: read ${result.chars} characters${skipped}${looks}`;
    }

    actions.imported(importDoc, { doc: importDoc, best, formFields }, {
      text: `${text}. Check each suggestion before applying — Previsa does not fill anything in on its own.`,
      tone: 'idle',
    });
    setBusy(false);
  }

  function applyOne(i) {
    const s = pendingImport.best[i];
    if (!s) return;
    actions.edit(importDoc, s.field, edited[i] ?? s.value);
    actions.setStatus({
      text: `Applied ${s.field} to the ${DOC_CHOICES.find(([k]) => k === importDoc)?.[1].toLowerCase()}. Reapply any time — every check has re-run.`,
      tone: 'good',
    });
  }

  function clear() {
    actions.clearImport();
    setEdited({});
    // Resetting the input's value is load-bearing: input[type=file] only fires
    // `change` when its value actually changes, so without this, choosing the same
    // PDF again after Clear would do nothing at all.
    if (fileRef.current) fileRef.current.value = '';
  }

  const { best } = pendingImport;

  return (
    <section className="panel">
      <h2 className="panel-h">Import a document</h2>
      <p className="panel-note">
        Reads the text layer of a hotel booking, flight itinerary, bank statement, or a numbered
        visa application form — by layout, not OCR. Previsa suggests values; it never fills one
        in on its own.
      </p>

      <div className="pdf-controls">
        <label className="pdf-pick">
          <input
            ref={fileRef}
            type="file"
            id="pdf-file"
            accept="application/pdf,.pdf"
            hidden
            onChange={onFile}
          />
          <span className="btn">Choose a PDF…</span>
        </label>
        <label className="pdf-which">
          <span>It is a</span>
          <select
            id="pdf-doc"
            value={importDoc}
            onChange={(e) => actions.setImportDoc(e.target.value)}
          >
            {DOC_CHOICES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </label>
        <button className="btn btn-quiet" type="button" id="btn-pdf-clear" onClick={clear}>Clear</button>
      </div>

      {status.text ? <p className={`pdf-status ${status.tone}`} role="status" aria-live="polite">{status.text}</p> : null}

      {best.length > 0 && (
        <div id="pdf-panel">
          <p className="pdf-count" id="sg-count">
            {best.length} suggestion{best.length === 1 ? '' : 's'}, none applied yet — applying one
            updates your file and re-runs every check.
          </p>
          <div id="pdf-suggestions">
            {best.map((s, i) => (
              <div key={`${s.field}-${i}`} className="sg">
                <div className="sg-head">
                  <span className="sg-field">{s.field}</span>
                  <span className="sg-conf">{CONFIDENCE_WORD[s.confidence] ?? s.confidence}</span>
                </div>
                <input
                  className="sg-input"
                  value={edited[i] ?? s.value}
                  onChange={(e) => setEdited((p) => ({ ...p, [i]: e.target.value }))}
                />
                <div className="sg-foot">
                  <span className="sg-source">{s.source}</span>
                  <button className="btn btn-quiet sg-apply" type="button" onClick={() => applyOne(i)}>
                    {edited[i] != null && edited[i] !== s.value ? 'Apply' : 'Reapply'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingImport.doc && best.length === 0 && status.text && !busy && (
        <div className="pdf-note">
          <p><strong>Previsa read this PDF but could not find any labelled fields or numbered
          form fields in it.</strong></p>
          <p>Import reads booking confirmations, flight itineraries and bank statements, and
          reads numbered application forms (EU harmonised and national variants) by their layout.
          It cannot read a photo or scan of a form, or a form filled in by hand.</p>
          <p>Your file has not been changed. Fill the fields in by hand — every check works
          exactly the same way.</p>
        </div>
      )}
    </section>
  );
}

/**
 * Run positional form extraction over every page and scope the result to one
 * document type.
 *
 * Scoping is not optional: an application form is personal data, and offering its
 * surname against a hotel booking writes the applicant's name into a reservation,
 * which then fails the name cross-check for a reason that has nothing to do with
 * the hotel. An earlier version did exactly that.
 */
function runFormExtraction(geometry, doc, app) {
  if (!Array.isArray(geometry)) return null;
  const all = [];
  for (const items of geometry) {
    const { fields } = extractFormFields(items || []);
    for (const f of fields) if (f.filled) all.push(f);
  }
  if (!all.length) return null;

  // Later pages repeat earlier field numbers; first non-empty value wins.
  const byNumber = new Map();
  for (const f of all) if (!byNumber.has(f.number)) byNumber.set(f.number, f);

  const suggestions = [];
  let rejected = 0;
  for (const [number, f] of byNumber) {
    if (!SCHENGEN_FIELD_MAP[number]) continue;
    const value = cleanFormValue(f.value);
    // A value still containing label vocabulary is dropped, not cleaned: it would be
    // cross-checked against a passport and produce a confident, wrong finding.
    if (!looksLikeValue(value)) { rejected++; continue; }
    suggestions.push({
      field: SCHENGEN_FIELD_MAP[number],
      value,
      confidence: 'positional',
      source: `Field ${number} — ${f.label.replace(/:\s*$/, '')}`,
    });
  }

  const available = Object.keys(app.docs?.[doc]?.fields ?? {});
  return { fields: [...byNumber.values()], total: byNumber.size, rejected, best: scopeToDocument(suggestions, doc, available) };
}