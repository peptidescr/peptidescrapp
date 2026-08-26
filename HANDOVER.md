# HANDOVER — peptidescr

Short client-facing summary. Full engineering log is in `NOTES.md`.

## What this is

A branded installable web app (PWA) for tracking peptide reconstitution math and dosing
schedules. No accounts, no cloud — all data lives on the customer's own device. Installs
from a link on peptidescostarica.net, works offline once installed.

## Status: Phase 1 complete, not yet deployed

All 14 Phase-1 items are built and verified:

- Dose maths engine (`src/lib/units.ts`) — 39 tests
- Mixing calculator (`src/lib/reconstitution.ts` + Calculator screen) — 15 tests
- Schedules: daily / every N days / specific weekdays / cycling (`src/lib/schedule.ts`) — 23 tests
- Full Spanish + English, 24h time, dd/MM/yyyy, comma decimals (es-CR default)
- Dose reminders: on-open catch-up (the reliable mechanism) + best-effort Chromium
  Notification Triggers + honest per-platform capability messaging
- One-tap logging (Taken/Skipped) from Home
- Dose history: search, newest-first
- Fully editable entries: date, time, dose, status, notes; delete
- Next-dose countdown on Home
- Local storage (Dexie/IndexedDB) + daily snapshot, last 7 kept
- Data export: JSON + CSV, share-out via the OS share sheet, plain-download fallback,
  destructive import behind a confirm
- Installable PWA (manifest, service worker, offline app shell)
- Disclaimer/terms acceptance mechanism (placeholder legal text — see below)
- Full seeded compound catalogue from the brief

Verified, not just written: 77 automated tests all green; typecheck and lint clean;
production build succeeds; export→wipe→import round-trip tested live against a real
browser IndexedDB; UI walked end-to-end (onboarding through all 5 tabs) at both 320px and
375px via a scripted headless-browser pass, in Spanish.

## What I need from you to finish

1. **Deploy target and access.** I don't have a Cloudflare or Netlify account to deploy
   to. Pick one:
   - **You deploy** (fastest): the app builds with a plain `npm run build` (output in
     `dist/`). For Cloudflare Pages: `npx wrangler pages deploy dist --project-name=peptidescr`
     (first run will prompt a one-time browser login). For Netlify:
     `npx netlify deploy --prod --dir=dist` (same, one-time login). Either takes under a
     minute once you're logged in.
   - **You add me to your account** and I'll run the deploy and hand you the URL, and can
     keep redeploying as we iterate.
2. **Logo files** — final red atom mark as a square SVG (and ideally 512×512 PNG) to
   replace the placeholder in `public/brand/` (`icon.svg`, `icon-192.png`, `icon-512.png`,
   `apple-touch-icon.png` — same filenames, same square aspect ratio, and it'll just work).
3. **Legal wording** from your lawyer — see `src/content/legal.ts` for the placeholder and
   the specific contradiction that needs resolving: your site says "research use only, not
   for human or veterinary use" while this app logs personal injections.
4. **Confirm the four blend/HGH/HCG categories** I had to guess at (not given in your
   compound table) — flagged with the specific guesses in `NOTES.md` and inline in
   `src/content/compounds.ts`. One-line changes once you confirm.
5. **A device check on your end**: native date/time pickers (used when editing a protocol
   or a history entry) follow the phone's own system language/region setting, not just the
   app's language — worth a quick look on an actual Costa Rican phone to confirm it shows
   24h time and dd/mm/yyyy as expected (it should, by default). Details in `NOTES.md`.

## What's intentionally not in this build

Accounts/login, cloud sync, inventory tracking, calendar grid, visual syringe graphics,
injection site rotation, protocol templates, custom compounds, titration, progress
photos, weight/side-effect tracking, cost tracking, PDF export, and anything AI. If any
of these turn out to matter, they're Phase 2 conversations, not omissions.
