// JobCard — §5.1. The primary unit; everything else supports it.
// An <a> wrapping an <article>: one link, one tab stop. Never a <div onClick>.

import type { Job } from '@/lib/types';
import { CATEGORY_LABELS, TERM_LABELS } from '@/lib/taxonomy';
import { ageBucket, ageText, isNew, isoDate, RAIL_TOKEN } from '@/lib/age';

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
  const railColor = job.active ? RAIL_TOKEN[bucket] : RAIL_TOKEN[4];
  const unclassified = job.type === 'unknown';

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

  return (
    <a
      className={cls}
      href={job.url}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ['--rail-color' as string]: railColor }}
      aria-label={srLabel}
    >
      <article>
        {density === 'comfortable' && (
          <div className="card__eyebrow" aria-hidden>
            <span className="eyebrow">
              {unclassified ? 'UNCLASSIFIED' : CATEGORY_LABELS[job.category]}
            </span>
            {!unclassified && job.terms[0] !== 'unspecified' && (
              <span className="eyebrow">· {TERM_LABELS[job.terms[0]]}</span>
            )}
            {showType && (
              <span className="eyebrow">· {job.type.replace('_', ' ')}</span>
            )}
          </div>
        )}

        <div className="card__company" aria-hidden>
          {job.company}
        </div>
        <h3 className="card__title" aria-hidden>
          {job.title}
        </h3>

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
