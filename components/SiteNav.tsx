// SiteNav — the floating glass bar at the top of every page: the wordmark, the
// board's live pulse (passed in, because it reads the feed and the board page
// streams it behind Suspense on a cold start), search, status and theme.
//
// It carries a view-transition name so it holds still while the content under
// it crossfades on a filter change (globals.css, "View transitions").

import Link from 'next/link';
import { PaletteTrigger } from './PaletteTrigger';
import { ThemeToggle } from './ThemeToggle';

export function SiteNav({
  meta,
  current,
}: {
  meta?: React.ReactNode;
  current: 'board' | 'status';
}) {
  return (
    <header className="nav">
      <div className="nav__bar glass">
        <Link href="/" className="wordmark" aria-label="OpenRoles, home">
          open<span>roles</span>
        </Link>
        {meta && <div className="nav__meta">{meta}</div>}
        <div className="nav__actions">
          <PaletteTrigger />
          <Link
            href="/status"
            className="navlink"
            aria-current={current === 'status' ? 'page' : undefined}
          >
            Status
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

// The live pulse: how many roles are on the board and how fresh the check is.
export function LivePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="livepill">
      <span className="livedot" aria-hidden />
      {children}
    </span>
  );
}
