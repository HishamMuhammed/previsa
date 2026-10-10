// The Preflight report: every finding, filterable, each naming the rule that
// produced it.
//
// A compliance tool that says "something might be wrong" is worse than useless, so
// every finding renders its id, status, a detail that states the actual numbers
// involved, and a fix the applicant can act on. The `source` line is not
// decoration either: it is what lets someone check the claim against the actual
// regulation instead of trusting the tool.

import { useMemo } from 'react';

const STATUS_WORD = { fail: 'fail', warn: 'warning', pass: 'pass', na: 'not checked' };

export default function ReportPanel({ report, filter, onFilter }) {
  const shown = useMemo(
    () => report.findings.filter((f) => filter === 'all' || f.status === filter),
    [report, filter],
  );

  const grouped = useMemo(() => {
    const cats = new Map();
    for (const f of shown) {
      const cat = report.rules.find((r) => r.id === f.id.split('b')[0])?.category ?? f.id;
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat).push(f);
    }
    return [...cats.entries()];
  }, [shown, report]);

  const { fail, warn, pass, na } = report.tally;

  return (
    <section className="panel">
      <h2 className="panel-h">Preflight report</h2>
      <p className="panel-note">Every finding names the rule that produced it, so you can check it yourself.</p>

      <div className="filters" role="group" aria-label="Filter findings">
        {[
          ['all', 'All', report.findings.length],
          ['fail', 'Failing', fail],
          ['warn', 'Warnings', warn],
          ['pass', 'Passing', pass],
          ['na', 'Not checked', na],
        ].map(([key, label, n]) => (
          <button
            key={key}
            type="button"
            data-f={key}
            className={`fbtn ${filter === key ? 'is-on' : ''}`}
            aria-pressed={filter === key}
            onClick={() => onFilter(key)}
          >
            {label} <span className="n">{n}</span>
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <div className="item na"><div className="item-h"><span className="item-t">Nothing in this category.</span></div></div>
      ) : (
        grouped.map(([cat, items]) => (
          <div key={cat}>
            <div className="cat">{cat}</div>
            {items.map((f) => (
              <div key={f.id} className={`item ${f.status}`}>
                <div className="item-h">
                  <span className="rid">{f.id}</span>
                  <span className="item-t">{f.title}</span>
                  <span className={`st ${f.status}`}>{STATUS_WORD[f.status]}</span>
                </div>
                <p>{f.detail}</p>
                {f.fix ? <div className="fix">{f.fix}</div> : null}
                <div className="src">source: {f.source}</div>
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}