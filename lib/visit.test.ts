import assert from 'node:assert/strict';
import test from 'node:test';
import { parseVisit, sinceFor, visitCookieValue, VISIT_GAP_S } from './visit';

const T = 1_790_000_000;

test('a first visit has no line to draw', () => {
  assert.equal(sinceFor(parseVisit(undefined), T), undefined);
  assert.equal(sinceFor(parseVisit('garbage'), T), undefined);
  assert.equal(visitCookieValue({}, T), `${T}~0`);
});

test('coming back after a gap: new means since the previous visit', () => {
  const v = parseVisit(`${T}~0`);
  const later = T + VISIT_GAP_S + 3600;
  assert.equal(sinceFor(v, later), T);
  assert.equal(visitCookieValue(v, later), `${later}~${T}`);
});

test('within one visit the line stays put while `last` moves forward', () => {
  const start = T + 86400;
  let cookie = visitCookieValue(parseVisit(`${T}~0`), start); // new visit
  for (const step of [60, 600, 1500]) {
    const now = start + step;
    assert.equal(sinceFor(parseVisit(cookie), now), T);
    cookie = visitCookieValue(parseVisit(cookie), now);
  }
});
