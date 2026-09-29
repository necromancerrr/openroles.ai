import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalKey } from './canonical';

const same = (a: string, b: string) => assert.equal(canonicalKey(a), canonicalKey(b));
const different = (a: string, b: string) => assert.notEqual(canonicalKey(a), canonicalKey(b));

// Pairs observed in the live feeds on 2026-09-29: one posting, two URLs.
test('the same posting under two URLs collapses to one key', () => {
  same(
    'https://jobs.lever.co/kitware/e76197d1-4dc3-4f7c-a30a-597713283bb3',
    'https://jobs.lever.co/kitware/e76197d1-4dc3-4f7c-a30a-597713283bb3/apply',
  );
  same(
    'https://generalmotors.wd5.myworkdayjobs.com/Careers_GM/job/Austin-Texas-United-States-of-America/Software-Engineer--Data-Software-Engineering-and-Cloud-Platforms--Early-Careers_JR-202620418',
    'https://generalmotors.wd5.myworkdayjobs.com/en-CA/Careers_GM/job/Austin-Texas-United-States-of-America/Software-Engineer--Data-Software-Engineering-and-Cloud-Platforms--Early-Careers_JR-202620418',
  );
  same(
    'https://jobs.ashbyhq.com/ramp/1b2c3d4e-0000-4000-8000-000000000000/application',
    'https://jobs.ashbyhq.com/ramp/1b2c3d4e-0000-4000-8000-000000000000',
  );
  same(
    'https://jobs.smartrecruiters.com/9to9SoftwareSolutionsLLC/743999677209227-entry-level-software-developer',
    'https://jobs.smartrecruiters.com/9to9SoftwareSolutionsLLC/743999677209227',
  );
  same(
    'https://careers-acme.icims.com/jobs/12345/software-intern/job?mobile=false',
    'https://careers-acme.icims.com/jobs/12345',
  );
});

test('different postings stay different', () => {
  // Same company, same title, different requisitions: two real jobs.
  different(
    'https://caci.wd1.myworkdayjobs.com/external/job/Omaha-NE-US/Software-Engineer-Intern---Summer-2027_332776',
    'https://caci.wd1.myworkdayjobs.com/external/job/Lisle-IL-US/Software-Engineering-Intern---Summer-2027_331742',
  );
  different(
    'https://jobs.smartrecruiters.com/9to9SoftwareSolutionsLLC/743999677209227',
    'https://jobs.smartrecruiters.com/9to9SoftwareSolutionsLLC/743999677188473',
  );
  // gh_jid is the identity of a Greenhouse posting on a company's own domain (§3).
  different(
    'https://www.akunacapital.com/careers?gh_jid=111',
    'https://www.akunacapital.com/careers?gh_jid=222',
  );
});

test('tracking params and fragments never split a posting (§3)', () => {
  same(
    'https://job-boards.greenhouse.io/janestreet/jobs/4512?utm_source=simplify&ref=abc#apply',
    'https://job-boards.greenhouse.io/janestreet/jobs/4512',
  );
});
