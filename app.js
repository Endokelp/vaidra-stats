import { parseStats, parseTraffic, axisTicks, count, lowerBound, sortLanguages, ago, percentChange, signedPercent, share } from './stats.js';

const API = 'https://www.vaidra.org/api/stats';
const VERCEL_ANALYTICS_API = 'https://www.vaidra.org/api/analytics/vercel';
const REFRESH_MS = 5 * 60 * 1000; // both endpoints

const $ = (id) => document.getElementById(id);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const svgEl = (tag, attrs) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
};

const fields = {
  students: (d) => lowerBound(d.partnerReach.students),
  schools: (d) => lowerBound(d.partnerReach.schools),
  asOf: (d) => d.partnerReach.asOf,
  total: (d) => count(d.library.total),
  courses: (d) => count(d.library.courses),
  audiobooks: (d) => count(d.library.audiobooks),
  researchPapers: (d) => count(d.library.researchPapers),
  volTotal: (d) => count(d.volunteers.total),
  teachers: (d) => count(d.volunteers.teachers),
  speakers: (d) => count(d.volunteers.speakers),
};

let current = null;

function render(d) {
  for (const node of document.querySelectorAll('[data-f]')) node.textContent = fields[node.dataset.f](d);

  $('partners').replaceChildren(...d.partnerReach.partners.map((name) => el('li', '', name)));

  const rows = sortLanguages(d.library.languages);
  const max = Math.max(1, ...rows.map(([, n]) => n));
  $('languages').replaceChildren(...rows.map(([name, n]) => {
    const fill = el('span', 'fill');
    fill.style.setProperty('--w', `${(n / max) * 100}%`);
    const bar = el('span', 'bar');
    bar.setAttribute('aria-hidden', 'true');
    bar.append(fill);
    const li = el('li');
    li.append(el('span', '', name), bar, el('span', 'count', count(n)));
    return li;
  }));
  $('langs').hidden = rows.length === 0;

  const time = $('updated-time');
  time.dateTime = d.updatedAt;
  time.title = new Date(d.updatedAt).toLocaleString();
  showUpdated();
}

function showUpdated() {
  if (current) $('updated-time').textContent = ago(current.updatedAt);
}

function setState(state) {
  $('loading').hidden = state !== 'loading';
  $('error').hidden = state !== 'error';
  $('data').hidden = state !== 'ready';
  $('updated').hidden = state !== 'ready';
}

const reason = (err) =>
  err.name === 'TimeoutError' ? 'The request timed out.'
    : err instanceof SyntaxError ? 'The response was not valid JSON.'
      : err.message;

async function load() {
  if (!current) setState('loading');
  try {
    const res = await fetch(API, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    current = parseStats(await res.json());
    render(current);
    $('stale').hidden = true;
    setState('ready');
  } catch (err) {
    if (current) { // keep showing the last good numbers, and say so
      $('stale').hidden = false;
      return;
    }
    $('error-detail').textContent = reason(err);
    setState('error');
  }
}

// Site traffic: its own endpoint, so a failure here never hides the real numbers. The layout
// follows Vercel's Web Analytics page: metric tabs over an hourly chart, then top-N panels.
const IST = { timeZone: 'Asia/Kolkata' };
const tickTime = new Intl.DateTimeFormat('en-US', { ...IST, hour: 'numeric' });
const istHour = new Intl.DateTimeFormat('en-GB', { ...IST, hour: '2-digit', hourCycle: 'h23' });
const when = new Intl.DateTimeFormat('en-US', { ...IST, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const hourLabel = (iso) => `${when.format(new Date(iso))} IST`;
const regions = new Intl.DisplayNames(['en'], { type: 'region' });
const METRICS = { visitors: 'visitors', pageviews: 'page views' };
const PAD = { l: 48, r: 24, t: 12, b: 28 };

let traffic = null;
let metric = 'visitors';
let plot = null; // scales of the drawn hourly chart, for the crosshair
let drawnKey = '';
let pointIndex = null;

function renderMetrics() {
  for (const k of Object.keys(METRICS)) {
    $(`${k}-total`).textContent = count(traffic.total[k]);
    const c = percentChange(traffic.total[k], traffic.previous[k]);
    const badge = $(`${k}-change`);
    badge.hidden = c === null;
    if (c === null) continue;
    badge.dataset.trend = c > 0 ? 'up' : c < 0 ? 'down' : 'flat';
    badge.replaceChildren(signedPercent(c), el('span', 'sr-only', ' compared with the 24 hours before'));
  }
}

function renderPanels() {
  const total = traffic.total.visitors;
  for (const list of document.querySelectorAll('[data-dim]')) {
    const key = list.dataset.dim;
    list.replaceChildren(...traffic[key].map((r) => {
      const li = el('li');
      li.style.setProperty('--w', `${Math.min(100, total ? (r.visitors / total) * 100 : 0)}%`);
      li.append(
        el('span', 'label', key === 'country' ? regions.of(r.country) : r[key]),
        el('span', 'value', 'share' in list.dataset ? share(r.visitors, total) : count(r.visitors)),
      );
      return li;
    }));
  }
}

function tickLabel(text, attrs) {
  const node = svgEl('text', { class: 'tick', ...attrs });
  node.textContent = text;
  return node;
}

// The last bucket can be the hour in progress; its count is only partial, so say so where it is read.
const inProgress = (r) => Date.parse(r.timestamp) + 3600e3 > Date.parse(traffic.until);
const rowLabel = (r) => `${hourLabel(r.timestamp)}${inProgress(r) ? ', so far' : ''}`;

function drawHourly() {
  const chart = $('hourly-svg');
  const { width: w, height: h } = chart.getBoundingClientRect();
  const rows = traffic.hourly;
  const key = `${traffic.until} ${metric} ${w}`;
  if (!w || key === drawnKey) return; // redraw only for new data, another metric or a resize
  drawnKey = key;

  const v = (r) => r[metric];
  const ticks = axisTicks(Math.max(...rows.map(v)));
  const x = (i) => PAD.l + (i / (rows.length - 1)) * (w - PAD.l - PAD.r);
  const y = (n) => PAD.t + (1 - n / ticks.at(-1)) * (h - PAD.t - PAD.b);
  const nodes = [];
  for (const n of ticks) {
    nodes.push(
      svgEl('line', { class: 'grid', x1: PAD.l, x2: w - PAD.r, y1: y(n), y2: y(n) }),
      tickLabel(count(n), { x: PAD.l - 8, y: y(n), 'text-anchor': 'end', 'dominant-baseline': 'middle' }),
    );
  }
  rows.forEach((r, i) => {
    if (Number(istHour.format(new Date(r.timestamp))) % 6 === 0) {
      nodes.push(tickLabel(tickTime.format(new Date(r.timestamp)), { x: x(i), y: h - 6, 'text-anchor': 'middle' }));
    }
  });
  const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(v(r)).toFixed(1)}`);
  // The hour in progress is drawn dashed, as Vercel draws an incomplete period.
  const partial = inProgress(rows.at(-1));
  nodes.push(
    svgEl('path', { class: 'area', d: `M${pts.join('L')}L${x(rows.length - 1)},${y(0)}L${x(0)},${y(0)}Z` }),
    svgEl('path', { class: 'line', d: `M${(partial ? pts.slice(0, -1) : pts).join('L')}` }),
  );
  if (partial) nodes.push(svgEl('path', { class: 'line partial', d: `M${pts.at(-2)}L${pts.at(-1)}` }));
  nodes.push(
    svgEl('line', { class: 'cross', id: 'cross', y1: PAD.t, y2: h - PAD.b, visibility: 'hidden' }),
    svgEl('circle', { class: 'dot', id: 'cross-dot', r: 4, visibility: 'hidden' }),
  );
  chart.setAttribute('viewBox', `0 0 ${w} ${h}`);
  chart.replaceChildren(...nodes);
  plot = { x, y, w };

  const peak = rows.reduce((a, b) => (v(b) > v(a) ? b : a));
  chart.setAttribute('aria-label', `${METRICS[metric]} per hour over the last 24 hours, India time. Busiest hour ${hourLabel(peak.timestamp)} with ${count(v(peak))} ${METRICS[metric]}. Arrow keys step through the hours.`);
  $('hourly-rows').replaceChildren(...rows.map((r) => {
    const th = el('th', '', rowLabel(r));
    th.scope = 'row';
    const tr = el('tr');
    tr.append(th, el('td', '', count(r.visitors)), el('td', '', count(r.pageviews)));
    return tr;
  }));
  if (pointIndex !== null) point(pointIndex);
}

function point(i) {
  const rows = traffic.hourly;
  pointIndex = Math.max(0, Math.min(rows.length - 1, i));
  const r = rows[pointIndex];
  const cx = plot.x(pointIndex);
  const cross = $('cross');
  const dot = $('cross-dot');
  cross.setAttribute('x1', cx);
  cross.setAttribute('x2', cx);
  dot.setAttribute('cx', cx);
  dot.setAttribute('cy', plot.y(r[metric]));
  cross.setAttribute('visibility', 'visible');
  dot.setAttribute('visibility', 'visible');
  const tip = $('hourly-tip');
  tip.replaceChildren(el('span', 'when', rowLabel(r)), el('strong', '', `${count(r[metric])} ${METRICS[metric]}`));
  tip.hidden = false;
  // Beside the crosshair, on whichever side has room, so the hovered point stays visible.
  const right = cx + 12 + tip.offsetWidth <= plot.w;
  tip.style.left = `${right ? cx + 12 : Math.max(0, cx - 12 - tip.offsetWidth)}px`;
}

function unpoint() {
  pointIndex = null;
  $('cross')?.setAttribute('visibility', 'hidden');
  $('cross-dot')?.setAttribute('visibility', 'hidden');
  $('hourly-tip').hidden = true;
}

async function loadTraffic() {
  try {
    const res = await fetch(VERCEL_ANALYTICS_API, { cache: 'no-cache', credentials: 'omit', signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`The server answered ${res.status}.`);
    traffic = parseTraffic(await res.json());
    $('traffic').hidden = false;
    $('traffic-stale').hidden = true;
    renderMetrics();
    renderPanels();
    drawHourly();
  } catch {
    if (traffic) $('traffic-stale').hidden = false; // keep the last numbers and say so; never shown before a good load
  }
}

function startTraffic() {
  for (const button of document.querySelectorAll('[data-metric]')) {
    button.addEventListener('click', () => {
      metric = button.dataset.metric;
      for (const b of document.querySelectorAll('[data-metric]')) b.setAttribute('aria-pressed', String(b === button));
      drawHourly();
    });
  }
  const chart = $('hourly-svg');
  const fromPointer = (e) => {
    if (!plot) return;
    const left = chart.getBoundingClientRect().left;
    point(Math.round(((e.clientX - left - PAD.l) / (plot.w - PAD.l - PAD.r)) * (traffic.hourly.length - 1)));
  };
  chart.addEventListener('pointermove', fromPointer);
  chart.addEventListener('pointerdown', fromPointer);
  chart.addEventListener('pointerleave', () => { if (document.activeElement !== chart) unpoint(); });
  chart.addEventListener('focus', () => { if (plot) point(pointIndex ?? traffic.hourly.length - 1); });
  chart.addEventListener('blur', unpoint);
  chart.addEventListener('keydown', (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (step && pointIndex !== null) { e.preventDefault(); point(pointIndex + step); }
  });
  // Also draws the chart the first time the section becomes visible.
  new ResizeObserver(() => { if (traffic) drawHourly(); }).observe($('hourly-chart'));
  loadTraffic();
  setInterval(loadTraffic, REFRESH_MS);
}

// GitHub Pages cannot send frame-ancestors, so inside a frame the page shows no numbers
// that a site around it could cover or relabel, only a link to open it directly.
if (window.top !== window.self) {
  const link = el('a', '', 'Open Vaidra in numbers');
  link.href = location.href;
  link.target = '_top';
  document.body.replaceChildren(link);
} else {
  $('retry').addEventListener('click', load);
  load();
  setInterval(load, REFRESH_MS);
  setInterval(showUpdated, 60 * 1000);
  startTraffic();
}
