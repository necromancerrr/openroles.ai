// BoardSkeleton — the §5.1 loading treatment, wired up as the Suspense fallback
// for the board. A cold request has to download every listing (~45 MB) before
// it can render a single card; without this the browser shows a blank tab for
// the duration. Cards in the real card's shape, with a slow, low-contrast sheen
// (held still under reduced motion).

const CARDS = 9;

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="gridhead">
        <span className="eyebrow">Loading the board…</span>
      </div>
      <div className="grid">
        {Array.from({ length: CARDS }, (_, i) => (
          <div className="skeleton" key={i}>
            <div className="skeleton__head">
              <span className="skeleton__mark" />
              <span className="bar" style={{ width: '45%' }} />
            </div>
            <span className="bar" style={{ width: '85%' }} />
            <span className="bar" style={{ width: '60%' }} />
            <span className="bar bar--sm" style={{ width: '35%' }} />
          </div>
        ))}
      </div>
    </div>
  );
}
