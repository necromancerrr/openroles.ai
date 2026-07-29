// JobCard — §5.1. The primary unit; everything else supports it.
// An <a> wrapping an <article>: one link, one tab stop. Never a <div onClick>.

import type { Job } from '@/lib/types';
import { CATEGORY_LABELS, primaryTerm, termLabel } from '@/lib/taxonomy';
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

  const [firstLoc, ...rest] = job.locations;
  const moreCount = rest.length;

  const cls = [
    'card',
    unclassified ? 'card--unclassified' : '',
    !job.active ? 'card--inactive' : '',
  ]
    .filter(Boolean)
    .join(' ');

  // §5.1 screen-reader announcement.
  const srLabel = `${job.title}, ${job.company}, ${firstLoc}${
    moreCount ? ` and ${moreCount} more` : ''
  }, posted ${ageText(job.firstSeenAt, now)}, link.`;

  // The rail token comes off `data-age` in CSS rather than an inline custom
  // property: one stylesheet rule instead of a style attribute per card.
  return (
    <a
      className={cls}
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      data-age={bucket}
      aria-label={srLabel}
    >
      <article>
        {density === 'comfortable' && (
          <div className="card__eyebrow" aria-hidden>
            <span className="eyebrow">
              {unclassified ? 'UNCLASSIFIED' : CATEGORY_LABELS[job.category]}
            </span>
            {!unclassified && term && (
              <span className="eyebrow">· {termLabel(term)}</span>
            )}
            {showType && (
              <span className="eyebrow">· {job.type.replace('_', ' ')}</span>
            )}
          </div>
        )}

        <div className="card__head">
          <CompanyMark initials={job.initials} logoUrl={job.logoUrl} />
          <div className="card__headtext">
            <div className="card__company" aria-hidden>
              {job.company}
            </div>
            <h3 className="card__title" aria-hidden>
              {job.title}
            </h3>
          </div>
        </div>

        <div className="card__foot">
          <span className="card__loc" aria-hidden>
            {firstLoc}
            {moreCount > 0 && <span className="more"> +{moreCount}</span>}
          </span>
          <span className="card__age">
            {job.isRemote && <span className="card__remote" aria-hidden>REMOTE</span>}
            {job.active && isNew(bucket) && (
              <span className="card__new" aria-hidden>NEW</span>
            )}
            <time dateTime={isoDate(job.firstSeenAt)} aria-hidden>
              {ageText(job.firstSeenAt, now)}
            </time>
          </span>
        </div>
      </article>
    </a>
  );
}
