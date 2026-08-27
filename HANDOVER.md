# HANDOVER — peptidescr

Short client-facing summary. Full engineering log is in `NOTES.md`.

## What this is

A branded installable web app (PWA) for tracking peptide reconstitution math and dosing
schedules. No accounts, no cloud — all data lives on the customer's own device. Installs
from a link on peptidescostarica.net, works offline once installed.

## Status: Phase 1 complete + UI refresh, not yet deployed

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

Since then, added at your request: your actual brand colors and logo (pulled from
peptidescostarica.net directly, not guessed), 9 starter protocol templates alongside
custom protocol creation, a full modern UI pass (icons, animated transitions, toast
feedback, a proper calendar/time picker), and — most recently — a permanent dark theme
styled after PeptIQ (a competitor app), with your own blue and logo in place of their
gold. **The app now always opens in dark mode** — that's a deliberate default, not a bug
or a half-finished light mode; see the note below.

Verified, not just written: 81 automated tests all green; typecheck and lint clean;
production build succeeds; export→wipe→import round-trip tested live against a real
browser IndexedDB; UI walked end-to-end (onboarding through all 5 tabs) at 320px and
375px via a scripted headless-browser pass with zero console errors, including a check
that the dark theme holds even when the device's own setting is light, in Spanish.

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
2. **Logo/icon sign-off** — now using your real logo (pulled from your site) and a
   redrawn version of your actual favicon mark, not a placeholder anymore. The redraw is
   my recreation of your icon's proportions/colors, not your original vector file — worth
   a quick look before launch. If you have the actual source file (AI/SVG/EPS), send it
   over and I'll swap it in directly (same filenames in `public/brand/`, drops right in).
3. **Legal wording** from your lawyer — see `src/content/legal.ts` for the placeholder and
   the specific contradiction that needs resolving: your site says "research use only, not
   for human or veterinary use" while this app logs personal injections.
3b. **Protocol template doses** — Protocols now offers 9 starter templates (Wolverine,
   Weight Loss Beginner, GH Blast, etc.) that pre-fill a compound/dose/schedule, editable
   before saving. The specific dose numbers in `src/content/protocolTemplates.ts` are my
   own best-effort starting examples, not vetted by you — please review and adjust them
   (same treatment as the legal placeholder text). Flagging clearly: adding named,
   dose-preset templates is a deviation from the original build brief's "never suggest a
   dose" rule, done at explicit request — worth being deliberate about before launch given
   your business is selling these compounds.
4. **Confirm the four blend/HGH/HCG categories** I had to guess at (not given in your
   compound table) — flagged with the specific guesses in `NOTES.md` and inline in
   `src/content/compounds.ts`. One-line changes once you confirm.

## Three things worth your deliberate sign-off, not just a rubber stamp

- **Protocol template doses**: 9 starter templates (Wolverine, Weight Loss Beginner, GH
  Blast, etc.) pre-fill a compound/dose/schedule that's still fully editable before
  saving. The dose numbers in `src/content/protocolTemplates.ts` are my own best-effort
  starting examples — not vetted by you, not clinical guidance. This is also a deliberate
  deviation from the original brief's "never suggest a dose" rule, done at your explicit
  request. Worth being intentional about before launch, given your business is selling
  these compounds.
- **Bundle size**: the UI refresh added a real, sizeable dependency footprint (Radix UI,
  Motion, a calendar library, icons) — the app's JS roughly doubled in size to get the
  more polished/animated feel. Still loads fine, but if your customers are often on slow
  connections this is worth knowing about.
- **Always-dark theme**: the app no longer has a light mode — it always opens dark now,
  regardless of the customer's own phone settings. This was a deliberate choice to match
  the "modern, dark, premium" look you asked for (styled after a competitor app, PeptIQ,
  with your blue/logo instead of their gold), but it's a real product decision, not just a
  visual tweak: if your customers expect the app to follow their phone's own light/dark
  setting, or you'd rather offer both, say so and I'll add a toggle or bring light mode
  back — nothing was deleted, the old light-mode colors are sitting in a comment in
  `src/styles/tokens.css` ready to restore.

## What's intentionally not in this build

Accounts/login, cloud sync, inventory tracking, calendar grid, visual syringe graphics,
injection site rotation, custom compounds, titration, progress photos, weight/side-effect
tracking, cost tracking, PDF export, and anything AI. If any of these turn out to matter,
they're Phase 2 conversations, not omissions.
