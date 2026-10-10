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
  const rows = useMemo(() => fixRows(report.findings, app, onEdit), [report, app, onEdit]);
  const edges = useMemo(() => graphEdges(report.findings, app), [report, app]);
  const blocking = rows.filter((r) => r.status === 'fail').length;

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

              <FixList rows={rows} blocking={blocking} />

              {Object.entries(app.docs).map(([key, doc]) => (
                <DocPanel
                  key={key}
                  docKey={key}
                  doc={doc}
                  isOpen={openDocs.has(key)}
                  badFields={badFields.get(key) ?? new Set()}
                  failCount={failCounts.get(key) ?? 0}
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