# HANDOVER — peptidescr

Short client-facing summary. Full engineering log is in `NOTES.md`.

## What this is

A branded installable web app (PWA) for tracking peptide reconstitution math and dosing
schedules. No accounts, no cloud — all data lives on the customer's own device. Installs
from a link on peptidescostarica.net, works offline once installed.

## Status: ready for a first pass with the client

Every Phase-1 item from the original brief is built and verified, plus a full design
pass since (real brand colors/logo, protocol templates, and a modern dark UI styled after
a competitor app, PeptIQ, with the client's own blue and logo in place). Not yet
deployed — deploy is the next and last step (see below).

**Phase 1, all 14 items:**

- Dose maths engine (`src/lib/units.ts`) — 39 tests
- Mixing calculator (`src/lib/reconstitution.ts` + Calculator screen) — 15 tests
- Schedules: daily / every N days / specific weekdays / cycling (`src/lib/schedule.ts`) — 23 tests
- Full Spanish + English, 24h time, dd/MM/yyyy, comma decimals (es-CR default)
- Dose reminders: on-open catch-up (the reliable mechanism) + best-effort Chromium
  Notification Triggers + honest per-platform capability messaging
- One-tap logging (Taken/Skipped) from Home
- Dose history: search + status filters, newest-first
- Fully editable entries: date, time, dose, status, notes; delete
- Next-dose countdown on Home
- Local storage (Dexie/IndexedDB) + daily snapshot, last 7 kept
- Data export: JSON + CSV, share-out via the OS share sheet, plain-download fallback,
  destructive import behind a confirm
- Installable PWA (manifest, service worker, offline app shell) — verified fresh: manifest
  and service worker both regenerate correctly, all brand icons precached for offline use
- Disclaimer/terms acceptance mechanism (placeholder legal text — see below)
- Full seeded compound catalogue from the brief

**Added since, at your request:** real brand colors and logo (pulled directly from
peptidescostarica.net, not guessed), 9 starter protocol templates alongside custom
protocol creation, a full modern UI pass (icons, animated transitions, toast feedback, a
proper calendar/time picker, pill-shaped controls), and a permanent dark theme styled
after PeptIQ's layout/color structure with your own blue and logo swapped in. Home's
header is now a small branded card with the logo, a greeting, and at-a-glance stats
(active protocols, doses logged today); every other screen carries a small logo badge
next to its title.

**Verified, not just written:** 81 automated tests green; typecheck and lint clean;
production build succeeds; export→wipe→import round-trip tested live against a real
browser IndexedDB; UI walked end-to-end (onboarding through all 5 tabs) at 320px and
375px via a scripted headless-browser pass with zero console errors, including confirming
the dark theme holds even when the device's own setting is light, in Spanish.

**Fixed since:** Settings → Storage was reading the wrong signal to decide whether it
should say "protected"/"not protected" (it trusted an unreliable async API instead of
actual install status), so the warning could keep showing even after you installed the
app. Fixed, and the section now also says plainly, permanently, that install alone only
covers automatic cleanup — not uninstalling, clearing browser data, or losing the device
(see "Does installing keep your data safe, full stop?" below).

## What's left before you and the client can play with it

**One step: deploy.** I don't have Cloudflare/Netlify account access from here. Once
you've had a look and we're both happy, either:
- **You deploy it**: `npm run build` produces `dist/`. For Netlify:
  `npx netlify deploy --prod --dir=dist` (one-time browser login on first run). For
  Cloudflare Pages: `npx wrangler pages deploy dist --project-name=peptidescr` (same).
  Either takes under a minute once logged in.
- **Or add me to your account** and I'll run the deploy and hand you the URL, and keep
  redeploying as you and the client give feedback.

Nothing else is blocking — everything below is worth the client's attention but doesn't
need to hold up putting this in front of them for a first look.

## Does installing keep your data safe, full stop?

Short answer: **no** — installing fixes one specific, real risk, but it isn't a complete
guarantee, and the app now says so on-screen instead of leaving it to be inferred.

What installing *does* fix: browsers are allowed to silently wipe an uninstalled site's
local storage after a period of inactivity — most aggressively iOS Safari, which does this
after roughly 7 days without a visit. Installing (Add to Home Screen on iOS, the
Install/App Store-style prompt on Android/desktop Chrome) exempts the app from that
automatic cleanup, which is the exact scenario the Storage section in Settings is warning
about, and now correctly reflects.

What installing does **not** protect against, because nothing built into any browser can:
uninstalling the app itself, manually clearing site/app data from the device or browser
settings, or losing/replacing/factory-resetting the device. All of those wipe local data
just as completely, installed or not — installing narrows the ways data loss happens, it
doesn't remove them.

The only protection that covers all of those is the Backup & export feature already in
Settings — a one-tap JSON export (shareable to email, cloud drive, another device, etc.)
plus CSV history export, with import to restore. That's the real "no matter what," and
it's on the customer, not the app, to actually run it periodically — the app nudges for
this on Home after enough time has passed (`home.backupNudge`) and now spells this out
plainly in the Storage section itself rather than leaving people to assume installing was
enough.

## Four things worth the client's deliberate sign-off, not a rubber stamp

1. **Protocol template doses.** Protocols now offers 9 starter templates (Wolverine,
   Weight Loss Beginner, GH Blast, etc.) that pre-fill a compound/dose/schedule, fully
   editable before saving. The dose numbers in `src/content/protocolTemplates.ts` are my
   own best-effort starting examples — not vetted by the client, not clinical guidance.
   This is also a deliberate deviation from the original brief's "never suggest a dose"
   rule, done at your explicit request during the build — worth being intentional about
   given the client sells these compounds.
2. **Legal wording.** Still a placeholder — see `src/content/legal.ts`. Needs the client's
   lawyer, specifically to resolve the contradiction between their site's "research use
   only, not for human or veterinary use" and an app that logs personal injections.
3. **Four category guesses.** HGH, HCG, and the four named blends didn't have categories
   in the original compound table — I assigned best-guess ones (`NOTES.md` and inline in
   `src/content/compounds.ts` have the specifics). One-line changes once confirmed.
4. **Logo/icon.** Using the client's real logo (pulled from their site) and a redrawn
   version of their actual favicon mark — not your original vector file, so worth a look.
   If the client has the real source (AI/SVG/EPS), send it and it drops straight into
   `public/brand/` under the same filenames.

## Two things that are genuine tradeoffs, worth knowing about

- **Always-dark theme.** The app no longer has a light mode — it opens dark for everyone,
  regardless of the customer's own phone setting. Deliberate, to match the "modern,
  premium, PeptIQ-like" look that was asked for — but it's a real product decision, not
  just a visual tweak. If the client's customers expect the app to follow their phone's
  own light/dark setting, say so and light mode comes back easily — nothing was deleted,
  the old values are sitting in a comment in `src/styles/tokens.css`.
- **Bundle size.** The modern UI pass added a real dependency footprint (Radix UI, Motion,
  a calendar library, icons) — the app's JS roughly doubled to get the more polished,
  animated feel. Still loads fine, but worth knowing if the client's customers are often
  on slow connections.

## What's intentionally not in this build

Accounts/login, cloud sync, inventory tracking, calendar grid, visual syringe graphics,
injection site rotation, custom compounds, titration, progress photos, weight/side-effect
tracking, cost tracking, PDF export, and anything AI. If any of these turn out to matter
after the client sees it, they're Phase 2 conversations, not omissions.
