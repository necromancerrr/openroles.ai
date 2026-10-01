// SiteFooter — where the board's other doors are: status, the feeds, the API,
// and the keyboard. Static; no data.

import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="footer">
      <div className="footer__inner">
        <div className="footer__brand">
          <Link href="/" className="wordmark wordmark--sm">
            open<span>roles</span>
          </Link>
          <p>
            Fresh internship and new-grad roles, merged from live public lists, deduped,
            and refreshed hourly. Every filter is a link you can share.
          </p>
        </div>
        <nav className="footer__links" aria-label="More from OpenRoles">
          <Link href="/status">Source status</Link>
          <a href="/feed.xml">RSS feed</a>
          <a href="/api/jobs?limit=20">JSON API</a>
          <a
            href="https://github.com/SimplifyJobs/Summer2027-Internships"
            target="_blank"
            rel="noopener noreferrer"
          >
            Primary source
          </a>
        </nav>
        <p className="footer__keys" aria-label="Keyboard shortcuts">
          <span><kbd>⌘</kbd> <kbd>K</kbd> palette</span>
          <span><kbd>/</kbd> search</span>
          <span><kbd>j</kbd> <kbd>k</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
        </p>
      </div>
    </footer>
  );
}
