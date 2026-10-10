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

// The three grades of authority. Shown as a badge because the difference matters:
// a regulation is verifiable law, guidance is what consulates actually do, and a
// consistency finding has no external authority at all. Collapsing those three
// into one grey "source:" line is what made the old field ignorable.
const KIND_WORD = { regulation: 'regulation', guidance: 'consular practice', consistency: 'internal' };

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
                {/* The authority. A finding the reader cannot check is a finding they
                    have to take on trust, and this tool's whole argument is that it is
                    auditable — so the source line is the load-bearing part, not a
                    footnote. Regulations link to the official text; guidance and
                    consistency findings do not pretend to have one. */}
                <div className="src">
                  <span className={`src-kind k-${f.authority?.kind ?? 'consistency'}`}>
                    {KIND_WORD[f.authority?.kind ?? 'consistency']}
                  </span>
                  <span className="src-cite">{f.source}</span>
                  {f.authority?.link && (
                    <a className="src-link" href={f.authority.link} target="_blank" rel="noreferrer noopener">
                      official text ↗
                    </a>
                  )}
                </div>
                {f.authority?.note && <div className="src-note">{f.authority.note}</div>}
              </div>
            ))}
          </div>
        ))
      )}
    </section>
  );
}