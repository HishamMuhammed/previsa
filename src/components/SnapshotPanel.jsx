// The snapshot panel: save a named copy of the current application and diff two of
// them.
//
// The audit trail a visa agency actually needs is not the snapshots themselves but
// the diff between them — what did the applicant change between "as submitted" and
// "corrected"? The panel saves snapshots on demand (not on every edit, which would
// bury the meaningful ones in noise) and renders the diff as field-level rows.
//
// Scores are shown next to each snapshot because the diff alone doesn't tell you
// whether the changes helped. A diff that flips a fail to a pass is useful; one
// that flips a pass to a fail is not.

import { useState, useEffect } from 'react';
import {
  loadSnapshots, saveSnapshot, deleteSnapshot, diffApps,
} from '../lib/snapshots.js';

export default function SnapshotPanel({ app }) {
  const [list, setList] = useState([]);
  const [selA, setSelA] = useState(null);
  const [selB, setSelB] = useState(null);
  const [diff, setDiff] = useState(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    const snaps = loadSnapshots();
    setList(snaps);
    // Keep the selections valid as the list changes. A stale id would silently
    // hide the diff the user asked for.
    if (!snaps.some((s) => s.id === selA)) setSelA(null);
    if (!snaps.some((s) => s.id === selB)) setSelB(null);
  }, []);

  const runDiff = () => {
    if (!selA || !selB) { setDiff(null); return; }
    const a = list.find((s) => s.id === selA);
    const b = list.find((s) => s.id === selB);
    if (!a || !b) { setDiff(null); return; }
    setDiff(diffApps(a.app, b.app));
  };

  useEffect(() => { runDiff(); }, [selA, selB, list]);

  const onSave = () => {
    const snap = saveSnapshot(app, name.trim());
    setList(loadSnapshots());
    setSelA(snap.id);
    setName('');
    setNaming(false);
  };

  const onDelete = (id) => {
    deleteSnapshot(id);
    setList(loadSnapshots());
  };

  const snapName = (id) => list.find((s) => s.id === id);
  const fmtScore = (s) => (typeof s === 'number' ? `${s}%` : '—');

  return (
    <section className="panel snap-panel">
      <h2 className="panel-h">Saved snapshots</h2>
      <p className="panel-note">
        Save a copy at a moment — "as submitted", "corrected" — then diff two to see
        exactly what changed.
      </p>

      <ul className="snap-list">
        {list.length === 0 && (
          <li className="snap-empty">
            No snapshots yet. Save one to start an audit trail.
          </li>
        )}
        {list.map((s) => (
          <li key={s.id} className="snap-item">
            <label className="snap-radio">
              <input
                type="radio"
                name="snapA"
                checked={selA === s.id}
                onChange={() => setSelA(s.id)}
                aria-label={`Compare ${s.name} as "from"`}
              />
              <input
                type="radio"
                name="snapB"
                checked={selB === s.id}
                onChange={() => setSelB(s.id)}
                aria-label={`Compare ${s.name} as "to"`}
              />
            </label>
            <span className="snap-name">{s.name}</span>
            <span className="snap-score">{fmtScore(s.score)}</span>
            <button
              type="button"
              className="snap-del"
              onClick={() => onDelete(s.id)}
              aria-label={`Delete ${s.name}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {naming ? (
        <span className="snap-form">
          <input
            className="snap-input"
            value={name}
            autoFocus
            placeholder="As submitted"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') { setNaming(false); setName(''); }
            }}
          />
          <button type="button" className="snap-ok" onClick={onSave}>save</button>
        </span>
      ) : (
        <button type="button" className="snap-add" onClick={() => setNaming(true)}>
          + Save a snapshot
        </button>
      )}

      <div className="snap-diff">
        {!selA || !selB ? (
          <p className="snap-hint">Select two snapshots above to compare them.</p>
        ) : selA === selB ? (
          <p className="snap-hint">Pick two different snapshots to compare.</p>
        ) : (
          <>
            <h3 className="snap-diff-h">
              {snapName(selA)?.name} → {snapName(selB)?.name}
              {' '}
              <span className="snap-diff-score">
                {fmtScore(snapName(selA)?.score)} → {fmtScore(snapName(selB)?.score)}
              </span>
            </h3>
            {diff && diff.length === 0 ? (
              <p className="snap-same">No differences — the two snapshots are identical.</p>
            ) : diff && (
              <ul className="snap-diff-list">
                {diff.map((d) => (
                  <li key={`${d.action}-${d.doc}-${d.field ?? ''}`} className={`snap-row ${d.action}`}>
                    <span className="snap-action">{d.action}</span>
                    <span className="snap-row-doc">{d.doc}</span>
                    {d.field && <span className="snap-row-field">{d.field}</span>}
                    <span className="snap-row-change">
                      {d.action === 'changed'
                        ? `${d.from ?? ''} → ${d.to ?? ''}`
                        : d.action === 'added'
                          ? `+ ${d.to ?? ''}`
                          : `− ${d.from ?? ''}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  );
}
