// Pure helpers, kept apart from the DOM code so check.mjs can run them in Node.
const nf = new Intl.NumberFormat('en-US');
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const isCount = (n) => Number.isInteger(n) && n >= 0;

export const count = (n) => nf.format(n);
// students and schools are lower bounds, so they always carry a plus.
export const lowerBound = (n) => `${nf.format(n)}+`;

// Throws on anything but the documented shape, so a bad response becomes the error state, never zeros.
export function parseStats(d) {
  const r = d?.partnerReach;
  const l = d?.library;
  const v = d?.volunteers;
  const ok =
    isCount(r?.students) && isCount(r?.schools) &&
    typeof r?.asOf === 'string' && r.asOf !== '' &&
    Array.isArray(r?.partners) && r.partners.every((p) => typeof p === 'string') &&
    isCount(l?.total) && isCount(l?.courses) && isCount(l?.audiobooks) && isCount(l?.researchPapers) &&
    l?.languages && typeof l.languages === 'object' && !Array.isArray(l.languages) &&
    Object.values(l.languages).every(isCount) &&
    isCount(v?.total) && isCount(v?.teachers) && isCount(v?.speakers) &&
    typeof d.updatedAt === 'string' && !Number.isNaN(Date.parse(d.updatedAt));
  if (!ok) throw new Error('The response is not in the expected shape.');
  return d;
}

const isTime = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isTotals = (t) => isCount(t?.visitors) && isCount(t?.pageviews);
// Breakdown keys, as Vercel's Web Analytics API names its dimensions.
const DIMENSIONS = ['requestPath', 'referrerHostname', 'country', 'deviceType', 'osName'];

export function parseTraffic(d) {
  const ok =
    d &&
    isTime(d.since) && isTime(d.until) &&
    isTotals(d.total) && isTotals(d.previous) &&
    Array.isArray(d.hourly) && d.hourly.length > 1 &&
    d.hourly.every((h) => isTime(h?.timestamp) && isTotals(h)) &&
    DIMENSIONS.every((k) => Array.isArray(d[k]) && d[k].every((r) => typeof r?.[k] === 'string' && r[k] !== '' && isTotals(r))) &&
    d.country.every((r) => /^[A-Z]{2}$/.test(r.country));
  if (!ok) throw new Error('The response is not in the expected shape.');
  return d;
}

// Whole-percent change from the previous period, or null when there is nothing to compare with.
export const percentChange = (now, before) => (before ? Math.round(((now - before) / before) * 100) : null);
export const signedPercent = (n) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`;

export function share(n, total) {
  const p = total ? Math.round((n / total) * 100) : 0;
  return p === 0 && n > 0 ? '<1%' : `${p}%`;
}

// Gridline values from 0 to the first round step at or above max: 1, 2 or 5 times a power of ten.
export function axisTicks(max) {
  const raw = Math.max(max, 4) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw);
  const ticks = [0];
  while (ticks.at(-1) < max || ticks.length < 2) ticks.push(ticks.at(-1) + step);
  return ticks;
}

export const sortLanguages = (langs) =>
  Object.entries(langs).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

export function ago(iso, now = Date.now()) {
  const s = Math.floor((now - Date.parse(iso)) / 1000);
  if (s < 60) return 'just now'; // also covers a timestamp slightly ahead of this clock
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return rtf.format(-Math.floor(s / 3600), 'hour');
  return rtf.format(-Math.floor(s / 86400), 'day');
}
