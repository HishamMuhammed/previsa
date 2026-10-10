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

import { useReducer, useCallback, useMemo, useRef, useEffect } from 'react';
import { runRules } from './lib/rules.js';
import { SAMPLE_APPLICATION } from './lib/sample.js';
import { extractFormFields, SCHENGEN_FIELD_MAP, looksLikeValue } from './lib/formfields.js';
import { scopeToDocument } from './lib/formscope.js';
import { cleanFormValue } from './lib/formvalue.js';

const APP_KEY = 'preflight-application';
const MULTI_KEY = 'preflight-multi';

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

function loadMulti() {
  try {
    const raw = localStorage.getItem(MULTI_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.applicants) || !parsed.applicants.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function save(app) {
  try { localStorage.setItem(APP_KEY, JSON.stringify(app)); } catch { /* quota or private mode */ }
}

function saveMulti(state) {
  try {
    localStorage.setItem(MULTI_KEY, JSON.stringify({
      applicants: state.applicants,
      shared: state.shared,
      selectedId: state.selectedId,
    }));
  } catch { /* quota or private mode */ }
}

// ---------------------------------------------------------------- initial state

function initialState() {
  const stored = loadStored();
  const multi = loadMulti();
  return {
    app: stored ?? structuredClone(SAMPLE_APPLICATION),
    openDocs: new Set(),
    filter: 'all',
    importDoc: 'accommodation',
    pendingImport: { doc: null, best: [], formFields: null },
    status: { text: '', tone: 'idle' },
    multi: {
      applicants: multi?.applicants ?? null,
      shared: multi?.shared ?? null,
      selectedId: multi?.selectedId ?? null,
    },
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

    // Switch to a different applicant in a multi-applicant set.
    //
    // The trip and meta stay shared — a family travelling together has one set of
    // dates, one destination — but each applicant's `docs` are their own. So the
    // saved app is the applicant's docs plus whatever shared values existed when
    // they were last edited, and on load we re-stamp the CURRENT shared values on
    // top. That way editing the trip for one applicant updates it for all of them,
    // which is the behaviour someone travelling together expects.
    case 'switchApplicant': {
      const nextId = action.id;
      const applicants = (state.multi?.applicants ?? []).map((a) =>
        a.id === state.multi?.selectedId ? { ...a, app: state.app } : a,
      );
      const next = applicants.find((a) => a.id === nextId);
      if (!next) return state;
      const shared = state.multi?.shared ?? {};
      const loaded = { ...next.app, trip: { ...(shared.trip ?? next.app.trip) }, meta: { ...(shared.meta ?? next.app.meta) } };
      return {
        ...state,
        app: loaded,
        openDocs: new Set(),
        filter: 'all',
        pendingImport: { doc: null, best: [], formFields: null },
        status: { text: '', tone: 'idle' },
        multi: { ...state.multi, applicants, selectedId: nextId },
      };
    }

    // An edit to the shared trip or meta — the group's dates and destination.
    case 'editShared': {
      const doc = action.doc;   // 'trip' or 'meta'
      const shared = { ...(state.multi?.shared ?? {}) };
      shared[doc] = { ...(shared[doc] ?? state.app[doc]), [action.field]: action.value };
      // Stamp the same value into the live app so the report re-runs immediately.
      const app = { ...state.app, [doc]: { ...state.app[doc], [action.field]: action.value } };
      return { ...state, app, multi: { ...state.multi, shared } };
    }

    // Replace the whole applicants list (used when adding an applicant).
    case 'setApplicants': {
      const applicants = action.applicants;
      const selectedId = applicants.some((a) => a.id === state.multi?.selectedId)
        ? state.multi.selectedId
        : applicants[0]?.id;
      return { ...state, multi: { ...state.multi, applicants, selectedId } };
    }

    case 'setSelected':
      return { ...state, multi: { ...state.multi, selectedId: action.id } };

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

  // Persist the multi-applicant set separately from the single app. The single
  // key stays as-is so an existing solo user's saved application loads exactly as
  // before; multi-applicant data lives under its own key and is ignored entirely
  // when there is no set.
  const multiTimer = useRef(null);
  const lastMulti = useRef(null);
  useEffect(() => {
    if (!state.multi?.applicants) return;
    const json = JSON.stringify(state.multi);
    if (json === lastMulti.current) return;
    lastMulti.current = json;
    if (multiTimer.current) clearTimeout(multiTimer.current);
    multiTimer.current = setTimeout(() => saveMulti(state.multi), 250);
  }, [state.multi]);

  // The report is derived, never stored. Recomputing it on every render from the
  // single `app` object is what makes the score impossible to desynchronise from
  // the findings.
  const report = useMemo(() => runRules(state.app), [state.app]);

  // An edit to the trip or meta is an edit to the SHARED state, because a group
  // travelling together has one set of dates and one destination. Every
  // applicant's app is stamped from the same shared trip on load, so writing it
  // here keeps them in sync without a second copy of the truth.
  const actions = useMemo(() => ({
    edit: (doc, field, value) => {
      if (doc === 'trip' || doc === 'meta') {
        dispatch({ type: 'editShared', doc, field, value });
        return;
      }
      dispatch({ type: 'edit', doc, field, value });
    },
    toggleDoc: (doc) => dispatch({ type: 'toggleDoc', doc }),
    setFilter: (filter) => dispatch({ type: 'filter', filter }),
    setImportDoc: (doc) => dispatch({ type: 'importDoc', doc }),
    setStatus: (status) => dispatch({ type: 'status', status }),
    imported: (doc, pending, status) => dispatch({ type: 'imported', doc, pending, status }),
    clearImport: () => dispatch({ type: 'clearImport' }),
    reset: () => dispatch({ type: 'reset' }),
    load: (app) => dispatch({ type: 'load', app }),
    switchApplicant: (id) => dispatch({ type: 'switchApplicant', id }),
    setApplicants: (applicants) => dispatch({ type: 'setApplicants', applicants }),
    setSelected: (id) => dispatch({ type: 'setSelected', id }),
  }), []);

  return { state, report, actions };
}

export { APP_KEY, loadStored, save, saveMulti, loadMulti, cleanFormValue, extractFormFields, SCHENGEN_FIELD_MAP, looksLikeValue, scopeToDocument };