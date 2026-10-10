// The score header: the headline verdict.
//
// The number is the hero. It is the first thing a judge sees and the one thing an
// applicant remembers, so it gets display type rather than sharing the type scale
// with everything else on the page.

const VERDICT = ({ fail, warn }) => {
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

  return (
    <div className="score-row">
      <div className="score-block">
        <span className="score-label">ready</span>
        <span className={`score-value ${tally.fail === 0 ? 'good' : ''}`}>{score}%</span>
      </div>
      <div className="verdict">
        <p className="verdict-line">{VERDICT(tally)}</p>
        <p className="verdict-sub">
          {tally.fail > 0
            ? 'Fix the red fields on the left, then read the report again.'
            : 'Every check that could run, ran.'}
        </p>
      </div>
      <div className="tally" aria-label={`${tally.fail} failing, ${tally.warn} warnings, ${tally.pass} passing`}>
        <div className={`tally-seg fails ${tally.fail ? 'has' : ''}`} style={{ flexGrow: Math.max(tally.fail, 0.001) }}>
          {tally.fail} failing
        </div>
        <div className={`tally-seg warns ${tally.warn ? 'has' : ''}`} style={{ flexGrow: Math.max(tally.warn, 0.001) }}>
          {tally.warn} warnings
        </div>
        <div className="tally-seg passes" style={{ flexGrow: Math.max(tally.pass, 0.001) }}>
          {tally.pass} passing
        </div>
      </div>
      <span className="sr-only">{decided} checks evaluated.</span>
    </div>
  );
}