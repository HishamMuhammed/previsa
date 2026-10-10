import { useMemo, useCallback, useEffect, useRef, useState } from 'react';
import { usePreflight } from './store.js';
import { useTheme } from './useTheme.js';
import { badFieldsByDoc, failCountByDoc, fixRows, graphEdges } from './derive.js';
import ScoreHeader from './components/ScoreHeader.jsx';
import DocPanel from './components/DocPanel.jsx';
import ReportPanel from './components/ReportPanel.jsx';
import FixList from './components/FixList.jsx';
import FieldGraph from './components/FieldGraph.jsx';
import PdfImport from './components/PdfImport.jsx';

const THEME_WORD = { auto: 'Auto', light: 'Light', dark: 'Dark' };

export default function App() {
  const { state, report, actions } = usePreflight();
  const { choice, cycle } = useTheme();
  const [dragOver, setDragOver] = useState(false);
  const loadRef = useRef(null);

  const { app, openDocs, filter } = state;

  const badFields = useMemo(() => badFieldsByDoc(report.findings, app), [report, app]);
  const failCounts = useMemo(() => failCountByDoc(report.findings, app), [report, app]);
  const onEdit = useCallback((doc, field, value) => actions.edit(doc, field, value), [actions]);
  const rows = useMemo(() => fixRows(report.findings, app), [report, app]);
  const edges = useMemo(() => graphEdges(report.findings, app), [report, app]);
  const blocking = rows.filter((r) => r.status === 'fail').length;

  // The field the fix list is pointing at, so the document panel can open it,
  // scroll to it and highlight it. Held here rather than in the panel because both
  // the list and the panel need to agree on it.
  const [highlight, setHighlight] = useState(null);

  const goToField = useCallback((doc, field) => {
    // Open the panel FIRST: scrolling to an input inside a collapsed document
    // scrolls to a zero-height box and looks like nothing happened.
    if (!openDocs.has(doc)) actions.toggleDoc(doc);
    setHighlight({ doc, field });
  }, [openDocs, actions]);

  // Scroll and focus once the panel is actually open and the input exists.
  //
  // Order matters and was determined by measuring, not reasoning:
  //
  //   1. focus({preventScroll:true}) FIRST, because content-visibility:hidden
  //      (the collapse mechanism) makes a hidden subtree report a zero-height box,
  //      so scrollIntoView on a just-collapsed field scrolls nowhere. Focusing
  //      first forces the element to be laid out, and only then does it have a real
  //      position to scroll to.
  //   2. scrollIntoView WITHOUT preventScroll on the focus call, or the browser
  //      treats the whole jump as a no-op and the page never moves.
  //
  // behavior is 'instant', not 'smooth'. Smooth scrolling is unreliable here:
  // measured on the deployed build, the smooth scroll never started at all — the
  // page stayed at scrollY 0 with the target frozen 1856px down the viewport,
  // while the identical call with 'instant' scrolled correctly to 1557 and
  // centred the field. The jump is a correction, not a flourish, and a correction
  // that silently fails is worse than one that appears abruptly.
  //
  // The click handler alone is not enough: React commits the panel-open and the
  // highlight together, so anything run synchronously in the handler measures the
  // panel before it has its height. An effect runs after commit.
  useEffect(() => {
    if (!highlight) return;
    const input = document.getElementById(`i-${highlight.doc}-${highlight.field}`);
    if (!input) return;
    input.focus({ preventScroll: true });
    input.scrollIntoView({ behavior: 'instant', block: 'center' });
  }, [highlight, openDocs]);

  // Open the documents that have problems on first load, so the applicant never
  // has to hunt for a red field hidden inside a collapsed panel.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !report.findings.length) return;
    seeded.current = true;
    const open = new Set(['passport']);
    for (const f of report.findings) {
      if (f.status !== 'fail' && f.status !== 'warn') continue;
      for (const [doc] of badFields) open.add(doc);
    }
    for (const d of open) actions.toggleDoc(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function downloadApp() {
    const blob = new Blob([JSON.stringify(app, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'preflight-application.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function onLoadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed?.docs || !parsed?.trip) throw new Error('shape');
        actions.load(parsed);
        actions.setStatus({ text: `Loaded ${file.name}. Every check has re-run.`, tone: 'good' });
      } catch {
        actions.setStatus({ text: 'That file is not a Preflight export — it needs "docs" and "trip".', tone: 'bad' });
      }
    };
    reader.readAsText(file);
  }

  return (
    <div id="app" onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
         onDragLeave={() => setDragOver(false)}
         onDrop={(e) => { e.preventDefault(); setDragOver(false); }}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">✓</span>
          <span className="brand-text">
            <strong>Preflight</strong>
            <span className="brand-sub">visa application pre-flight checker</span>
          </span>
        </div>
        <div className="topbar-right">
          <span className="chip">{app.meta?.applicant ?? ''}</span>
          <span className="chip">{app.meta?.destination ?? ''}</span>
          {/* meta.dateNote is a full sentence explaining the DD/MM/YYYY reading, not
              a date. It belongs in the page as prose; putting it in a chip made the
              header one long overflowing line. */}
          <button className="chip chip-btn" type="button" onClick={cycle} aria-label={`Theme: ${THEME_WORD[choice]}`}>
            ◐ {THEME_WORD[choice]}
          </button>
        </div>
      </header>

      <main className="sheet">
        <ScoreHeader report={report} />

        <div className="cols">
          <div className="col col-docs">
            <section className="panel">
              <h2 className="panel-h">Application documents</h2>
              <p className="panel-note">Click any value to edit it. Every check re-runs as you type.</p>

              <FixList rows={rows} blocking={blocking} onGoTo={goToField} />

              {Object.entries(app.docs).map(([key, doc]) => (
                <DocPanel
                  key={key}
                  docKey={key}
                  doc={doc}
                  isOpen={openDocs.has(key)}
                  badFields={badFields.get(key) ?? new Set()}
                  failCount={failCounts.get(key) ?? 0}
                  highlight={highlight}
                  onToggle={actions.toggleDoc}
                  onEdit={onEdit}
                />
              ))}

              <div className="file-row">
                <button className="btn btn-quiet" type="button" onClick={() => loadRef.current?.click()}>Open…</button>
                <button className="btn btn-quiet" type="button" onClick={downloadApp}>Save a copy</button>
                <button className="btn btn-quiet" type="button" onClick={actions.reset}>Reset to the sample</button>
                <input ref={loadRef} type="file" id="file-load" accept="application/json,.json" hidden onChange={onLoadFile} />
              </div>
            </section>
          </div>

          <div className="col col-report">
            <ReportPanel report={report} filter={filter} onFilter={actions.setFilter} />
          </div>
        </div>

        <div className="cols">
          <div className="col">
            <PdfImport state={state} report={report} actions={actions} />
          </div>
          <div className="col">
            <FieldGraph app={app} edges={edges} />
          </div>
        </div>

        <footer className="foot">
          {/* meta.dateNote explains how slash-form dates are being read. It is a
              sentence, not a date, so it lives here as prose rather than in the
              header where it made the bar overflow. */}
          <p className="foot-note">{app.meta?.dateNote}</p>
          <p>
            Preflight checks internal consistency. It does not predict a visa decision, and a clean
            report is not a guarantee of one. Documents never leave this page.
          </p>
        </footer>
      </main>
    </div>
  );
}