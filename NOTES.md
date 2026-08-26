# NOTES

Running log of decisions and things the client needs to weigh in on. Newest at top.

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
