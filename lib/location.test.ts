import assert from 'node:assert/strict';
import test from 'node:test';
import { aliasLocation, normalizeLocation } from './location';

// Every input below is a real string from a live feed on 2026-09-29.
const cases: [string, string[]][] = [
  // Full state names, trailing countries, odd casing.
  ['San Jose, California, United States of America', ['San Jose, CA']],
  ['Seattle, Washington, United States of America', ['Seattle, WA']],
  ['cedar rapids, Iowa, United States of America', ['Cedar Rapids, IA']],
  ['Austin, TEXAS, United States', ['Austin, TX']],
  ['Savannah, GA, US', ['Savannah, GA']],
  ['Birmingham, AL, USA', ['Birmingham, AL']],
  ['Mount Laurel, New Jersey', ['Mount Laurel, NJ']],
  ['McLean, VA', ['McLean, VA']],
  // Collapse into the feed's own abbreviations.
  ['New York, New York, United States', ['NYC']],
  ['New York, NY, United States', ['NYC']],
  ['New York City', ['NYC']],
  ['New York', ['NYC']],
  ['San Francisco, CA', ['SF']],
  ['Los Angeles, CA', ['LA']],
  ['Washington, DC', ['Washington, DC']],
  // Country-state-city orderings, and the one where "LA" is Louisiana.
  ['United States - California - Foster City', ['Foster City, CA']],
  ['USA - New York - Malta', ['Malta, NY']],
  ['USA LA Bossier City', ['Bossier City, LA']],
  ['US-IA-CEDAR RAPIDS-131 ~ 5450 C Ave NE ~ BLDG 131', ['Cedar Rapids, IA']],
  // No comma.
  ['Rosemont IL', ['Rosemont, IL']],
  ['Atlanta GA', ['Atlanta, GA']],
  // Street addresses and postal codes.
  ['420 National Business Parkway, Jessup, MD', ['Jessup, MD']],
  ['Calgary, AB, CA, T2C 5N1', ['Calgary, AB, Canada']],
  ['Edmonton, AB, CA, AB T6P', ['Edmonton, AB, Canada']],
  ['Toronto, Ontario, Canada', ['Toronto, ON, Canada']],
  ['London, England, United Kingdom', ['London, UK']],
  // Several places in one field.
  ['Addison, TX; Montpelier, VT', ['Addison, TX', 'Montpelier, VT']],
  // Remote, with and without a country, with and without a place.
  ['Remote (US)', ['Remote in USA']],
  ['United States - Remote', ['Remote in USA']],
  ['Remote, U.S.', ['Remote in USA']],
  ['Anywhere in the US', ['Remote in USA']],
  ['Remote', ['Remote']],
  ['Seattle, WA (Remote)', ['Remote in USA', 'Seattle, WA']],
  ['Remote in Canada', ['Remote in Canada']],
  // Countries alone, and a bare state (the feed writes these too).
  ['United States', ['United States']],
  ['California', ['California']],
  // Country first, qualifiers, bullets, bare codes, dotted DC, metro with no state.
  ['US, CA, Santa Clara', ['Santa Clara, CA']],
  ['US, Santa Clara, CA', ['Santa Clara, CA']],
  ['San Francisco, CA • New York, NY', ['SF', 'NYC']],
  ['Hybrid - San Francisco, CA', ['SF']],
  ['Dallas, TX - Headquarters', ['Dallas, TX']],
  ['US - Huntsville, AL', ['Huntsville, AL']],
  ['Cambridge, MA USA', ['Cambridge, MA']],
  ['Bala Cynwyd (Philadelphia Area), Pennsylvania, United States', ['Bala Cynwyd, PA']],
  ['Washington, D.C.', ['Washington, DC']],
  ['Chicago, United States', ['Chicago, IL']],
  ['VA', ['Virginia']],
  ['LA', ['LA']],
  ['Greater Seattle Area; Space Coast, FL; Denver, CO', ['Seattle, WA', 'Space Coast, FL', 'Denver, CO']],
  ['Cambridge, MA +1', ['Cambridge, MA']],
  ['Wilmington NC USA', ['Wilmington, NC']],
  ['Boise, ID - Main Site', ['Boise, ID']],
  // Unknown shapes come back trimmed, never guessed at.
  ['Bengaluru, Karnataka, India', ['Bengaluru, Karnataka, India']],
  ['  ', []],
];

for (const [input, expected] of cases) {
  test(`normalizeLocation(${JSON.stringify(input)})`, () => {
    assert.deepEqual(normalizeLocation(input), expected);
  });
}

test('aliasLocation collapses the feed\'s own spelling variants and nothing else', () => {
  assert.equal(aliasLocation('New York, NY'), 'NYC');
  assert.equal(aliasLocation('New York City, NY'), 'NYC');
  assert.equal(aliasLocation('San Francisco, CA'), 'SF');
  assert.equal(aliasLocation('Arlington County, Arlington, VA'), 'Arlington County, Arlington, VA');
  assert.equal(aliasLocation('Seattle, WA'), 'Seattle, WA');
});
