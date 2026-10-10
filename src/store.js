// Application state: one reducer, one store. This is what replaced the old
// render-by-innerHTML approach and its focus-loss workaround.
//
// In the vanilla version every edit re-rendered the whole document list from
// innerHTML, which destroyed the focused <input>; the fix was to capture and
// restore focus and caret around the re-render. With React the DOM is diffed, so
// the input keeps focus and the caret by construction and that workaround is gone
// entirely — not fixed, deleted.
//
// Everything below the reducer is pure and already tested: runRules, readFormFields,
// scopeToDocument and the extraction helpers have no React dependency.

import { useReducer, useCallback, useMemo, useRef } from 'react';
import { runRules } from './lib/rules.js';
import { SAMPLE_APPLICATION } from './lib/sample.js';
import { extractFormFields, SCHENGEN_FIELD_MAP, looksLikeValue } from './lib/formfields.js';
import { scopeToDocument } from './lib/formscope.js';
import { cleanFormValue } from './lib/formvalue.js';

const APP_KEY = 'preflight-application';

// ---------------------------------------------------------------- persistence

function loadStored() {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Shape check matters: a stale or hand-edited payload that lacks `trip` makes
    // every date rule report 'na', which looks like a clean report rather than a
    // broken one.
    if (!parsed || typeof parsed !== 'object' || !parsed.docs || !parsed.trip) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(app) {
  try { localStorage.setItem(APP_KEY, JSON.stringify(app)); } catch { /* quota or private mode */ }
}

// ---------------------------------------------------------------- initial state

function initialState() {
  const stored = loadStored();
  return {
    app: stored ?? structuredClone(SAMPLE_APPLICATION),
    openDocs: new Set(),
    filter: 'all',
    importDoc: 'accommodation',
    pendingImport: { doc: null, best: [], formFields: null },
    status: { text: '', tone: 'idle' },
  };
}

// ---------------------------------------------------------------- reducer

function reducer(state, action) {
  switch (action.type) {
    // A field edit. Deriving nothing here means the whole report recomputes from
    // the single source of truth, which is the point: one engine, one score, no
    // chance of the UI and the report disagreeing.
    case 'edit':
      return {
        ...state,
        app: {
          ...state.app,
          docs: {
            ...state.app.docs,
            [action.doc]: {
              ...state.app.docs[action.doc],
              fields: {
                ...state.app.docs[action.doc].fields,
                [action.field]: action.value,
              },
            },
          },
        },
      };

    case 'toggleDoc': {
      const next = new Set(state.openDocs);
      next.has(action.doc) ? next.delete(action.doc) : next.add(action.doc);
      return { ...state, openDocs: next };
    }

    case 'filter':
      return { ...state, filter: action.filter };

    case 'importDoc':
      return { ...state, importDoc: action.doc, pendingImport: { doc: action.doc, best: [], formFields: null } };

    case 'status':
      return { ...state, status: action.status };

    case 'imported':
      return { ...state, importDoc: action.doc, pendingImport: action.pending, status: action.status };

    case 'clearImport':
      return {
        ...state,
        pendingImport: { doc: null, best: [], formFields: null },
        status: { text: '', tone: 'idle' },
      };

    case 'reset':
      return { ...state, app: structuredClone(SAMPLE_APPLICATION), pendingImport: { doc: null, best: [], formFields: null }, status: { text: '', tone: 'idle' } };

    case 'load':
      return { ...state, app: action.app, pendingImport: { doc: null, best: [], formFields: null }, status: { text: '', tone: 'idle' } };

    default:
      return state;
  }
}

// ---------------------------------------------------------------- store hook

export function usePreflight() {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);

  // Autosave on every edit, debounced through a ref so a fast typist does not
  // serialise the whole application 30 times a second.
  const timer = useRef(null);
  const lastSaved = useRef(null);
  const persist = useCallback((app) => {
    const json = JSON.stringify(app);
    if (json === lastSaved.current) return;
    lastSaved.current = json;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(app), 250);
  }, []);

  persist(state.app);

  // The report is derived, never stored. Recomputing it on every render from the
  // single `app` object is what makes the score impossible to desynchronise from
  // the findings.
  const report = useMemo(() => runRules(state.app), [state.app]);

  const actions = useMemo(() => ({
    edit: (doc, field, value) => dispatch({ type: 'edit', doc, field, value }),
    toggleDoc: (doc) => dispatch({ type: 'toggleDoc', doc }),
    setFilter: (filter) => dispatch({ type: 'filter', filter }),
    setImportDoc: (doc) => dispatch({ type: 'importDoc', doc }),
    setStatus: (status) => dispatch({ type: 'status', status }),
    imported: (doc, pending, status) => dispatch({ type: 'imported', doc, pending, status }),
    clearImport: () => dispatch({ type: 'clearImport' }),
    reset: () => dispatch({ type: 'reset' }),
    load: (app) => dispatch({ type: 'load', app }),
  }), []);

  return { state, report, actions };
}

export { APP_KEY, loadStored, save, cleanFormValue, extractFormFields, SCHENGEN_FIELD_MAP, looksLikeValue, scopeToDocument };