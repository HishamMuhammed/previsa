// The cross-document field graph.
//
// Shows which documents make the same claim about a fact and where they disagree.
// An applicant does not think in rules — they think "my hotel booking and my flight
// say different things" — and an edge between two documents says exactly that.
//
// Only 'fail' and 'warn' draw an edge. A passing rule must never paint a field
// red; that was a real bug where R12b, which passes, drew a mismatch line.

const GRAPH_FIELDS = [
  ['fullName', 'Your name'],
  ['passportNo', 'Passport number'],
];

export default function FieldGraph({ app, edges }) {
  const docs = Object.entries(app.docs ?? {});
  if (docs.length < 2) return null;

  // Lay documents out on a circle so edges never overlap into a knot.
  const R = 120;
  const cx = 170;
  const cy = 150;
  const pos = docs.map(([key], i) => {
    const a = (i / docs.length) * Math.PI * 2 - Math.PI / 2;
    return { key, x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R };
  });
  const at = Object.fromEntries(pos.map((p) => [p.key, p]));

  return (
    <section className="panel">
      <h2 className="panel-h">Cross-document field graph</h2>
      <p className="panel-note">
        A line joins two documents that disagree about the same fact. A document with no line
        agrees with everything else.
      </p>
      <svg className="graph" viewBox="0 0 340 300" role="img" aria-label="Cross-document field graph">
        {edges.map((e) => {
          const a = at[e.a];
          const b = at[e.b];
          if (!a || !b) return null;
          return (
            <g key={`${e.a}-${e.b}-${e.id}`}>
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                className={`edge ${e.status}`}
              />
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4} className="edge-id">{e.id}</text>
            </g>
          );
        })}
        {pos.map((p) => {
          const bad = edges.some((e) => e.a === p.key || e.b === p.key);
          return (
            <g key={p.key}>
              <circle cx={p.x} cy={p.y} r={bad ? 7 : 5} className={`node ${bad ? 'bad' : ''}`} />
              <text x={p.x} y={p.y + 19} className="node-label">{p.key}</text>
            </g>
          );
        })}
      </svg>
    </section>
  );
}