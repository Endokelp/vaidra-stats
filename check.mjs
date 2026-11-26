// Run with: node check.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseStats, axisTicks, count, lowerBound, sortLanguages, ago, percentChange, signedPercent, share } from './stats.js';

const sample = JSON.parse(readFileSync(new URL('./sample-stats.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(sample);

assert.equal(parseStats(sample), sample, 'fixture is valid');
assert.equal(lowerBound(60000), '60,000+');
assert.equal(lowerBound(450), '450+');
assert.equal(count(141), '141');

const bad = {
  'null body': null,
  'array body': [],
  'missing section': (() => { const d = clone(); delete d.volunteers; return d; })(),
  'string number': (() => { const d = clone(); d.library.total = '141'; return d; })(),
  'NaN count': (() => { const d = clone(); d.partnerReach.students = NaN; return d; })(),
  'negative count': (() => { const d = clone(); d.volunteers.teachers = -1; return d; })(),
  'null count': (() => { const d = clone(); d.library.courses = null; return d; })(),
  'languages as array': (() => { const d = clone(); d.library.languages = [1, 2]; return d; })(),
  'language value not a count': (() => { const d = clone(); d.library.languages.Hindi = 'many'; return d; })(),
  'partner not a string': (() => { const d = clone(); d.partnerReach.partners = [1]; return d; })(),
  'bad timestamp': (() => { const d = clone(); d.updatedAt = 'yesterday-ish'; return d; })(),
  'empty asOf': (() => { const d = clone(); d.partnerReach.asOf = ''; return d; })(),
};
for (const [name, d] of Object.entries(bad)) assert.throws(() => parseStats(d), /expected shape/, name);

assert.deepEqual(sortLanguages({ Tamil: 16, Hindi: 35, Bengali: 16, Zulu: 0 }),
  [['Hindi', 35], ['Bengali', 16], ['Tamil', 16], ['Zulu', 0]], 'count desc, ties by name');

const now = Date.parse('2026-11-25T18:00:00Z');
const at = (ms) => new Date(now - ms).toISOString();
assert.equal(ago(at(30e3), now), 'just now');
assert.equal(ago(at(-30e3), now), 'just now', 'timestamp slightly ahead of this clock');
assert.equal(ago(at(5 * 60e3), now), '5 minutes ago');
assert.equal(ago(at(3 * 3600e3), now), '3 hours ago');
assert.equal(ago(at(26 * 3600e3), now), 'yesterday');
assert.equal(ago(at(3 * 86400e3), now), '3 days ago');

assert.equal(percentChange(13507, 14306), -6);
assert.equal(percentChange(110, 100), 10);
assert.equal(percentChange(5, 0), null, 'nothing to compare with');
assert.equal(signedPercent(-6), '−6%');
assert.equal(signedPercent(10), '+10%');
assert.equal(signedPercent(0), '0%');
assert.equal(share(11262, 13507), '83%');
assert.equal(share(40, 13507), '<1%');
assert.equal(share(0, 0), '0%');

assert.deepEqual(axisTicks(2715), [0, 1000, 2000, 3000]);
assert.deepEqual(axisTicks(3000), [0, 1000, 2000, 3000], 'max on a step is the top tick');
assert.deepEqual(axisTicks(180), [0, 50, 100, 150, 200]);
assert.deepEqual(axisTicks(0), [0, 1]);

console.log('check.mjs: all assertions passed');
