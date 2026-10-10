// The destination checklist: what this application needs, and what it has.
//
// This is the pre-flight view. The report answers "what is wrong with what I
// already have"; the checklist answers "what am I still missing", which is the
// question an applicant actually asks before they start assembling a file.
//
// It deliberately duplicates no requirement data. The lists come from
// requirements.js, the same module R00 reads, so the checklist cannot claim a
// document is satisfied while R00 is failing it — the drift that would happen if
// each kept its own copy.
//
// It is also not a score. A progress bar of documents is not a readiness
// percentage: having six of six documents says nothing about whether the name on
// the hotel booking matches the passport, and implying otherwise would be the
// false-confidence failure this whole app is built to avoid.

import { useMemo, useState } from 'react';
import { requirementsFor, destinationName } from '../lib/requirements.js';
import { badFieldsByDoc, failCountByDoc } from '../derive.js';

export default function Checklist({ app, report, onGoTo }) {
  const [expanded, setExpanded] = useState(false);
  const dest = useMemo(() => {
    // Resolve the destination the same way the engine does, so the checklist
    // heading and the rules being applied can never disagree. Importing
    // destinationKey would be cleaner but it is private to rules.js; the
    // resolution order is short enough to restate, and report.rules carries the
    // engine's own verdict if this ever drifts.
    const explicit = String(app.trip?.destinationCountry ?? '').trim().toLowerCase();
    if (explicit) return explicit;
    const text = String(app.meta?.destination ?? '').toLowerCase();
    if (/\bschengen\b/.test(text)) return 'schengen';
    if (/\b(uk|united kingdom|britain|england|scotland|wales|northern ireland)\b/.test(text)) return 'uk';
    if (/\b(us|usa|u\.s\.|united states|america)\b/.test(text)) return 'us';
    if (/\bcanada\b/.test(text)) return 'canada';
    if (/\baustralia\b|\bnew zealand\b/.test(text)) return 'australia';
    return 'schengen';
  }, [app]);

  const items = useMemo(() => {
    const reqs = requirementsFor(dest);
    // Per-document failing fields, from the same derivation the document panels
    // use. Reusing it means the checklist and the panels can never disagree about
    // which field is red — a second traversal of the findings here would be a
    // second implementation of the same idea, free to drift.
    const bad = badFieldsByDoc(report.findings, app);
    const counts = failCountByDoc(report.findings, app);
    const r00 = report.findings.find((f) => f.id === 'R00');
    return reqs.map(({ key, label, always }) => {
      const doc = app.docs?.[key];
      const values = Object.values(doc?.fields ?? {});
      const hasValue = values.some((v) => v != null && String(v).trim() !== '');
      const missing = !hasValue;
      return {
        key,
        label,
        always,
        missing,
        named: missing && r00 ? r00.title.includes(label) : false,
        problemCount: counts.get(key) ?? 0,
        // badFieldsByDoc returns a Set, so this has to be spread or indexed via
        // iteration — `set[0]` is undefined, which silently produced no jump links
        // at all while the state badge still read "problem".
        firstBadField: [...(bad.get(key) ?? [])][0] ?? null,
      };
    });
  }, [dest, app, report]);

  const have = items.filter((i) => !i.missing).length;
  const clean = items.filter((i) => !i.missing && i.problemCount === 0).length;
  // Anything needing attention forces the list open; an all-clear file collapses to
  // its header, because a list of six green ticks says less than the header already
  // did and costs 150px the document panels need more. The state is derived, not
  // remembered, so it reopens by itself the moment a document goes missing.
  const needsAttention = items.some((i) => i.missing || i.problemCount > 0);
  const open = needsAttention || expanded;

  return (
    <section className="panel checklist">
      {/* The destination IS the heading. A separate "Application documents" panel
          heading plus a "Schengen short-stay checklist" line above it said the same
          thing twice; the destination is the more useful of the two, so it leads and
          the counts ride on the same line. Keeps this panel to one header row,
          which is what lets the document panels stay above the fold. */}
      <h2 className="panel-h ck-head">
        <strong>{destinationName(dest)}</strong>
        <span className="ck-count">
          {have}/{items.length} documents
          {clean === items.length ? ', all clear' : `, ${clean} clear`}
        </span>
        <span className="ck-caveat">document count, not correctness</span>
        {/* Only offered when the list would otherwise hide something. If a document
            is missing or has findings the list is already open, so the toggle would
            be a button that does nothing. */}
        {!needsAttention && (
          <button
            type="button"
            className="ck-toggle"
            aria-expanded={open}
            onClick={() => setExpanded((v) => !v)}
          >
            {open ? 'hide' : 'show all'}
          </button>
        )}
      </h2>

      {/* Hidden by CSS rather than not rendered, so print can reveal it — the same
          reasoning as the fix list. */}
      <ul className="ck-list" data-collapsed={!open}>
        {items.map((i) => {
          const state = i.missing ? 'missing' : i.problemCount ? 'problem' : 'ok';
          return (
            <li key={i.key} className={`ck-item ${state}`}>
              <span className="ck-box" aria-hidden="true">
                {state === 'missing' ? '—' : state === 'problem' ? '!' : '✓'}
              </span>
              <span className="ck-label">{i.label}</span>
              {!i.always && <span className="ck-cond">{destinationName(dest)} only</span>}
              <span className="ck-state">
                {state === 'missing'
                  ? 'not in the file'
                  : state === 'problem'
                    ? `${i.problemCount} finding${i.problemCount === 1 ? '' : 's'}`
                    : 'clear'}
              </span>
              {/* A missing document has no field to jump to, so no link — but a
                  document with findings does, and that link is the whole point of
                  putting this next to the documents panel. */}
              {state === 'problem' && i.firstBadField && (
                <button
                  type="button"
                  className="ck-jump"
                  onClick={() => onGoTo(i.key, i.firstBadField)}
                  aria-label={`Open ${i.label} at the first field with a finding`}
                >
                  open →
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}