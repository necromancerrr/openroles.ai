import assert from 'node:assert/strict';
import test from 'node:test';
import { applyFilters, campusCount, parseFilters } from './filter';
import { clearFiltersHref } from './url';
import type { Job } from './types';

function job(id: string, locations: string[], isRemote = false): Job {
  return {
    id,
    company: 'Example',
    title: 'Software Engineer',
    url: `https://example.com/${id}`,
    canonicalKey: `example.com/${id}`,
    category: 'software',
    type: 'internship',
    typeConf: 'source',
    terms: ['summer_2027'],
    locations,
    locSlugs: locations.map((location) =>
      location.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
    ),
    isRemote,
    initials: 'E',
    search: 'example software engineer',
    datePosted: 1,
    firstSeenAt: 1,
    active: true,
    host: 'example.com',
    source: 'test',
  };
}

test('campus view includes the Seattle corridor and remote roles', () => {
  const jobs = [
    job('seattle', ['Seattle, Washington, USA']),
    job('bellevue', ['Bellevue, Washington, USA']),
    job('remote', ['Remote in USA'], true),
    job('portland', ['Portland, Oregon, USA']),
    job('dc', ['Washington, DC, USA']),
  ];
  const filters = parseFilters({ campus: '1' });

  assert.deepEqual(
    applyFilters(jobs, filters).map(({ id }) => id),
    ['seattle', 'bellevue', 'remote'],
  );
  assert.equal(campusCount(jobs, filters), 3);
});

test('campus view uses the feed\'s own location strings and skips look-alike towns', () => {
  const jobs = [
    // How the feeds actually spell the corridor.
    job('sea', ['Seattle, WA']),
    job('tukwila', ['Tukwila, WA']),
    job('multi', ['NYC', 'Redmond, WA']),
    // Same city names, other states and countries.
    job('bellevue-ne', ['Bellevue, NE']),
    job('kirkland-qc', ['Kirkland, QC, Canada']),
    job('everett-ma', ['Everett, MA']),
    job('auburn-al', ['Auburn, AL']),
    job('vancouver-wa', ['Vancouver, WA']), // Portland metro, not commutable
    // Remote a US student can take, and remote they can't.
    job('us-remote', ['Remote in USA'], true),
    job('bare-remote', ['Remote'], true),
    job('uk-remote', ['Remote in UK'], true),
    job('ca-remote', ['Remote in Canada'], true),
  ];
  assert.deepEqual(
    applyFilters(jobs, parseFilters({ campus: '1' })).map(({ id }) => id),
    ['sea', 'tukwila', 'multi', 'us-remote', 'bare-remote'],
  );
});

test('clearing filters preserves the selected board and density', () => {
  assert.equal(
    clearFiltersHref({
      type: 'new_grad',
      d: 'compact',
      campus: '1',
      q: 'software',
      remote: '1',
      n: '360',
    }),
    '/?type=new_grad&d=compact',
  );
});
