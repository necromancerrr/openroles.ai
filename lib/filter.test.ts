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
