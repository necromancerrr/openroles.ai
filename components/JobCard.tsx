// JobCard — §5.1. The primary unit; everything else supports it.
// An <a> wrapping an <article>: one link, one tab stop. Never a <div onClick>.
//
// Anatomy, top to bottom: the company (mark, name, category · term) with the
// posting's age on the right; the title, two lines at most; the facts a source
// stated — pay in tan, sponsorship in olive (sponsors) or rust (won't), remote;
// and the place. The freshness rail runs down the leading edge in baby blue
// and settles into earth tones as the posting ages (globals.css). Cards are
// solid, not glass: this is the surface people read, so it gets the contrast.

import type { Job } from '@/lib/types';
import { CATEGORY_LABELS, SPONSORSHIP_LABEL, primaryTerm, termLabel } from '@/lib/taxonomy';
import { ageBucket, ageText, isNew, isoDate } from '@/lib/age';
import { CompanyMark } from './CompanyMark';

export function JobCard({
  job,
  now,
  density = 'comfortable',
  showType = false,
}: {
  job: Job;
  now: number;
  density?: 'comfortable' | 'compact';
  showType?: boolean;
}) {
  const bucket = ageBucket(job.firstSeenAt, now);
  const unclassified = job.type === 'unknown';
  // The soonest term still open to apply to, not whichever the source listed
  // first — a Summer 2026 / Fall 2026 posting reads Fall 2026 once summer starts.
  const term = primaryTerm(job.terms, new Date(now * 1000));
  const fresh = job.active && isNew(bucket);

  const [firstLoc, ...rest] = job.locations;
  const moreCount = rest.length;

  const cls = [
    'card',
    unclassified ? 'card--unclassified' : '',
    !job.active ? 'card--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // §5.1 screen-reader announcement, with pay and sponsorship when stated.
  const srLabel = [
    job.title,
    job.company,
    `${firstLoc}${moreCount ? ` and ${moreCount} more` : ''}`,
    job.pay ? `pays ${job.pay.replace('/hr', ' an hour').replace('/yr', ' a year').replace('/mo', ' a month').replace('/wk', ' a week')}` : '',
    job.sponsorship ? SPONSORSHIP_LABEL[job.sponsorship] : '',
    `posted ${ageText(job.firstSeenAt, now)}`,
  ]
    .filter(Boolean)
    .join(', ');

  const eyebrow = [
    unclassified ? 'Unclassified' : CATEGORY_LABELS[job.category],
    !unclassified && term ? termLabel(term) : '',
    showType ? job.type.replace('_', ' ') : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const hasFacts = Boolean(job.pay || job.sponsorship || job.isRemote);

  // The rail token comes off `data-age` in CSS rather than an inline custom
  // property: one stylesheet rule instead of a style attribute per card.
  // `data-key` is how the reader's own "opened" memory finds this card
  // (components/BoardMemory.tsx) — the canonical key is stable across feeds
  // and refreshes, where a source's id isn't.
  return (
    <a
      className={cls}
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      data-age={bucket}
      data-key={job.canonicalKey}
      aria-label={`${srLabel}. Opens the application in a new tab.`}
    >
      <article>
        <div className="card__head" aria-hidden>
          <CompanyMark initials={job.initials} logoUrl={job.logoUrl} />
          <div className="card__headtext">
            <div className="card__company">{job.company}</div>
            {density === 'comfortable' && <div className="card__eyebrow">{eyebrow}</div>}
          </div>
          <span className="card__age">
            {fresh && <span className="card__dot" />}
            <time dateTime={isoDate(job.firstSeenAt)}>{ageText(job.firstSeenAt, now)}</time>
          </span>
        </div>

        <h3 className="card__title" aria-hidden>
          {job.title}
        </h3>

        {hasFacts && (
          <div className="card__facts" aria-hidden>
            {job.pay && <span className="tag tag--pay">{job.pay}</span>}
            {job.sponsorship && (
              <span className={`tag tag--${job.sponsorship === 'offers' ? 'good' : 'caution'}`}>
                {SPONSORSHIP_LABEL[job.sponsorship]}
              </span>
            )}
            {job.isRemote && <span className="tag">Remote</span>}
          </div>
        )}

        <div className="card__foot" aria-hidden>
          <span className="card__loc">
            <svg viewBox="0 0 24 24" className="card__pin">
              <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
              <circle cx="12" cy="10" r="2.3" />
            </svg>
            <span className="card__loctext">{firstLoc}</span>
            {moreCount > 0 && <span className="more">+{moreCount}</span>}
          </span>
          <span className="card__status">
            <span className="card__opened">Opened</span>
            {fresh && <span className="card__new">New</span>}
            <span className="card__go">
              <svg viewBox="0 0 24 24">
                <path d="M7 17 17 7M9 7h8v8" />
              </svg>
            </span>
          </span>
        </div>
      </article>
    </a>
  );
}
