# CLAUDE.md

Guidance for working in this repository.

## What Barecopy is
A privacy tool that **inspects and removes hidden metadata** from documents and
photos — author name, company, edit history, GPS location, EXIF, etc.
Everything runs **100% in the browser**: files are read, analyzed, and cleaned
locally and never leave the user's machine. The core promise is client-side
processing — **never add anything that sends file contents to a server.**

Deployed on Vercel (static hosting). Payments via Polar (Pro subscription, €4/mo).

## Architecture (deliberately simple)
- **Single static site.** `index.html` contains the whole app: markup, CSS, and
  one inline `<script>` with all logic (wrapped in an IIFE with `"use strict"`).
- **No build step.** No framework, no bundler. Edit the HTML directly.
- **Self-hosted dependencies — zero external requests.** Libraries (`jszip`,
  `pdf-lib`, `exif-js`, and `polar-embed` — Polar's embedded-checkout SDK) live
  in `/vendor/`; fonts (IBM Plex) live in `/fonts/`
  with `fonts.css`, all served from the same origin. This is deliberate:
  corporate networks (e.g. the owner's employer) block external CDNs, which has
  silently broken PDF processing before. **Do not move these back to a CDN.**
  To update a library, download the new min.js into `/vendor/`; do not add a
  `<script src="https://…cdn…">`. (`polar-embed.min.js` is `@polar-sh/checkout`'s
  `embed.global.js`; it exposes `window.Polar.EmbedCheckout`. The checkout UI
  itself loads in an iframe from `polar.sh` — that's the one intentional
  cross-origin frame, allowed via `frame-src` in `vercel.json`.)
- **Config** in `config.js` — the ONLY file with the owner's Polar values
  (`BARECOPY_ORG_ID`, `BARECOPY_CHECKOUT`). It's read by `index.html` with a
  `TODO_...` fallback (`BC_CONFIG`). **Never overwrite this file's values.**
  It is intentionally never regenerated so settings survive every code update.
  (Since the switch to server-side entitlement, these two are mostly vestigial:
  `BARECOPY_CHECKOUT` is only a redirect fallback if `/api/checkout` is
  unreachable, and `BARECOPY_ORG_ID` is unused. The live payment/Pro settings
  are **server env vars** now — see Free vs Pro and `.env.example`.)
- **SEO / trust pages** (standalone HTML): `remove-author-name-word-document.html`,
  `word-to-pdf-metadata.html`, `remove-exif-gps-from-photos.html`, `security.html`,
  plus `privacy.html`, `terms.html` and `contact.html`. `sitemap.xml` / `robots.txt` list them.
- **Serverless functions (`/api/*`) + `/lib/*` helpers.** The exception to "static
  site." Originally just `/api/contact.js` (relays the contact form over SMTP via
  `nodemailer`); the Pro flow added `checkout`, `confirm`, `me`, `login`, `portal`
  (payments + entitlement — see Free vs Pro). Shared code lives in `/lib/`:
  `auth` (HS256 JWT + `bc_session` cookie), `polar` (Polar REST client +
  `entitlement`), `email` (magic link over the **same** SMTP relay as contact),
  `http`, `ratelimit`. All are **CommonJS** (no `"type":"module"`), matching
  `contact.js`. `nodemailer` is the only npm `dependency` (that's why a
  `package.json` exists — there is still **no build step**; Vercel serves the root
  statically and builds the functions). Every endpoint is reached same-origin
  (`fetch('/api/...')`), so the site CSP stays tight, and **none of them ever
  touch file data** — only an email address and the yes/no Pro entitlement cross
  the wire. Config via env vars (see `.env.example`): `SMTP_*`/`CONTACT_*` (email),
  `POLAR_ACCESS_TOKEN`/`POLAR_PRODUCT_ID` (Polar), `JWT_SECRET` (session cookie),
  `APP_ORIGIN` (fixed canonical origin — a host-header-injection guard). Run
  locally with `vercel dev` (the plain static server does not execute functions).

## Supported formats & how cleaning works
- **DOCX, XLSX, PPTX** (OOXML) — unzip with jszip, strip `docProps/` core, app &
  custom parts + thumbnail, re-zip. See `analyzeOoxml` / `cleanOoxml`.
- **PDF** (pdf-lib) — clear the info dict + XMP metadata. See `analyzePdf` / `cleanPdf`.
- **JPG / PNG / WebP** — byte-level EXIF/metadata removal; pixels are copied
  untouched (lossless). See `stripJpeg` / `stripPng` / `stripWebp`, with
  `reencodeFallback` as a last resort.
- Optional **PDF report** (`buildReportPDF`) — a local, on-brand record of what
  was found/removed per file, including the SHA-256 of the clean copy.

## Free vs Pro
- Free tier: batch limited to `freeBatchLimit` (3) files.
- **Pro is server-side & Polar-backed — there is NO license key to paste.**
  (This replaced the old paste-a-key flow.) Payment runs in an *embedded* Polar
  checkout overlay: `startCheckout` → `/api/checkout` creates the checkout,
  `vendor/polar-embed.min.js` opens it on the page (redirect fallback if the
  embed can't init). On success `/api/confirm` verifies the checkout with Polar
  and sets a signed 30-day httpOnly session cookie (`bc_session`); the page
  unlocks in place (server redirects to `?pro=1`).
- Entitlement is re-read from the cookie on every load via `/api/me`
  (`refreshPro` → `setPro`) — Polar is the source of truth and nothing Pro is
  cached in `localStorage`. A returning user on a new browser/device signs in by
  email: a 15-minute magic link from `/api/login` (sent over SMTP) sets the
  cookie. "Manage subscription" (`/api/portal`) opens Polar's customer portal.
- Key code — server: `lib/auth.js` (`signJWT`/`verifySession`/`sessionCookie`),
  `lib/polar.js` (`createCheckout`/`getCheckout`/`hasActiveSubscription`/
  `entitlement`), `lib/email.js` (`sendMagicLink`). Client: `startCheckout`,
  `completeCheckout`, `refreshPro`, `isPro`/`setPro`, `initAccount`.

## Hard-won lessons — DO NOT REPEAT THESE
1. **NO Service Worker.** A previous SW cached HTML and trapped users on stale
   versions for days — updates wouldn't propagate, and it interacted badly with
   corporate SSL inspection. It was removed (note the `noSW` build tag in git
   history). Do not reintroduce a service worker or PWA offline caching without
   an extremely good reason and a cache-busting strategy.
2. **PDF errors must be honest.** pdf-lib throws on many non-encrypted PDFs
   (scanners, odd exporters). Never show "password-protected" for every failure —
   surface the real parser message. See `analyzePdf` (it distinguishes the
   genuinely encrypted case from a generic open failure).
3. **PDF report fonts are WinAnsi.** pdf-lib's standard fonts only encode
   WinAnsi; drawing arbitrary Unicode throws. Sanitize/limit text drawn into
   the report PDF (`buildReportPDF`, `wrapMono`).

## Conventions when editing
- Keep the app UI + all client logic in `index.html`; match the existing
  plain-DOM, no-framework, IIFE + `"use strict"` style. No new build tooling.
  (Server code is the exception — it lives in CommonJS modules under `/api` and
  `/lib`, never bundled into the page.)
- Bump `BC_CONFIG.version` when shipping a user-visible change (and regenerate
  the sample report: `node tools/gen-sample-report.mjs`).
- Preserve the client-only guarantee and the security posture in `vercel.json`
  (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, and the
  strict CSP). The CSP's one cross-origin allowance is `frame-src https://polar.sh
  https://*.polar.sh` for the embedded checkout iframe — keep it minimal; the
  `/api/*` calls are all same-origin (`connect-src 'self'`).
- See `DEPLOY.md` and `LAUNCH.md` for deployment and go-to-market notes.
