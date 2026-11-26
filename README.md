# Vaidra in numbers

A single static page that shows how far Vaidra's free courses, audiobooks and research-paper explainers reach: partner student reach, library size by language, and volunteer counts, plus a site-traffic section from Vercel Web Analytics. Live site: https://www.vaidra.org

There is no build step, no npm install and no server code. The page is `index.html`, `style.css` and `app.js`, plus the pure helpers in `stats.js`.

## Where the numbers come from

The page fetches `GET https://www.vaidra.org/api/stats` when it opens and again every 5 minutes. Vaidra caches that response for about 5 minutes on its side. The endpoint allows cross-origin GET with no credentials, so this repo needs no keys, tokens or proxy.

The response looks like `sample-stats.json`:

- `partnerReach`: `students` and `schools` (lower bounds, shown as `60,000+` and `450+`), `asOf`, and a `partners` list.
- `library`: `total`, `courses`, `audiobooks`, `researchPapers`, and `languages`, a map of language name to title count. Keys are the site's eight languages plus `Other` for any title outside them. The page shows them largest first.
- `volunteers`: `total`, `teachers`, `speakers`. The teachers and speakers on the About page, without founder and test accounts.
- `updatedAt`: ISO timestamp, shown as "Updated 3 hours ago".

The partner-reach figure is the combined student networks of Vaidra's school and NGO partners. It is not a count of users or visitors, and the page never calls it that.

If the request fails or the JSON is not in this shape, the page shows an error state instead of zeros. If a refresh fails after a good load, it keeps the last numbers and says so.

## Site traffic (Vercel Analytics)

The traffic block is filled by the browser from vaidra.org (Vercel Web Analytics). This repo does not ship traffic fixtures or a separate analytics URL to open by hand. The section stays hidden until the first good load; if a later refresh fails, it keeps the last numbers and says so.

## Run it locally

```
npx serve .
```

Open `http://localhost:3000/`. The page loads live data from `vaidra.org` (same as production). To validate parsing and formatting without the browser, use `node check.mjs` and the fixtures in the repo.

## Check the logic

```
node check.mjs
```

This validates `sample-stats.json`, rejects malformed stats responses, and checks number formatting, language sorting, relative time, chart helpers (`%` change, share labels, axis ticks). It needs only Node.

## No secrets, by design

This repo holds no API keys, tokens or environment files, and calls no endpoint that needs one. Do not add any. A Content-Security-Policy meta tag in `index.html` limits requests to this origin, `https://www.vaidra.org` and localhost, which stops injected data from loading anything else. It is not a limit on people who can edit this repo. API data is written to the page with `textContent` only. There is no analytics or tracking.

## Files

- `index.html`, `style.css`, `app.js`: the page.
- `stats.js`: response validation, formatting and axis ticks, shared with `check.mjs`.
- `noscript.css`: hides the loading line when JavaScript is off.
- `sample-stats.json`: fixture for local work. Its `volunteers` numbers are placeholders.
- `fonts/`: Fraunces (variable, Latin subset), self-hosted, under the SIL Open Font License. See `fonts/OFL.txt`.