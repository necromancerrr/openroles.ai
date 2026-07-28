// BoardSkeleton — the §5.1 loading treatment, wired up as the Suspense fallback
// for the board. A cold request has to download both listings.json (~23 MB)
// before it can render a single card; without this the browser shows a blank tab
// for the duration. Three rules at 40% / 70% / 55% width, no shimmer — the spec
// is explicit that a loading state shouldn't animate for attention.

const CARDS = 9;
const BARS = ['40%', '70%', '55%'];

export function BoardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="gridhead">
        <span className="eyebrow">loading the board…</span>
      </div>
      <div className="grid">
        {Array.from({ length: CARDS }, (_, i) => (
          <div className="skeleton" key={i}>
            {BARS.map((w) => (
              <div className="bar" key={w} style={{ width: w }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
