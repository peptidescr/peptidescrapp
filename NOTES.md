# NOTES

Running log of decisions and things the client needs to weigh in on. Newest at top.

## 2026-08-25 (later still) — Protocol templates (deviation from the original brief)

Added at explicit developer direction, after I flagged the conflict and the developer
chose to proceed anyway — recording that plainly here since it matters for the client
conversation, not to relitigate it.

**What changed vs. the original brief**: the brief's own "Not in Phase 1" list bans
protocol templates outright, and — more importantly than that list item — the brief's
core premise is that this app "never advises, recommends, or suggests" because "the
client sells these compounds, so copy that would be merely unhelpful from a neutral app
becomes a liability coming from the seller." A named, dose-preset template (e.g. "Weight
Loss Beginner") is a dosing/outcome suggestion coming from the seller — precisely the
thing that premise was written to avoid. I raised this once, specifically, before
building it; the developer chose the full version anyway, which is their call to make
for their own client relationship, not mine to override.

**What I actually built**: `src/content/protocolTemplates.ts` — 9 named templates
(mirroring the naming style described: Wolverine, Joint Support, Weight Loss Beginner,
Sleep Optimization, Skin Rejuvenation, Recomposition, Longevity Basics, GH Blast, Brain
Boost), each presetting a real catalogue compound + a dose amount + a schedule + a route.
A new `TemplatePicker` component shows these plus a "Custom protocol" option whenever
someone starts a new protocol (Protocols tab and Onboarding's first-protocol step both
use it); picking a template pre-fills the same protocol form, fully editable before
saving — nothing is force-locked.

**The dose numbers are mine, not the client's, and not copied from anywhere** — I don't
have PeptIQ's actual proprietary values (their site doesn't publish them), so I did not
and could not copy specific numbers from them. Each `doseAmount` in `protocolTemplates.ts`
is my own best-effort starting example, drawn from ranges commonly discussed in public
peptide-community sources for that compound, chosen the same way I'd pick any other
placeholder default — **not vetted, not clinical guidance, not the client's word**.
Treat these exactly like the `legal.ts` placeholder text: real content the client should
review and adjust (or replace entirely) before this ships, flagged clearly in a doc
comment at the top of the file too. There's no "premium tier" split like PeptIQ's, since
this app has no accounts/payments/entitlements to gate anything with — all 9 templates
are simply available to everyone.

**Client: please review every dose/schedule in `src/content/protocolTemplates.ts` before
launch.** This is the one piece of this build I'd genuinely want a second, more
qualified set of eyes on.

## 2026-08-25 (later) — Real brand colors + real logo, from the client's actual site

Pulled real values instead of guessing further:

- **Colors** sourced from peptidescostarica.net's own HTML/CSS (Astra theme globals) and
  from the client's own favicon/app-icon PNG (sampled exact pixel colors via ImageMagick):
  primary blue `#046bd2` and its darker pressed-state `#092771` are the site's/icon's own
  colors, not approximations. `--brand-ink` (`#1e293b`), `--brand-surface-2` (`#f0f5fa`),
  and `--brand-border` (`#d1d5db`) are also the site's own exact values. `--brand-muted`
  (`#64748b`) is the one extrapolated value — no muted/secondary text color was easy to
  isolate from the site's CSS, so I picked a harmonious slate that sits between ink and
  border in the same family. Full reasoning is in `tokens.css`'s header comment.
- Added `--brand-warn-lt`, a light amber tint decoupled from `--brand-primary-lt` — with
  primary now blue, the old pattern of pairing the warning banners' background with
  `--brand-primary-lt` would have put brown/amber warning text on a blue background.
  Measurement-accuracy warnings (low-draw-volume, destructive-import confirm, backup
  nudge) now use `--brand-warn-lt` instead.
- **Logo**: the client's site header logo is a wordmark ("PEPTIDES / COSTA RICA" in navy
  and red, with a small light-blue molecular-chain accent) — downloaded and placed at
  `public/brand/logo-full.png`, now shown in the Onboarding welcome step and Settings'
  Contact section. The client's actual *icon* mark (their real favicon/app-icon, not the
  header wordmark) is a plain navy 3-circle molecular-chain glyph on transparent — I
  redrew this as a clean SVG (`public/brand/icon.svg`, matched proportions by eye against
  their real favicon) on a solid brand-blue square background, replacing the earlier
  invented "atom orbit" placeholder, and regenerated all the PWA/apple-touch-icon PNGs
  from it. This is a redrawn vector recreation of their real mark's proportions and exact
  sampled navy, not a placeholder guess anymore — but it's still worth the client's own
  design sign-off before this ships, since I don't have their original vector source file.
- PWA manifest `theme_color`/`background_color` and `index.html`'s `theme-color` meta
  updated to the new blue to match (affects the OS status bar / task switcher chrome).

## 2026-08-25 — Step 13: Spanish pass, empty states, 320px check

Verified rather than assumed, using a real headless Chromium driven over CDP (no
Playwright/Puppeteer added — just the system `chromium` binary + the DevTools Protocol
over its own WebSocket, driven from a throwaway Node script, so nothing new landed in
`package.json`) clicking through the full onboarding → Home → Calculator → Protocols →
History → Settings flow at both 320px and 375px, plus a locale-key parity check and a grep
for stray hardcoded strings. Found and fixed three real bugs this way:

1. **Tab bar labels visually touching at 320px** (`Calculadora`/`Protocolos` had ~0px
   gap). The five Spanish labels at their original size summed to ~317px against a 320px
   viewport — technically fit, but left no room for even a 4px gap to read visually.
   Fixed by shrinking the tab label to 11px with tight tracking and a `break-words`
   safety net, plus an explicit `gap-1` between tabs. Re-verified clean at 320px.
2. **Backup nudge showed on a completely empty fresh install.** Nothing to lose yet, so
   nudging about a backup was premature. Now gated on having at least one protocol or
   dose log in addition to the existing lastBackupAt/14-day check.
3. **`TabBar`'s `aria-label` was hardcoded Spanish** regardless of the active locale — an
   English-locale screen reader user would still hear "Navegación principal." Moved to
   `nav.ariaLabel` in both locale files.

Also confirmed clean: both locale JSON files have exactly the same 138 flattened keys
(scripted diff, zero mismatches); no stray hardcoded UI strings outside the client's own
brand name in the Settings contact footer (correctly left untranslated, like compound/
category names).

**Known limitation, not fixed — flagging instead of quietly living with it:** native
`<input type="date">` / `<input type="time">` (used in Protocol and History edit forms)
display in whatever format the *browser/OS* locale uses, not the app's `lang` attribute —
this is a long-standing cross-browser inconsistency (Chromium in particular does not
reliably follow the page's `lang`). In my test environment (en-US system locale) they
rendered as `08:00 AM` / `08/25/2026` instead of 24h/dd-MM-yyyy. On an actual Costa Rican
device (es-CR or similar OS locale, which defaults to 24h + dd/mm/yyyy) these will render
correctly with zero extra code, which is the overwhelming real-world case here. The
underlying stored value is unaffected either way — `input[type=date].value` is always
`yyyy-MM-dd` and `input[type=time].value` is always 24h `HH:mm` per spec, regardless of
display chrome, so no data-correctness issue, only a cosmetic one on a misconfigured
device. Building custom date/time picker components to force the format everywhere would
be real scope creep (a "visual syringe graphic"-tier addition, not in the brief) for a
problem that mostly doesn't occur on the client's customers' actual phones. Flagging for
sign-off rather than silently deciding it doesn't matter.

**Export → wipe → import round-trip: verified for real, not just by reading the code.**
Drove the actual `backup.ts` functions against a live IndexedDB in the browser (via CDP,
importing the real ES modules): created a protocol + dose log, exported, wiped both
tables (confirmed empty), imported the export back, and did a deep-equality check against
the originals — exact match on both records, and the CSV export line came out correctly
formatted too. This is genuinely working, not assumed.

## Done-checklist status

- [x] `npm run dev` serves an installable, offline-capable PWA
- [x] Tests green with real coverage of units.ts (39), reconstitution.ts (15), schedule.ts (23)
- [x] Both locales complete (138/138 keys, scripted diff), no hardcoded strings
- [x] Export → wipe → import round-trip verified live
- [x] Works one-handed at 375px (and 320px) — verified with real screenshots
- [ ] **Deployed to a live URL — not done.** I don't have Cloudflare Pages / Netlify
  account access from this environment. The app builds clean and is deploy-ready; see
  HANDOVER.md for what I need from you to finish this step.
- [x] NOTES.md (this file) and HANDOVER.md (client-facing summary)

## 2026-08-25 — Step 12: Onboarding

- The wizard's own step (1–5) is tracked purely as local component state, but *whether to
  show the wizard at all* is gated only by `Settings.legalAcceptedVersion` — no new
  persisted field for "onboarding progress." Consequence: if someone closes the app
  mid-wizard (say, right after accepting the disclaimer but before the install step), the
  next open goes straight to the main app, not back into the wizard. I judged this the
  right tradeoff over adding state to track resumability, since every remaining onboarding
  step (install, notifications, first protocol) is also reachable from Settings/Protocols
  directly, and Home's empty states point there. Nothing is lost, just not re-prompted.
- No "decline" path on the disclaimer step — a single accept-and-continue button, no exit.
  The brief doesn't specify what should happen on refusal, and the app has no functioning
  mode without acceptance, so there's nowhere a decline would actually go.
- First-protocol step has a "Skip for now" — treated as optional rather than a hard gate,
  since forcing protocol creation before someone's looked at anything else (e.g. the
  Calculator) seemed more likely to frustrate than help. Flagging this as a judgment call:
  the brief lists "first protocol" as the last onboarding step but doesn't say explicitly
  whether it should be skippable.
- Reused `ProtocolForm` from `ProtocolsScreen.tsx` verbatim for this step (exported it)
  rather than building a second, trimmed-down creation form — one implementation, one set
  of validation rules.

## 2026-08-25 — Step 10: Settings — language, notifications, install, storage, backup, legal, contact

- **Nightly snapshot, honestly implemented**: there's no backend and no cross-platform
  background job a PWA can rely on, so "nightly" is implemented as "at most one snapshot
  per calendar day, taken on whichever app open happens first that day" — the closest
  honest equivalent given the constraints. Documented in `backup.ts`'s doc comment so this
  doesn't read as a shortcut later.
- **Notification Triggers are genuinely best-effort**: this Chromium proposal
  (`TimestampTrigger`) has shipped only behind flags/origin trials historically and isn't
  in TypeScript's DOM types — feature-detected and silently no-op elsewhere. The brief is
  right that on-open catch-up (Home, step 8) is the mechanism to actually rely on; that one
  already works everywhere. Settings tells the user this plainly rather than promising a
  "reminder set" the platform can't honour.
- Share-out backup uses `navigator.share({ files })` with a plain download fallback,
  exactly as specified — WhatsApp is one tap away from the OS share sheet once shared.
- Import is destructive (wipes and replaces protocols/doseLogs/settings) and requires an
  explicit second-tap confirmation, styled as a warning, before it runs.
- Caught and fixed a real i18n bug while writing this: the initial locale JSON had a flat
  key like `"install": "Install"` sitting alongside `"install.installed": "..."` in the same
  object. i18next's dot-path lookup for `settings.install.installed` would traverse into
  `install` (a string) and fail silently, always falling back to the missing-key placeholder.
  Fixed by properly nesting `install`/`storage`/`backup`/`legal`/`contact` as objects with a
  `.title` key for the section heading — verified with `JSON.parse` clean and a full
  `tsc`/`eslint`/`vitest`/`build` pass afterward. Worth remembering as a pattern to watch for
  in every locale file edit going forward (a section title and its children living under the
  same key name is the trap).

## 2026-08-25 — Step 8: Home screen

- Bug caught before it shipped: the Dexie schema originally indexed `Protocol.isActive`
  and `Compound.isDiluent` (both booleans). IndexedDB doesn't accept booleans as index key
  values at all — that index would have silently misbehaved. Removed both from the index
  lists in `db.ts`; both tables are always small (a handful of rows per user), so filtering
  in JS instead costs nothing.
- Added `getDueOccurrences` to `schedule.ts` (alongside the existing `getMissedOccurrences`)
  for Home's catch-up list — it surfaces anything due at or before now, not just what's
  crossed the 12h "missed" mark, per "surface every dose that came due while it was
  closed." Each row still shows a Missed vs Due label using the 12h line from the brief.
- Backup nudge only *links* to Settings (no export logic on Home itself) — Settings owns
  export/share/lastBackupAt, landing in its own step.

## 2026-08-25 — Step 5: schedule.ts — derived occurrences, no ScheduledDose table

- `date-fns-tz` is in the approved stack but schedule.ts doesn't use it: everything runs
  on plain `Date` in the device's own local time. There's no server and no data that
  crosses time zones — a dosing schedule is about the user's own day/night cycle wherever
  their phone physically is, so device-local time is the *correct* behaviour here, not a
  gap. I'll reach for date-fns-tz only if a genuine fixed-zone display need shows up later
  (I don't expect one in Phase 1 screens).
- Matching a logged dose to a schedule occurrence (needed for both "missed" and "already
  logged, don't ask again"): the brief doesn't specify how to pair a DoseLog's timestamp
  back to a specific scheduled slot. Implemented as same-calendar-day + nearest-in-time
  greedy matching (see `findUnloggedOccurrences` doc comment) — exact for once- or
  twice-daily schedules, which is effectively all real protocols here. Flagging the
  heuristic, not asking to block on it: getting this perfectly optimal for someone running
  3+ same-day reminder times with irregular logging times isn't worth the complexity for
  this brief.
- Missed-dose scan is capped to a 30-day lookback so an old/abandoned protocol can't
  produce an unbounded backlog on the catch-up screen.

## 2026-08-25 — Step 3: Dexie schema + seed compounds

- `Protocol.schedule` needs the `Schedule` type, which the brief's build order puts at
  step 5 (`src/lib/schedule.ts`). Rather than reorder the schema around it, I added just
  the `Schedule` type shape (a discriminated union: daily / everyNDays / weekdays / cycle)
  to `schedule.ts` now; the actual occurrence-generation logic and its tests still land as
  their own step, unchanged.
- `Compound.vialSizes` is a single number array whose *unit* depends on the compound (IU
  count, mL of ready liquid, or mass in `defaultUnit`) rather than a uniform mass — the
  brief's table lists "10ml" for solution-form blends alongside "10mg" for powders in the
  same column. Documented via a `vialSizeUnit()` helper in `compounds.ts` rather than
  adding a new field, so the Compound shape still matches the brief's 5 fields exactly.
- **Client: please confirm categories** for HGH, HCG, and the four named blends (Wolverine
  Stack, CJC-1295 no DAC + IPA, KLOW, GLOW, Fat Blaster, SUPER Human Blend) — the brief's
  table didn't give categories for these, so I assigned best-guess ones matching their
  components (e.g. HCG → Fertility, GLOW → Skin). Easy one-line changes in
  `src/content/compounds.ts` once you confirm.
- Compounds are seeded into Dexie (not just imported as static data) so the catalogue can
  be re-synced on every app open (`ensureCompoundsSeeded`, an idempotent `bulkPut`) without
  a migration step if the catalogue changes between releases — never touches user data.

## 2026-08-25 — Step 1: scaffold, tokens, i18n, PWA shell

- Scaffolded with `create-vite react-ts`, then pinned `react`/`react-dom` to ^18 (the
  scaffold defaults to React 19; brief specifies React 18).
- Tailwind installed is v4, used via `@tailwindcss/vite` (no `tailwind.config.js` — v4
  configures via `@theme` in CSS). This is still "Tailwind" per the stack list, just the
  current major version. `src/styles/tokens.css` holds the actual brand custom properties;
  `src/index.css` maps them into Tailwind's `@theme` so utilities like `bg-brand-primary`
  work. One file (`tokens.css`) to edit for a palette swap, as required.
- Dropped `@testing-library/react`, `@testing-library/jest-dom`, `@vitest/ui`, `jsdom`
  after installing them — not in the approved stack, and not needed: the required test
  coverage is pure-logic (`units.ts`, `reconstitution.ts`, `schedule.ts`), which runs fine
  under Vitest's default `node` environment. Kept `eslint-config-prettier` (glue to stop
  ESLint and Prettier fighting each other, not a new capability).
- No router library in the approved stack, and none is needed — bottom-tab nav across 6
  screens + onboarding is one `<App>` with `useState` for the active screen, not
  URL-addressed routing. Simpler and avoids an unlisted dependency.
- PWA icons: placeholder red atom mark, `public/brand/icon.svg`, rasterized to
  `icon-192.png` / `icon-512.png` / `apple-touch-icon.png` (iOS needs a PNG
  apple-touch-icon — it doesn't reliably use SVG manifest icons for the home-screen
  icon). **Client: replace all four files in `public/brand/` with the real logo before
  launch**, same filenames, same square aspect ratio.
- `vite-plugin-pwa` set to `generateSW` mode, precaching the built app shell only — no
  runtime caching of remote resources, consistent with "no network calls after load".
- Deploy: I don't have Cloudflare Pages / Netlify account access from here. Project builds
  clean (`npm run build`) and is ready to connect — see HANDOVER.md for the one-time setup
  I need you to do (or credentials to hand me) so I can push deploys going forward.

## Open questions for the client / you

- **Round "toward the safer value"** (brief, Numbers section): safer isn't a single
  direction — rounding a drawn *volume* down under-doses, rounding it up over-doses; there
  isn't a universally-safer rounding rule. I'm implementing: displayed volumes/doses round
  to the nearest representable unit (nearest 0.01 mL, nearest whole syringe unit), never
  silently up or down past what the input precision supports, and the calculator always
  shows the exact (unrounded) mass/concentration alongside the rounded draw volume so nothing
  is hidden. Flagging this now — full reasoning goes in `units.ts` doc comments once written.
- Legal copy is a placeholder per the brief — do not use in production until your lawyer
  signs off on wording that reconciles "research use only" with an app that logs personal
  injections.
