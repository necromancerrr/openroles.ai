// CompanyMark — the identity chip at the head of a JobCard (§5.1 support).
// A monogram square, with the real logo painted over it when a logo host is
// configured. Both layers are decorative: the company name sits right next to it
// in text and the card's aria-label already carries it, so this is aria-hidden.
//
// The logo is a CSS background rather than an <img>, which is what makes the
// fallback work without any client JS: a background image that fails to load
// paints nothing, leaving the monogram visible, whereas a broken <img> draws
// Chrome's broken-image icon (verified — <object> fallback content is no more
// reliable). The box is a fixed 28px either way, so nothing reflows when a logo
// resolves late, and because off-screen cards are content-visibility: auto, the
// browser doesn't fetch their logos until they scroll in.

export function CompanyMark({
  initials,
  logoUrl,
}: {
  initials: string;
  logoUrl?: string;
}) {
  return (
    <span className="mark" aria-hidden>
      <span className="mark__mono">{initials}</span>
      {logoUrl && (
        <span
          className="mark__img"
          style={{ backgroundImage: `url("${logoUrl}")` }}
        />
      )}
    </span>
  );
}
