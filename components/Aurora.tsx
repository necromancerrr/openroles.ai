// Aurora — the light behind the glass. Frosted surfaces only read as glass when
// there's something soft and colored behind them, so the page sits on three
// slow-drifting washes in the palette (cream, baby blue and olive by day;
// olive, sky and ember by night) and a whisper of grain. Fixed, behind everything,
// aria-hidden, and it only ever animates transform. Reduced motion holds it
// still (globals.css).

export function Aurora() {
  return (
    <div className="aurora" aria-hidden>
      <span className="aurora__blob aurora__blob--a" />
      <span className="aurora__blob aurora__blob--b" />
      <span className="aurora__blob aurora__blob--c" />
      <span className="aurora__grain" />
    </div>
  );
}
