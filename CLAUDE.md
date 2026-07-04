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
  `pdf-lib`, `exif-js`) live in `/vendor/`; fonts (IBM Plex) live in `/fonts/`
  with `fonts.css`, all served from the same origin. This is deliberate:
  corporate networks (e.g. the owner's employer) block external CDNs, which has
  silently broken PDF processing before. **Do not move these back to a CDN.**
  To update a library, download the new min.js into `/vendor/`; do not add a
  `<script src="https://…cdn…">`.
- **Config** in `config.js` — the ONLY file with the owner's Polar values
  (`BARECOPY_ORG_ID`, `BARECOPY_CHECKOUT`). It's read by `index.html` with a
  `TODO_...` fallback (`BC_CONFIG`, ~line 535). **Never overwrite this file's values.**
  It is intentionally never regenerated so settings survive every code update.
- **SEO / trust pages** (standalone HTML): `remove-author-name-word-document.html`,
  `word-to-pdf-metadata.html`, `remove-exif-gps-from-photos.html`, `security.html`,
  plus `privacy.html` and `terms.html`. `sitemap.xml` / `robots.txt` list them.

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
- Pro: unlocked via a Polar license key, validated against `api.polar.sh`.
- Pro state is cached in `localStorage` (`bc_pro`); subscriptions are re-checked
  every `revalidateHours` (24h) with a `graceDays` (7) offline grace period.
  See `validateLicense`, `revalidationDue`, `graceExpired`, `isPro`/`setPro`.

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
- Keep everything in `index.html`; match the existing plain-DOM, no-framework,
  IIFE + `"use strict"` style. No new build tooling.
- Bump `BC_CONFIG.version` when shipping a user-visible change.
- Preserve the client-only guarantee and the security posture in `vercel.json`
  (`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`).
- See `DEPLOY.md` and `LAUNCH.md` for deployment and go-to-market notes.
