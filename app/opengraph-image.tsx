// The link preview — what a board shared in a group chat looks like. It's the
// board itself in miniature: the newest real postings, each with its baby-blue
// freshness rail, and the live counts, in the Grove & Sky palette. Generated at build and then hourly, from
// the same feed as the page. If the feed can't be read it draws the rails
// alone rather than fail the build over a preview.

import { ImageResponse } from 'next/og';
import { getFeed } from '@/lib/ingest';
import { ageBucket, ageText } from '@/lib/age';

export const alt = 'OpenRoles — fresh internship and new-grad roles, newest first';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const revalidate = 3600;

// The freshness ramp from globals.css: sky settling into earth.
const RAMP = ['#3FA9E5', '#8ECDF0', '#C4E3F4', '#D5D6B8', '#E4E1CC'];

export default async function Image() {
  let rows: { company: string; title: string; age: string; rail: string }[] = [];
  let total = 0;
  let today = 0;
  try {
    const feed = await getFeed();
    const now = Math.floor(Date.now() / 1000);
    total = feed.jobs.length;
    today = feed.jobs.filter((j) => now - j.firstSeenAt < 86400).length;
    rows = feed.jobs.slice(0, 5).map((j) => ({
      company: j.company,
      title: j.title.length > 58 ? `${j.title.slice(0, 57)}…` : j.title,
      age: ageText(j.firstSeenAt, now),
      rail: RAMP[ageBucket(j.firstSeenAt, now)],
    }));
  } catch {
    rows = RAMP.map((rail) => ({ company: '', title: '', age: '', rail }));
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#FEFAE0',
          padding: '64px 72px',
          fontFamily: 'sans-serif',
          color: '#283618',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', width: 520, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', fontSize: 56, fontWeight: 700, letterSpacing: -2 }}>
            open<span style={{ color: '#2F8FCF', fontStyle: 'italic', fontWeight: 400 }}>roles</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', flexDirection: 'column', fontSize: 60, fontWeight: 700, lineHeight: 1.02, letterSpacing: -2.5 }}>
              <span>Catch the opening,</span>
              <span style={{ color: '#2F8FCF', fontStyle: 'italic', fontWeight: 400 }}>not the recap.</span>
            </div>
            <div style={{ display: 'flex', marginTop: 28, fontSize: 24, color: '#4A5530' }}>
              {total > 0
                ? `${total.toLocaleString('en-US')} internship & new-grad roles · ${today.toLocaleString('en-US')} posted today`
                : 'Internship & new-grad roles, newest first'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 56, flex: 1, justifyContent: 'center' }}>
          {rows.map((r, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                background: '#FFFFFF',
                border: '1px solid #E8E4CF',
                borderRadius: 20,
                marginTop: i === 0 ? 0 : 12,
                height: 84,
                boxShadow: '0 8px 24px rgba(40,54,24,0.08)',
                overflow: 'hidden',
              }}
            >
              <div style={{ width: 6, margin: '16px 0', borderRadius: 3, background: r.rail }} />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', flex: 1 }}>
                <div style={{ display: 'flex', fontSize: 20, fontWeight: 700 }}>{r.company}</div>
                <div style={{ display: 'flex', fontSize: 19, color: '#4A5530', marginTop: 4 }}>{r.title}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', paddingRight: 22, fontSize: 17, color: '#1E5F86' }}>
                {r.age}
              </div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
