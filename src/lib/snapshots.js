// Snapshot save + diff for the audit trail.
//
// A snapshot is a deep copy of the current application at a moment in time, with a
// name and a timestamp. The audit trail a visa agency actually needs is the diff
// between two snapshots: what did the applicant change between submissions, and did
// the score move in the right direction?
//
// Persistence lives in localStorage under its own key so snapshots survive reloads
// but stay independent from the live application — the live app is autosaved on
// every edit and would be overwritten before you could diff against it.

import { runRules } from './rules.js';

export const SNAP_KEY = 'preflight-snapshots';

export function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Guard against a hand-edited key: every snapshot needs a name and an app.
    return parsed.filter((s) => s && s.name && s.app);
  } catch {
    return [];
  }
}

export function persistSnapshots(list) {
  try { localStorage.setItem(SNAP_KEY, JSON.stringify(list)); } catch { /* quota */ }
}

/**
 * Save a snapshot of the current app.
 *
 * Deep-copied so later edits to the live app don't mutate the snapshot, which
 * would silently destroy the audit trail.
 */
export function saveSnapshot(app, name) {
  const list = loadSnapshots();
  const snap = {
    id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Snapshot ${list.length + 1}`,
    savedAt: new Date().toISOString(),
    app: structuredClone(app),
    score: runRules(app).score,
  };
  persistSnapshots([...list, snap]);
  return snap;
}

export function deleteSnapshot(id) {
  persistSnapshots(loadSnapshots().filter((s) => s.id !== id));
}

/**
 * Field-level diff between two applications.
 *
 * Only `fields` content is compared, plus whole-document add/remove. Envelope
 * metadata (label, tag, source) is ignored: those describe the document, not the
 * application, and a diff that flags them is noise.
 *
 * Returns rows of { action, doc, field, from, to } sorted by doc then field.
 */
export function diffApps(a, b) {
  const rows = [];
  const docsA = a.docs ?? {};
  const docsB = b.docs ?? {};
  const allDocs = new Set([...Object.keys(docsA), ...Object.keys(docsB)]);
  for (const key of [...allDocs].sort()) {
    if (!docsA[key]) {
      rows.push({ action: 'added', doc: key, field: null, from: null, to: null });
      continue;
    }
    if (!docsB[key]) {
      rows.push({ action: 'removed', doc: key, field: null, from: null, to: null });
      continue;
    }
    const fa = docsA[key]?.fields ?? {};
    const fb = docsB[key]?.fields ?? {};
    const allFields = new Set([...Object.keys(fa), ...Object.keys(fb)]);
    for (const field of [...allFields].sort()) {
      if (!(field in fb)) {
        rows.push({ action: 'removed', doc: key, field, from: fa[field], to: null });
      } else if (!(field in fa)) {
        rows.push({ action: 'added', doc: key, field, from: null, to: fb[field] });
      } else if (fa[field] !== fb[field]) {
        rows.push({ action: 'changed', doc: key, field, from: fa[field], to: fb[field] });
      }
    }
  }
  return rows;
}
