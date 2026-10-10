// The score header: the headline verdict.
//
// The number is the hero. It is the first thing a judge sees and the one thing an
// applicant remembers, so it gets display type rather than sharing the type scale
// with everything else on the page.

const VERDICT = ({ fail, warn, na }) => {
  if (na > 0) {
    // Stated before the failure count on purpose. "3 errors" sounds like a
    // near-miss when 12 checks never ran; the honest headline is that the report
    // is incomplete, and R00 now names the absent documents that caused it.
    return `${na} check${na === 1 ? '' : 's'} could not run — the report is incomplete.`;
  }
  if (fail > 0) {
    return `${fail} error${fail === 1 ? '' : 's'} will block this application.`;
  }
  if (warn > 0) {
    return `${warn} thing${warn === 1 ? '' : 's'} to check before you submit.`;
  }
  return 'Nothing blocking found. Read the report anyway.';
};

export default function ScoreHeader({ report }) {
  const { score, tally } = report;
  const decided = tally.pass + tally.fail + tally.warn;

  // aria-live because the score is the one thing that changes on every keystroke.
  // Without it a screen reader user gets no announcement when it moves 80% -> 75%,
  // which is the entire feedback loop of the app.
  return (
    <div
      className="score-row"
      role="status"
      aria-live="polite"
      aria-label={`Readiness ${score} percent. ${tally.fail} failing, ${tally.warn} warnings, ${tally.pass} passing, ${tally.na} not checked.`}
    >
      <div className="score-block">
        <span className="score-label">ready</span>
        <span className={`score-value ${tally.fail === 0 ? 'good' : ''}`}>{score}%</span>
      </div>
      <div className="verdict">
        <p className="verdict-line">{VERDICT(tally)}</p>
        <p className="verdict-sub">
          {tally.na > 0
            ? 'Some checks need documents that are not in the file yet. Filter the report by “Not checked” to see which.'
            : tally.fail > 0
              ? 'Fix the red fields on the left, then read the report again.'
              : 'Every check that could run, ran.'}
        </p>
      </div>
      <div className="tally" aria-hidden="true">
        <div className={`tally-seg fails ${tally.fail ? 'has' : ''}`} style={{ flexGrow: Math.max(tally.fail, 0.001) }}>
          {tally.fail} failing
        </div>
        <div className={`tally-seg warns ${tally.warn ? 'has' : ''}`} style={{ flexGrow: Math.max(tally.warn, 0.001) }}>
          {tally.warn} warnings
        </div>
        <div className={`tally-seg passes ${tally.na ? 'is-slim' : ''}`} style={{ flexGrow: Math.max(tally.pass, 0.001) }}>
          {tally.pass} passing
        </div>
        {/* Shown only when there is something to show. A permanent "0 not checked"
            segment would train the eye to ignore it, which defeats the point. */}
        {tally.na > 0 && (
          <div className="tally-seg skipped has" style={{ flexGrow: Math.max(tally.na, 0.001) }}>
            {tally.na} not checked
          </div>
        )}
      </div>
      <span className="sr-only">{decided} checks evaluated.</span>
    </div>
  );
}