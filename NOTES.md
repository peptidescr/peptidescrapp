# NOTES

Running log of decisions and things the client needs to weigh in on. Newest at top.

## 2026-09-19 — Part 1 of the light-mode/settings-IA/nav plan: light mode + a quick theme toggle

Scope was deliberately narrow: Part 1 only (`~/.claude/plans/golden-roaming-hickey.md`) — the
light-mode mechanism, its 5 hardcoded-colour fixes, persistence, flash prevention, and a
switcher in Settings. Parts 2 (settings IA) and 3 (navigation/back button) are untouched.
Mid-task the project owner asked for one small addition on top: a second floating button
next to the settings gear that quick-toggles light/dark directly — folded into this same
pass rather than treated as separate work.

**Mechanism.** `tokens.css`'s single `:root` block stays the dark base; a new
`:root[data-theme='light']` block overrides it, reviving exactly the values the file's own
header comment had kept since the dark-only decision (primary `#046bd2`, ink `#1e293b`,
surface `#ffffff`/`#f0f5fa`, border `#d1d5db`, warn `#b0672a`/`#fbf1e7`, destructive
`#dc2626`/`#ffffff`) — not a fresh palette. Overridden at the `--brand-*` layer (plus the
un-prefixed `--destructive`/`--destructive-foreground`, which live in the same `:root`
block), never `--color-*` — `index.css`'s `@theme` block is not `@theme inline`, so every
semantic token is `var(--brand-*)` and re-resolves for free. That's what makes the 3
call sites that read `--brand-*` names directly (the warn banners in HomeScreen/
NotificationPanel/CalculatorScreen, and `active:bg-brand-primary-dk` in
`button-variants.ts`) correct in light mode without touching those files at all.
**Landmine hit while writing the light block's comment**: the literal sequence
`--brand-*/--destructive*` inside a `/* */` comment contains `*/`, which closes a CSS
block comment early — Tailwind's build then tried to parse the rest of the comment as real
CSS and failed with a genuinely confusing "Unterminated string" error pointing at
`index.css` (the entry file), not `tokens.css` (the actual source). Bisected by
binary-searching a trimmed copy of the file outside git until the exact substring was
isolated. Fixed by adding a space (`--brand-* / --destructive*`). Worth remembering: never
let `*/` occur literally inside a CSS comment, including accidentally via adjacent tokens.

**Resolution.** JS always resolves to a concrete `data-theme="light"|"dark"` on `<html>`,
never `"system"` — `src/lib/theme.ts` is pure logic (`resolveTheme`, `applyTheme`,
`subscribeToSystemTheme`), kept separate from React specifically so it's unit-testable
under this repo's `environment: 'node'` vitest config (no jsdom — `applyTheme`/
`subscribeToSystemTheme` no-op safely without a DOM, tested explicitly). `ThemeMode`
(`'light' | 'dark' | 'system'`) lives in `units.ts` next to `Locale`/`SyringeType`;
`Settings.theme` in `db.ts` is optional (no Dexie version bump — `settings: 'id'` only
indexes the key). `App.tsx` wires it: one effect applies `resolveTheme(settings.theme ??
'system')` whenever the stored mode changes, another subscribes to
`matchMedia('(prefers-color-scheme: dark)')` while in `'system'` mode so the app follows
the device live without a reload.

**A real flash-of-wrong-theme bug, caught only by the live CDP pass, not by
tsc/vitest/build.** The first version of the `App.tsx` effect fell back to `'system'`
whenever `settings` was still `undefined` (Dexie's first read hadn't resolved yet) —
that's a *guess*, and for a beat it actively overwrote index.html's already-correct
pre-paint `data-theme` with the guessed value before the real stored value arrived a
moment later. Verified via a `Page.addScriptToEvaluateOnNewDocument` script that attaches
a `MutationObserver` to `<html>`'s `data-theme` attribute at document-start (before
`documentElement` even exists — the script has to wait for it) and timestamps every
change with `performance.now()`. With `theme: 'light'` stored, the timeline showed
`light` (51ms) → `dark` (114ms) → `light` (167ms) — a real, ~60ms flash to the wrong
theme, entirely caused by my own new code. Fixed by making the effect a genuine no-op
(not a guessed default) while `settings` is `undefined`: `const themeMode = settings ?
(settings.theme ?? 'system') : undefined`. Re-verified with the same MutationObserver
timeline — zero wrong-theme entries in either direction afterward. This is exactly the
kind of bug this repo's "live verification is mandatory" discipline exists to catch.

**Flash prevention (the mechanism itself, once the bug above was fixed).**
`localStorage['peptidescr:theme']` is a synchronous cache of the *resolved* theme, written
on every `applyTheme()` call — the first `localStorage` usage anywhere in `src/`. A small
inline classic `<script>` in `index.html` (before the deferred `type="module"` script)
reads it and sets `data-theme` before anything paints, falling back to
`matchMedia('(prefers-color-scheme: dark)')` if nothing's stored yet, and also
pre-paints the `theme-color` meta tag. Dexie stays the source of truth throughout;
localStorage is only ever a pre-paint cache. **Importing a backup can change `theme`**
(`buildBackupPayload`/`importBackupPayload` spread the whole settings row) — without a
fix, the localStorage mirror would go stale until the next explicit theme change, painting
the old cached theme once on the next cold start. `backup.ts`'s `importBackupPayload` now
calls `applyTheme(resolveTheme(payload.settings?.theme ?? 'system'))` right after the
transaction commits. Verified live: built a synthetic backup JSON with `theme: 'light'`
while the app was in dark mode, drove the real hidden `<input type=file>` via a
`DataTransfer` (not a mocked import call) and clicked through the real "Replace my data"
confirm dialog — `data-theme`, the localStorage mirror, and Dexie's row all flipped to
`light` immediately, and a subsequent cold reload painted `light` with no flash.

**The 5 hardcoded colours, all fixed:**
- `ui/switch.tsx` — the thumb was a literal `bg-white`, invisible against a light-grey
  unchecked track in light mode. Changed to `bg-foreground` (unchecked) /
  `bg-primary-foreground` (checked, always white, matches the always-saturated-blue
  checked track) — both semantic tokens, not new hardcodes. In dark mode `--foreground`
  is near-white anyway, so the checked/unchecked look is unchanged there; in light mode
  it's dark ink, which is what actually fixes the contrast. Screenshotted both ways.
- `ui/option-card.tsx` — the icon badge was `bg-primary/20` (selected) vs `bg-accent`
  (unselected), which collapse to nearly the same colour in light mode partly because the
  *card itself* becomes `bg-accent` when selected, so a translucent `primary/20` badge sits
  on a background already tinted with the same colour family. Changed selected to a solid
  `bg-primary` fill with `text-primary-foreground` icon, vs. the unselected soft
  `bg-accent`/`text-primary` — a solid-vs-tint contrast holds at any palette, not just the
  one it was tuned for. Note: the only current call site (`OnboardingScreen`'s language
  step) doesn't pass an `icon`, so this fix has no live rendering surface today — still
  correct and now safe for whenever a future caller does pass one.
- `components/DoseCard.tsx` — the missed/overdue glow (`shadow-[0_0_24px_-8px_var(--destructive)]`)
  only reads as "lit" on true black. Moved to a `--destructive-glow` CSS variable defined
  in both `:root` blocks: the dark block keeps the exact original glow, the light block
  swaps it for a crisp 1.5px ring plus a soft tinted drop shadow. `DoseCard.tsx` just
  reads `shadow-[var(--destructive-glow)]` — no JS branching needed.
- `screens/HomeScreen.tsx` — the notification badge's `text-white` (on a `bg-brand-warn`
  fill) bypassed the semantic layer. Changed to `text-primary-foreground`, the existing
  always-white semantic token, so a palette edit has one fewer place to hunt for.
- `index.html` — the static `theme-color` meta is now updated on every `applyTheme()` call
  (`#f0f5fa` light / `#000000` dark, mirroring `--brand-surface-2`), plus set once more
  synchronously by the pre-paint script so the status-bar colour doesn't lag a beat behind
  first paint either.

Also fixed while in the area: `button-variants.ts` had `focus-visible:ring-offset-2` with
no `ring-offset-color`, so Tailwind's default white ring-offset drew a bright halo around
every focused button — invisible on the previous all-black page, which is exactly why it
had never been noticed. Added `ring-offset-background`. And unified the dialog scrim
opacity: `sheet.tsx` used `bg-black/60` while `dialog.tsx`/`alert-dialog.tsx` used `/50`;
changed `sheet.tsx` to `/50` to match. Left alone per the plan: the WhatsApp brand green in
`SettingsScreen.tsx` and the black scrim colour itself (conventionally dark in both
themes).

**Settings switcher.** New `AppearanceSection` in `SettingsScreen.tsx`, same hand-rolled
segmented-control markup `LanguageSection` already uses (not a new primitive — that's
explicitly Part 2's job), three options Light/Dark/System, `'system'` the default with no
stored preference. Same persist-then-apply-side-effect shape as `LanguageSection`:
`await updateSettings({ theme }); applyTheme(resolveTheme(theme))`.

**The quick-toggle addition (mid-task request).** A second floating button,
`FloatingThemeToggleButton.tsx`, next to the settings gear — same size-11/rounded-full/
border-border/bg-card/shadow-lg treatment, Sun/Moon icon reflecting the *resolved* theme
(not the raw mode, since those differ under `'system'`). `FloatingSettingsButton` had its
own `fixed right-4 top-[...] z-30` positioning removed so a new shared wrapper in
`App.tsx` owns positioning for both as a matched pair (`gap-2`, toggle first/left, gear
second/right) — nesting a second `fixed` element inside would have broken the flex gap
entirely, since `fixed` takes an element out of flow regardless of its parent. A tap is a
straight two-way flip (never the three-way control — that stays in Settings), always
setting an explicit choice through the exact same `updateSettings({ theme })` +
`applyTheme` path the Appearance section uses, so Dexie's live query keeps both in sync
automatically with no extra plumbing. Verified live both directions: tapping the button and
reloading showed the Settings segmented control land on the matching option; picking
"Claro" in Settings and returning to Home showed the floating button's icon switch to Sun.
Hidden on the Settings tab itself (same rule as the gear), since the full three-way control
is already visible there.

**Known limitation, not solved (inherent to PWAs, not an oversight):** the manifest's
`background_color`/`theme_color` (`vite.config.ts`) and iOS's
`apple-mobile-web-app-status-bar-style` (`index.html`) are baked at build/install time and
can't follow a runtime toggle. A light-mode user still gets a black splash screen on cold
launch. Worth telling the client plainly.

**Verification.** `npx tsc -b`, `npx vitest run` (123/123, up from 117 — 6 new tests in
`src/lib/theme.test.ts`), and `npm run build` all clean. i18n parity: flattened both locale
files to dotted keys and diffed — **242/242**, up from 237/237 by 5 new keys
(`settings.appearance.{title,light,dark,system,quickToggle}`), added as one new nested
object (not a flat key beside a sibling object — avoids the documented shadowing
landmine). `npx eslint .` could **not** be run to completion in this environment — every
invocation hung indefinitely (13+ minutes, zero output) rather than erroring or finishing.
Root cause not investigated, per standing direction from the project owner on a separate,
already-discussed matter. Did not touch `eslint.config.js`; killed the two stuck
invocations as ordinary cleanup and moved on.
Everything else that normally rides alongside lint (tsc, tests, build) is clean, so this is
the one box left unchecked, for a pre-existing reason unrelated to this work.

Live verification: headless Chromium via raw Node WebSocket + CDP (`--headless=new
--remote-debugging-port --no-sandbox --disable-gpu`), `vite preview` on a throwaway port,
service worker unregistered and the `peptidescr` IndexedDB deleted before every fresh
pass. Confirmed: no flash with `theme: 'light'` stored (see the bug above — now clean);
`system` mode follows `Emulation.setEmulatedMedia('prefers-color-scheme')` live in both
directions without a reload; Home/Calculator/Protocols/Settings walked at 390px in both
themes with zero console errors/exceptions; the protocol form's `Switch` and Settings'
segmented control screenshotted in both themes and visually reviewed (dark-ink thumb on
light-grey track in light mode, near-white thumb on dark track in dark mode — both clearly
legible); the theme switcher and quick-toggle both persist correctly across a reload; all
throwaway vite-preview/chromium processes killed by exact PID afterward (matched via the
unique scratchpad `--user-data-dir` path, not a broad pattern).

**For the project owner to specifically review:** the plan's own risk note says light mode
"touches every screen visually even though it changes little code" — screenshots were
reviewed for Home, Calculator, Protocols (list + empty state), the protocol form, Settings,
and onboarding's language step, in both themes, and everything read correctly to me, but a
human designer's eye on the actual device is still worth it before shipping, particularly
the amber warn family and the new destructive ring/tint on light (never battle-tested
against a real missed-dose card, since seeding one wasn't in scope for this pass).

## 2026-09-19 — Two bug fixes: calculator checklist never checking off, onboarding language not switching live

Two small, unrelated fixes requested alongside the light-mode/settings-IA/nav plan work.

**Home's "Try the mixing calculator" checklist item never checked off.**
`Settings.hasUsedCalculator` already had a read side — `computeGetStartedSteps` in
`homeData.ts` uses it to mark that checklist row done — but no write side existed
anywhere in the codebase; nothing ever set it to `true`. Fixed in
`CalculatorScreen.tsx`: a `useEffect` now sets `hasUsedCalculator: true` the first time a
valid mix result is produced (guarded so it only writes once, not on every keystroke or
render). Adding the effect required restructuring the component slightly, because the
existing `if (!compound) return null` early return sat *before* where the new hook needed
to go — hooks must run unconditionally on every render, so the `result`/`error`
computation is now guarded by `if (compound) { ... }` instead of relying on the early
return, and the return itself moved below the new `useEffect`. Verified live via
headless-Chromium/CDP: seeded a protocol directly into IndexedDB, opened Calculator,
confirmed `settings.hasUsedCalculator` flips `undefined → true` in IndexedDB the moment a
result renders, and Home's checklist count increased accordingly on the next screen.

**Onboarding's language-selection step stayed in Spanish even after tapping English.**
`LanguageStep` (`OnboardingScreen.tsx`) persisted the new locale via `updateSettings` but
deferred the actual `i18n.changeLanguage()` call to the step's Continue button handler,
so the step's own heading, option labels, and Continue button stayed in the
just-abandoned language until the user had already moved past it. Fixed: `handleSelect`
now calls `i18n.changeLanguage()` immediately on tap, same as `updateSettings`. Verified
live: tapping "English" now visibly flips the step's own `h1` from "Elegí tu idioma" to
"Choose your language" and the Continue button label updates in the same tap, before
advancing.

## 2026-09-19 — Finish and commit the onboarding rebuild (Part 4 of the light-mode/settings-IA/nav plan)

This closes out work a previous session left written but uncommitted: the onboarding
wizard rebuilt from 5 steps to 6 (**Language → How it works → Legal → Install →
Notifications → First protocol**), plus a real fix for a cancel-exits-onboarding bug.
Nothing here is a redesign — it's finishing, verifying, and committing what was already
built, per Part 4 of the current plan (`~/.claude/plans/golden-roaming-hickey.md`); Parts
1–3 (light mode, settings IA, back-button navigation) are separate follow-on work.

**What the wizard changes, and why:**

- **New step 2, "How it works"** (`onboarding.howItWorks.*`): one row per real tab
  (Calculator/Protocols/Home/History), same lucide icon each tab uses in `TabBar`, so the
  preview maps 1:1 onto the navigation the user is about to land on. Lives in a new
  `HowItWorksList` component so the content has exactly one copy — also reused by a new
  "How it works" section in Settings (`SettingsScreen.tsx`, opens the same list in a
  `ui/sheet.tsx` Sheet), so it's a revisitable reference, not a one-time thing you can
  only half-read on your way past it.
- **`onboardingCompletedAt` replaces `legalAcceptedVersion` as the "has onboarding run"
  signal** (`db.ts`, `App.tsx`). The old flow conflated two different questions into one
  comparison — whether onboarding had ever finished, and whether the accepted legal
  wording was current — which had two real consequences: quitting the wizard partway
  through (after the legal step but before finishing) meant the app treated onboarding as
  done forever, and any future `LEGAL_VERSION` bump would silently re-run the *entire*
  wizard (language, install, notifications, first protocol) just to get a re-acceptance
  of updated wording. `onboardingCompletedAt` is now set exactly once, only by the
  wizard's own completion (save a protocol, or explicitly skip); `legalAcceptedVersion`
  goes back to meaning only what it says. A standalone `LegalGate` (exported from
  `OnboardingScreen.tsx`, no wizard chrome) is what `App.tsx` shows instead when someone
  who's already onboarded needs to re-accept a bumped legal version. `App.tsx`'s gate is
  now `'loading' | 'onboarding' | 'legalReaccept' | 'app'`, and it backfills
  `onboardingCompletedAt` for anyone already sitting on `legalAcceptedVersion ===
  LEGAL_VERSION` from the old flow, so nobody who's already onboarded gets sent through
  the wizard again — verified live, see below.
- **The actual bug fix**: `ProtocolForm` (`ProtocolsScreen.tsx`) only ever had one notion
  of "back" — `onDone`, correct for the real Protocols screen where cancel and save both
  just return to the list. Onboarding's first-protocol step reused the same form for
  picking a template then filling it in, and wired that same `onDone` to the form's back
  button — so tapping Cancel after picking a template didn't return you to the template
  picker, it **finished onboarding outright** (jumped straight to Home, protocol
  unsaved). Fixed with a new optional `onCancel?: () => void` prop (defaults to `onDone`,
  so the real Protocols screen is unaffected) that onboarding now points back at the
  picker instead. Confirmed fixed live, both at 390px and 320px — see below.

**Verification performed** (the previous session had gotten as far as `tsc`/`vitest`/
`build` all clean and stopped there — lint and live verification never ran):

- Re-ran `npx tsc -b`, `npx vitest run` (117/117), `npm run build` — all still clean.
- `npx eslint .` **timed out at 30s again** (exit 124) — a pre-existing environment issue
  unrelated to this diff (already discussed and settled elsewhere, not re-investigated
  here). Relied on `tsc` plus the manual/live review below in its place.
- i18n parity: flattened both locale files to dotted keys and diffed the sets —
  **237/237**, zero keys on either side only, matching the count already recorded before
  this session started.
- **Live verification, real headless Chromium over CDP** (`/usr/bin/chromium
  --headless=new`, raw Node `WebSocket` scripts — no Playwright/Puppeteer — against a
  `vite preview` build on a throwaway port; both processes started and killed by their
  own PIDs, never by a name pattern). Service worker unregistered and the `peptidescr`
  IndexedDB database deleted before every fresh pass, per this project's standing rule
  that a stale SW has masked fixes here before. Three passes, 59 assertions total, all
  passing, **zero console errors in any pass**:
  1. **390px, fresh install, full wizard walk**: Language → How it works (all 4 rows'
     copy and all 4 icons confirmed present) → Legal → Install → Notifications → First
     protocol. Picked a template, confirmed the form pre-filled from it, tapped Cancel,
     confirmed it returns to the **template picker** (not Home) — the exact bug above.
     Backed out further to the intro sub-step, then tapped **Skip**, confirmed the wizard
     exits to the main app shell and `onboardingCompletedAt` is now set in IndexedDB.
  2. **Backfill path, 390px**: cleared SW/IDB, let a fresh row get created, then wrote
     `{legalAcceptedVersion: 1, legalAcceptedAt: <iso>}` directly into IndexedDB with no
     `onboardingCompletedAt` (simulating an install from before this change) and
     reloaded. Confirmed onboarding does **not** run — lands straight on Home — and that
     `onboardingCompletedAt` gets backfilled into the same IndexedDB row without
     disturbing the original `legalAcceptedVersion`/`legalAcceptedAt`. From that
     onboarded state, opened Settings → "How it works" → Sheet, confirmed all 4 rows
     (correct copy, 4 icons) — the identical content and component the wizard step uses.
  3. **320px, fresh install, same full wizard walk** (including the cancel-to-picker
     check and Skip) — same 22 assertions, all passing, no horizontal overflow
     (`scrollWidth` vs `clientWidth`) at any step.
  - One real scripting bug caught and fixed along the way, worth recording since it's a
    trap the next CDP pass could hit too: a helper that grabbed `document.body.innerText`
    truncated at 800 characters by default. The How-it-works Sheet is portaled to the end
    of `<body>`, after the whole Settings screen's own content, so its text landed past
    the truncation point and every assertion about its contents initially read as a false
    "not found" even though the DOM (and a direct icon-count query) confirmed it had
    rendered correctly. Not an app bug — a harness one — fixed by raising the slice limit
    for that check.

Commit is scoped to exactly the files the previous session had modified/added
(`App.tsx`, `db.ts`, both locale files, `OnboardingScreen.tsx`, `ProtocolsScreen.tsx`,
`SettingsScreen.tsx`, `HowItWorksList.tsx`) plus this entry and a short `HANDOVER.md`
note — nothing from the untracked `public/brand/peptidescrlogo.jpeg` (unrelated, left
untouched) and nothing from the rest of the plan (light mode / settings IA / back button),
which land as their own separate commits.

## 2026-09-05 — Stage 1 of the PeptIQ parity plan: design system

First of three stages (design system → per-page feature parity → onboarding rebuild). This
one is deliberately all foundation and no new features, so the look can be reviewed before
anything is built on top of it.

**PeptIQ research, this time from their actual web app** (`app.peptiq.io`), not just App
Store screenshots. Two findings changed what we did:

- Their web app is **Expo / React Native Web** — the same codebase as their phone app,
  styled with NativeWind, i.e. literal Tailwind classes. So their design translates almost
  directly into ours, and their App Store screenshots are a faithful web reference.
- Their palette is **Tailwind's own neutral scale**: page `#000000`, card `#171717`,
  border `#262626` (sampled from their shipped screens). Ours was a near-black
  `#0a0a0b`/`#19191c`/`#2a2a2e` — close enough to look accidental rather than intentional.
  Now matched exactly, with the client's blue kept as the accent where they use gold.
- Their type is **Fraunces** (display serif) + **Instrument Sans** (body), confirmed from
  their stylesheet. Adopted both.

**Fonts are self-hosted, not CDN-loaded** (`public/fonts/`, `src/styles/fonts.css`). A CDN
font is the one asset that would silently fall back to a system face exactly when the user
is offline — which for an offline-first PWA is the case we care most about. Workbox's
`globPatterns` already covered `woff2`, so they precache automatically: the build's
precache count went 15 → 19 entries, which is the confirmation that they ship inside the
service worker. Both families are variable fonts, so one file per unicode-range covers
every weight — four files, ~168 KB total, rather than twelve static instances.

**`font-display` is applied to headline slots only** — screen titles, Home's greeting,
empty-state titles, dialog/sheet titles, onboarding questions. Never to numbers, labels, or
body copy: a serif set at 11px in a stat row just looks like a rendering bug.

**Four header patterns became one** (`AppHeader`). There were previously: `ScreenHeader`
(brand icon + text-xl), Home's hero title (text-2xl), and hand-rolled
"Cancel / title / invisible w-16 spacer" bars inside both `ProtocolForm` and
`HistoryEditForm` (text-lg, no brand mark at all — so entering a sub-view silently dropped
the branding). Sub-view mode went through two attempts worth recording: a
`grid-cols-[1fr_auto_1fr]` centred title still drifted 26px at 320px, because Spanish's
"Cancelar" is wider than the column it was allotted. Replaced with an icon-only back
chevron + left-aligned title — the standard mobile pattern, which survives any label length
in any language and needs no measuring. The cancel wording lives on as the button's
`aria-label`.

**New primitives**: `ui/input.tsx` (the identical 130-character class string had been
copy-pasted into six places, so a radius change meant six edits and inevitable drift),
`ui/progress.tsx`, `ui/option-card.tsx` (PeptIQ's icon-badge + label + description + radio
row — the component that makes their onboarding feel considered, because every choice gets
a sentence explaining what picking it means), and `ui/sheet.tsx` (a height-capped,
independently-scrolling bottom sheet, distinct from `ui/dialog.tsx` which is sized for
short confirms). The last two are unused until Stages 2 and 3 — built now because they're
part of the design system, not of any one screen.

`OptionCard` is a real `<button>` with `aria-pressed` rather than a styled `div`: the
existing ad-hoc pickers signalled selection with colour alone, which tells a screen-reader
user nothing.

**Spacing**: page roots all converge on `gap-6 px-4 pb-6 pt-4` (they were a spread of
gap-4/5/6 and pb-6/pb-10). Form sub-views deliberately keep the tighter `gap-5` field
rhythm — that difference is intentional; the drift between *page* roots was not.

Also fixed a small visible glitch spotted while verifying: "+ Agregar otra hora" rendered a
doubled plus, because the locale string carried a literal "+" next to a `Plus` icon.

**Verified live** (headless Chromium/CDP against a production `vite preview`, service
worker and IndexedDB cleared first): `document.fonts` reports both families loaded, `<h1>`
computes to Fraunces, `body` computes to Instrument Sans and `rgb(0, 0, 0)`; walked
onboarding → Home → Calculator → Protocols → History plus the protocol form at 390px and
320px with zero console errors and no horizontal overflow. Regression clean: 83/83 tests,
typecheck, lint, build; i18n parity 187/187.

## 2026-08-28 (later still) — Settings as a floating top button; a real notification panel

Client's follow-up, explicitly asking for full parity even where it means adding
features: (1) Settings should be a floating button pinned to the top of the screen,
staying put while the page scrolls underneath it, not a nav-bar icon; (2) the
notification bell should actually do something, PeptIQ-style.

**Floating Settings button** (`FloatingSettingsButton.tsx`): `position: fixed`, top-right,
rendered once in `App.tsx` so it's present on every screen — not per-screen, and not part
of `TabBar`. Hidden while already on the Settings screen (no reason to navigate to
Settings from Settings). `TabBar` goes back to its original four labelled tabs; `Tab` the
type still includes `'settings'` as a valid screen, `TabBar` just no longer offers a way
to reach it. The app's outer content wrapper (`App.tsx`) now reserves
`calc(env(safe-area-inset-top) + 4rem)` of top padding so no screen's own header content
(the hero card's logo row, each `ScreenHeader`) ever sits under the fixed button — checked
at 320px specifically, since that's the tightest fit (Calculator's two-line title comes
closest but still clears it).

**Notification panel** (`NotificationPanel.tsx`): we don't have a screenshot of PeptIQ's
actual notification screen — only their home card's bell + unread badge — so this is a
from-scratch, honest equivalent rather than a copy: a bottom-sheet dialog (reusing the
existing `Dialog` primitive, which was already sheet-shaped on mobile) listing everything
that actually needs attention right now, fully actionable in place:

- A "turn on notifications" nudge when the browser supports it and permission hasn't been
  asked yet (or the iOS-specific "install first" note), reusing the exact same capability
  check Settings already used — no divergent copy between the two places.
- The backup nudge, if it's been a while (same condition Home already used).
- Every due/missed occurrence across active protocols, rendered as the *exact* same card
  component Home's Catch-up section uses (`DueCard`, now shared, not duplicated) —
  Taken/Skipped work right there in the panel, live-updating through the same Dexie
  `liveQuery` everything else here uses, closing no dialog, requiring no extra step.
- An empty state ("Estás al día") when none of the above apply.

The bell's badge is a real count (dueItems + backup nudge + notification nudge, capped at
display "9+"), not a fabricated unread number — replaces the small "needs attention" dot
from the previous pass, which is now redundant with a real count available.

**Refactor that fell out of this:** `LogButtons`, `DoseCardBody`, and `DueCard` moved out
of `HomeScreen.tsx` into a shared `src/components/DoseCard.tsx`; `contextOf`,
`loggedTimesFor`, `computeStreakDays`, `computeDueItems`, and `computeShowBackupNudge`
moved into a shared `src/lib/homeData.ts`. Both Home and the notification panel now call
the same functions and render the same components — no risk of the two silently
disagreeing about what counts as "due" or how a streak is counted.

**Verified live** (fresh headless Chromium instance + a clean `vite preview` on a
throwaway port, separate from the dev server so as not to disturb it — see the
"mishap" note below): confirmed the floating button is genuinely `position: fixed` (same
screen coordinates before and after scrolling), confirmed it disappears specifically on
the Settings screen, confirmed no overlap with any screen's own header at 320px/390px.
Confirmed the bell's badge count (seeded one due protocol + a fresh browser profile with
no notification permission yet + no backup ever run → badge read "3"), opened the panel,
confirmed all three items rendered correctly, tapped Taken on the due item from inside
the panel, and confirmed both the panel (item removed) and the badge (3 → 2) updated
live without closing/reopening anything. Zero console errors throughout. Full regression
clean: 83/83 tests, typecheck, lint, build; i18n parity 187/187.

**Process mishap, corrected, worth recording:** while starting a throwaway `vite preview`
instance on a separate port for this verification, a `pkill -f "vite$"` intended to stop
a stray dev-server process from earlier testing instead matched and killed the client's
own `npm run dev` server (the one just fixed for the "web app isn't loading" report) —
caught immediately via a routine "is the dev server still up" check, restarted right
away, no further impact. Lesson applied: never pattern-match a kill command against a
bare command name that could match a server the user is actively relying on — target the
specific PID instead once you've confirmed which process it is.

## 2026-08-28 (later) — Home redesign pass for closer PeptIQ UX parity, plus a real bug fix along the way

Client's ask, in two parts: (1) the Next up card's Taken/Skipped buttons appeared to do
nothing when tapped, (2) match PeptIQ's home-screen UX more closely — a notification
button in its top card, a streak counter, Settings as a nav icon rather than a labelled
tab, and its upcoming-dose card layout — while keeping our own feature set.

**The bug, and why it happened:** `getNextOccurrence()` (`schedule.ts`) never looked at
existing dose logs — only `getDueOccurrences`/`getMissedOccurrences` did. Home's "Next
up" card *does* let you log its dose early (tap Taken/Skipped before the reminder time,
matching PeptIQ's own upcoming-dose card), but since the underlying query didn't filter
out already-logged occurrences, the exact same occurrence kept coming back as "next"
after logging it — the write to Dexie succeeded and the toast fired, but nothing on
screen ever changed, which reads as "the button does nothing." Fixed by giving
`getNextOccurrence` the same `loggedAdministeredAt` filter its siblings already had (via
the existing `findUnloggedOccurrences` matcher), and threading Home's dose logs into it.
Two new tests in `schedule.test.ts` cover this directly (logging today's occurrence early
advances "next" to the following day; the unfiltered case is unchanged).

A second, related correctness bug: `LogButtons` always logged against the *occurrence's*
scheduled time. For an already-due item that's a reasonable approximation; for the Next
up card it's wrong — tapping "Taken" at 8pm for a dose reminder-timed at 11pm would have
recorded a dose "administered" three hours in the future. `LogButtons` now takes an
optional `administeredAt`; Catch-up cards still pass the occurrence's scheduled time,
Next-up logging omits it and logs against the real moment of the tap instead.

One more deliberate constraint that falls out of the architecture: this app has no
ScheduledDose table, so "was this occurrence fulfilled" is inferred by same-calendar-day
matching against dose logs (see `findUnloggedOccurrences`'s doc comment). Logging "now"
only correctly cancels out an occurrence scheduled *today* — for a dose several days out
(an everyNDays/weekly/cycling protocol between reminders), logging it "now" would date-
mismatch against its real scheduled day and the card would never register the log against
it. Rather than let that produce a card that *looks* actionable but silently misbehaves,
Next up's log/skip buttons are only shown when its occurrence falls on today
(`canLogToday` in `HomeScreen.tsx`) — verified live (see below).

**Design changes, adapted from PeptIQ's actual screenshots (`/tmp/peptiq-shots/`), not
copied wholesale — kept our own vocabulary and left out anything tied to a banned
feature:**

- **Notification bell** in the hero header, next to the greeting (PeptIQ's spot). Clicking
  it opens Settings' Notifications section. Shows a small dot only when there's something
  to actually act on (permission not yet requested and the platform supports it — the
  same condition Settings already used to decide whether to show its own "enable" button)
  rather than a fabricated unread count; we have no in-app notification inbox to count.
  PeptIQ's top card also has a search icon — left out for now since we don't have an
  obvious destination for it (History already has its own search); can wire it up on
  request.
- **Streak card** ("Racha de N días 🔥"), shown under the hero header once there's a
  logging streak of 1+ days. This is a direct reversal of the earlier deliberate "no
  streak language, no keep it up framing" restraint documented in the 2026-08-27 entry
  below — done at the client's explicit request, same category of call as the protocol
  templates deviation. Kept the copy factual ("you've logged a dose N days in a row.")
  rather than motivational, and it counts *any* logged status (taken or skipped) toward
  the streak, not just taken doses — it's measuring "you're keeping records," not
  rewarding compliance, which is the one framing that stays consistent with a record-
  keeping-only app that must never nudge someone toward taking something. Streak logic
  (`computeStreakDays`) counts consecutive calendar days with a dose log, not resetting
  today's count to zero just because it's morning and nothing's logged yet today.
  Proper i18next plural forms added (`streakTitle_one`/`_other`, `streakBody_one`/
  `_other`) — worth calling out because a first pass without them read "Racha de 1 días"
  (grammatically wrong Spanish), caught in live verification, not by inspection.
- **Settings as an icon-only nav item** (`TabBar.tsx`): the other four tabs keep their
  label; Settings is now icon-only with a divider setting it apart, same idea as PeptIQ
  keeping Settings out of its labelled-tab row. `aria-label` added since the visible text
  is gone.
- **Upcoming-dose card layout**, applied to both Catch up and Next up cards (unified via
  a shared `DoseCardBody`): colored status line + a time pill, icon + protocol name, dose
  + route line, a three-stat row (total logs / last 7 days / day streak — per protocol,
  same `computeStreakDays` helper), the log/skip actions, and a link out to the protocol.
  Left out PeptIQ's injection-site line (no site rotation in this app) and its
  "reschedule in calendar" link (no calendar view) — swapped that last one for "View
  protocol," which does exist. Next up no longer gets a distinct hero treatment (large
  countdown number, tinted background) — it now renders with the same card template as
  Catch up, matching PeptIQ's one consistent card style; the countdown is still shown, in
  the status line instead of as a giant standalone number. **Not done yet, flagged for a
  follow-up if wanted:** PeptIQ actually renders Catch up + Next up as one swipeable
  carousel of cards rather than two separate labelled sections — this pass keeps our
  existing section split and just matches the card design itself.

**Verified live** (headless Chromium via CDP, `/tmp/claude-1000/.../scratchpad/cdp-*.mjs`
— not committed, throwaway scripts): seeded two protocols directly via IndexedDB (one
already due today, one due later today) to exercise both cards without fighting the
onboarding form UI. Confirmed zero console errors throughout; confirmed tapping Taken on
the Catch-up card removes it and updates the doses-today count; confirmed tapping Taken
on the Next-up card (a) actually logs (checked the raw IndexedDB row) against the real
current timestamp, not its future reminder time, (b) makes the streak card appear at 1
day, and (c) correctly advances "Next up" to the following day's occurrence — with its
log/skip buttons now correctly withheld, since that occurrence is no longer today. Also
hit and fixed a real testing pitfall worth recording: a stale service worker from an
earlier build kept serving old JS after a plain reload, masking the plural-forms fix
until it was explicitly unregistered — a good reminder that this app's offline caching is
working as designed, and to always clear SW/caches between test passes, not just rebuild.
Checked 320px and 390px; no overflow or clipping.

## 2026-08-28 — Fix: Storage section trusted the wrong signal, plus an honest backup caveat

Bug report: after installing the app, Settings → Storage kept showing the "not protected
from automatic cleanup" warning instead of switching to the "protected" message.

Root cause: `StorageSection` (`SettingsScreen.tsx`) decided which message to show purely
from `navigator.storage.persisted()`, an async, best-effort API. That's the wrong signal
on its own — most notably on iOS Safari, where the thing that actually exempts a site from
the 7-day no-visit ITP eviction (the specific risk this section exists to warn about) is
adding the app to the Home Screen, not anything `persisted()` reports. iOS Safari commonly
still returns `false`/unsupported for `persisted()` even after a real install, so the
warning never cleared. Chromium/Android's persistence grant is also heuristic and not
reliably tied to the moment of install, so it's not a great primary signal there either.

Fix: `StorageSection` now uses `useInstallState().isStandalone` — the same
`display-mode: standalone` / `navigator.standalone` check `InstallSection` already uses
correctly elsewhere in this file — as the primary condition, OR'd with
`persisted() === true` as a secondary fallback for the rare case a browser grants
persistence without a formal install. `protectedFromCleanup = install.isStandalone ||
persisted === true`.

Also added a new, permanent second line under the status message
(`settings.storage.backupCaveat`, both locales) that says plainly: this only protects
against *automatic* cleanup — uninstalling the app, clearing browser data, or losing the
device still deletes everything, so regular backup (the section right below) is the only
real "no matter what" protection. This directly answers the client's follow-up question
("is installing all that's necessary to keep my data intact?") inside the app itself,
not just in this doc — see HANDOVER.md.

Verified live via headless Chromium/CDP in both directions: (1) simulated standalone mode
by monkey-patching `window.matchMedia` via `Page.addScriptToEvaluateOnNewDocument` (CDP's
`Emulation.setEmulatedMedia` doesn't support overriding `display-mode`), confirmed the
section switches to the "protected" message plus the new caveat text; (2) a fresh,
unpatched tab confirmed the "not protected" message still correctly shows when not
installed — no regression. Zero console errors in either case. Full regression also
re-run clean: 81/81 tests, typecheck, lint, and `npm run build` all pass.

## 2026-08-27 — Design pass: Home hero header + logo placement everywhere

Three specific asks: (1) Home's greeting should show more useful info and be visibly
separated from the content below it, (2) find a place for the actual peptidescr logo
somewhere in the app, (3) audit what's left before client handoff (see HANDOVER.md).

**Home hero header** (`HeroHeader` in `HomeScreen.tsx`) replaces the plain greeting text:
now its own `Card` (distinct surface, clearly separated from the page background and the
due-items/next-dose content below), with a small logo + "peptidescr" wordmark row at top,
then date + time-of-day greeting, then a 2-stat row — active protocol count and doses
logged today — each with its own icon badge. Both stats are neutral counts (no streak
language, no "keep it up" framing) computed live from data already on-screen elsewhere,
not new tracking.

**Logo placement**: added a small `ScreenHeader` component (icon badge + title, optional
action slot) used on Calculator, Protocols, History, and Settings — Home gets the fuller
hero treatment instead of this since it already carries the logo. This gives the app a
consistent, recognizable brand touch on every screen without a heavy persistent top bar,
which would have needed extra layout coordination with the tab bar for comparatively
little benefit.

Verified live: zero console errors across a full click-through in both a normal pass and
at 320px (icon+title+action-button header combinations checked specifically, since that's
the tightest fit) — no overflow, no clipping.

## 2026-08-26 (later still) — Dark theme made permanent, adapted from PeptIQ's colour *structure*

At explicit request: "use their colour scheme but replace colors and logos with
peptidescostarica design." Checked first whether that meant literally their gold, or the
*way* they use colour — confirmed it's the latter (structure, not their literal hex
values), then flagged a real consequence before touching anything: PeptIQ's whole
identity in their actual screenshots is dark-only, but our automatic dark mode from the
previous session only showed dark to users whose OS happens to be set to dark — most
phones ship light by default, so most people (including you, opening this later) would
never have seen the new look. Asked; confirmed: dark is now the app's one, permanent
theme, not conditional on device settings. Light-theme values are kept as a comment in
`tokens.css` in case a light mode is wanted later — nothing deleted, just not active.

**What was adapted from PeptIQ, and how**: sampled actual pixel colors from their real
screenshots (card surface ~#171717, page background nearly black, badges/pills fully
rounded, a bright single accent used for every CTA/active-state/highlight, a soft glow on
their most important card). Rebuilt that *structure* — near-black page, a distinctly
lighter neutral-gray elevated card surface, fully pill-shaped buttons/inputs/badges, a
soft glow on Home's hero "next dose" card and on missed-dose cards — using the client's
own blue (still sourced from their real site/icon, unchanged) as the one accent color
instead of PeptIQ's gold, and the client's own logo (already in place). Nothing in the
new `tokens.css` is PeptIQ's actual color value; only the relationships between
page/card/accent are adapted from what their app actually does.

**Concrete changes**: `tokens.css` rewritten as a single permanent dark palette (no more
`@media (prefers-color-scheme)` block). `theme-color` meta/manifest updated to match
(status bar and OS chrome now dark too) and iOS status-bar style set to
`black-translucent`. All buttons, text inputs, selects, date/time picker triggers, and
segmented toggles across every screen changed from `rounded-xl` to `rounded-full`
(pill-shaped) — bigger multi-line content blocks (cards, explainer callouts, the
disclaimer scroll box) kept a moderate `rounded-2xl` rather than becoming pills, matching
how PeptIQ itself only pills its buttons/badges, not its content cards. Home's hero card
and missed-dose cards gained a colored glow (`shadow-[0_0_...px_var(--brand-primary)]` /
`var(--destructive)`), and the countdown number and greeting got bolder/larger type for
more visual weight.

Verified live: forced the OS `prefers-color-scheme` to `light` in a real headless browser
and confirmed the app still renders fully dark throughout onboarding and all five tabs —
zero console errors, no layout overflow at 320px.

## 2026-08-26 (later) — Layout reference pass against PeptIQ's actual screens

Downloaded PeptIQ's real App Store screenshots (11 images, direct from Apple's CDN — the
App Store listing HTML links straight to them) rather than working from text descriptions,
so this is grounded in what their app actually looks like, not a guess. Looked at all of
them: Home, "in your system" half-life view, Calculator, My Peptides library, compound
reference/dosing-guidelines detail, Protocols/Reminders, Apple Health sync, Protocol
Impact (weight/outcomes charting).

**What I did not copy, on purpose**: their brand identity (dark/gold color scheme, serif
display type, the PeptIQ name/logo) — copying a specific competitor's brand identity
wall-to-wall isn't something I'll do regardless of how the layout request is framed, and
it's separate from "layout" anyway. More importantly, most of their screens are built
entirely around features this app deliberately excludes: half-life/PK decay curves,
injection-site body-mapping, vial/inventory ("Create Vial", "My Stock"), Apple Health/
weight/HRV/sleep sync, an AI tab, a "Community" protocol-sharing tab, and — most
directly in conflict with this brief — a compound reference screen whose entire content
is dosing guidance ("Typical research range: 200–500 mcg... Cadence: 1–2x daily...
Starting Dose: 250–500 mcg daily"). That last one is exactly the "never suggest a dose"
line this app is built around; I didn't adapt any of that screen's content.

**What I did adopt** — genuine structural/layout patterns that don't carry any of the
above baggage, rebuilt with our own content and (still blue/light-dark, unchanged for
now per your note that color comes later):

- **Protocols**: a persistent "My Protocols / Templates" tab pair (their screen has a
  third "Community" tab — dropped, no accounts/sharing here) so templates are browsable
  any time, not just mid-creation. Protocol cards gained pill badges (schedule kind,
  dose), a highlighted "next scheduled dose" sub-card computed live from the same
  schedule engine Home already uses, a missed-count badge, and a logged-count line —
  mirroring their reminders-list card without the vial/stock columns.
- **Home**: swapped the plain "Inicio" title for a date + time-of-day greeting (no name —
  there's no account to personalize with). Due-dose cards gained a colored left-border
  accent (destructive red for missed, primary blue for due-now) and a status badge,
  replacing plain inline text — mirrors their overdue-card treatment.
- **Calculator**: added a dismissible explainer callout (differs for powder vs.
  ready-to-use solution) and a "Reset" action in the header, matching their calculator's
  "What's a vial?" info box and reset control — explaining what a field means, not
  suggesting what to put in it.
- **History**: added All/Taken/Skipped filter pills alongside search, matching the
  filter-pill row on their library screen.

New shared `Badge` component (`src/components/ui/badge.tsx`) for the pill treatment,
used across all four screens above.

## 2026-08-26 — Full modern component system (shadcn/ui + Radix + Motion + lucide)

At explicit request, went well beyond the original stack list: Radix UI primitives,
class-variance-authority, tailwind-merge, clsx, lucide-react, motion (Framer Motion's
successor), react-day-picker, sonner, tw-animate-css. This is a real, deliberate
departure from "ask before adding any dependency not listed" — flagged before starting,
and this was the option chosen after seeing the tradeoffs.

**How it was built**: shadcn's own CLI is broken in this environment (`npx shadcn init`
fails on a missing transitive dependency inside its own installer). Rather than fight a
flaky tool, hand-wrote the component source directly under `src/components/ui/` —
Button, Card, Select, Switch, Dialog, AlertDialog, Popover, Label, Calendar, Sonner
toaster — which is exactly how shadcn is meant to be used anyway (it's a copy-the-source
model, not a runtime package). Composed `DatePicker`/`TimePicker` on top of
Popover+Calendar/Select for app-specific use.

**Real bug this fixed in passing**: the native `<input type="date">`/`<input type="time">`
locale-formatting limitation flagged earlier (device OS locale could show `08/25/2026`
+ AM/PM instead of the required `dd/MM/yyyy` + 24h) is now actually fixed, not just
documented as a known gap — `DatePicker`/`TimePicker` render the app's own format
unconditionally, verified live in a headless browser with the OS locale set to en-US
(previously the failure case) showing correct `26/08/2026` / `08:00`.

**Token architecture**: rather than reshape `tokens.css`, bridged shadcn's standard
semantic vocabulary (`background`, `foreground`, `primary`, `card`, `popover`, `border`,
`ring`, `destructive`, ...) onto the existing `--brand-*` palette in one spot
(`index.css`'s `@theme` block). `tokens.css` is still the one file to edit for a palette
swap; every new component matches shadcn's own published source for anyone checking it
against their docs later, while still reading the client's real brand colors
underneath. Added `--destructive` (a standard delete-action red, not brand-derived,
dark-mode variant included) — distinct from `--brand-warn`'s deliberately non-alarming
measurement-accuracy amber, which is unchanged.

**Existing screens**: kept using the old `--brand-*` Tailwind classes rather than a
mechanical find-replace to the new semantic names — both point at the same underlying
CSS variables, so there's no functional difference, and a blind rename across ~400
occurrences was pure risk for zero behavior change. New/rewritten code (all six screens
did get rewritten as part of this pass, plus every shared component) uses the semantic
names throughout, matching shadcn's own convention.

**Cost, stated plainly**: gzipped JS roughly doubled (117KB → 231KB) — Radix + Motion +
react-day-picker + the rest add up. Verified this doesn't regress correctness (81 tests
still green, zero console errors across a full scripted click-through of onboarding and
all five tabs in both light and dark mode, at 320px and 375px) — it's a real, known
tradeoff for the visual/interaction quality gained, not a mistake. Worth knowing if the
client's customers are frequently on slow connections.

**What's new in the UI itself**: a sliding tab-bar indicator, icons throughout (lucide,
tree-shaken), Motion page/list transitions, toast feedback (dose logged, backup done,
import done/failed) replacing inline status text, AlertDialog-based destructive
confirmations (history delete, backup-import overwrite) replacing the old two-tap inline
pattern, and real `Select`/`Switch`/`Calendar` controls in place of native `<select>` /
checkbox / date-time inputs.

## 2026-08-25 (later still) — UI polish inspired by PeptIQ, without cloning it

Looked at PeptIQ's actual UI (app store listings + their marketing site) before touching
anything. Most of what makes it distinctive is either tied to features this app
deliberately doesn't have (wearable integration badges, dose/outcome trend charts, an
AI coach) or is their own specific brand identity (their colors, their logo, their exact
layout) — copying a competitor's specific look-and-feel isn't something I'll do regardless
of how closely asked, the same way I wouldn't reuse their name. What I *did* pull from it,
because it's a generic, feature-independent pattern rather than their brand:

- **A shared `Card` component** (`src/components/Card.tsx`) with a subtle shadow, applied
  everywhere content was already grouped into a bordered block (Home, Calculator,
  Protocols, History, the template picker) — reads more like the "card-based dashboard"
  convention PeptIQ (and most modern health apps) use. Inactive protocols deliberately
  keep no shadow, so elevation itself doubles as an "active" cue.
- **Home's next-dose card given more visual weight** — tinted background, larger
  countdown text — since it's the single most important thing on the screen, matching the
  "hero metric card" treatment common to that dashboard style.
- **Automatic dark mode**, following `prefers-color-scheme` with no in-app toggle to build
  or maintain (PeptIQ's site specifically calls out dark/light theme options as a
  distinctive feature). Every component already reads color only through the CSS custom
  properties in `tokens.css`, so the entire implementation is one `@media` block there —
  no component changed. Verified visually at 375px in dark mode across Home, Calculator,
  Settings, and the template picker.

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

## Client feedback round (September 2026)

- **Type-to-filter everywhere.** `src/components/ui/combobox.tsx` replaces the Radix `Select`
  in the protocol form, calculator, and the time picker; the date picker is now a typeable
  dd/MM/yyyy input with the calendar behind an icon. Name is free text with suggestions
  (template + compound names). Filtering is accent/case-insensitive and never reorders.
- **Alphabetical.** `compareAlphabetical` in `content/compounds.ts` is the one ordering rule
  (case-insensitive, numeric-aware). Compounds, categories, template list, schedule kinds
  and routes all go through it. The calculator's compound list is now one flat alphabetical
  list (category shown as a hint) instead of grouped by category — grouping and a strict A–Z
  order can't both hold.
- **Custom schedule** (`Schedule.kind === 'custom'`, `dates: yyyy-MM-dd[]`). Picked on an
  inline multi-select month calendar. Saved with `startDate`/`endDate` = first/last picked
  day, so "ongoing"/"next dose" logic needs no special case. Past days can't be newly picked.
- **False "missed" after saving.** `Protocol.trackingStartsAt` (ISO, optional, unindexed —
  no Dexie bump) makes `getOccurrencesInRange` ignore anything scheduled before it. Set on
  create, when the schedule/times/dates change, and on resume from pause (paused days were
  never "missed"). Editing name/dose/route leaves it alone so an unrelated edit can't erase
  a real missed dose.
- **Calculator → protocol.** `Protocol.reconstitution` stores the saved mix (water added,
  draw mL/units, and the dose it was worked out for). Only active protocols for the same
  compound are offered; with none, a "create a protocol" shortcut opens the form with the
  compound preselected. Shown on the protocol card.
- **Reconstitute next.** Saving a *new* protocol shows `ProtocolSavedPrompt` (also in
  onboarding); "Reconstitute now" opens the calculator prefilled from the protocol. The same
  screen offers to turn on notifications if permission hasn't been asked.
- **Notifications.** Root cause of "not working": the only scheduling path was Chromium
  Notification Triggers, which essentially no shipping browser supports — so nothing was
  ever shown on iOS, Android or desktop. Now `startReminderLoop()` (App.tsx) checks every 30s
  and on return-to-foreground, and shows a notification through the service worker
  registration for any unlogged dose that came due in the last 90 min (de-duplicated via
  localStorage). Notification taps focus/open the app (`public/sw-notifications.js`, pulled in
  via `workbox.importScripts`). Settings has a "send test notification" button.
  That loop only works while the app is open/alive — see "Closed-app reminders" below for
  the part that works with the app closed.
- Pre-existing, untouched: `react-hooks/set-state-in-effect` lint error in App.tsx's theme
  effect (`setResolvedTheme`).

## Closed-app reminders (Web Push) — the one server-side piece

A closed PWA can't run a timer, so something off the device has to wake it. There is no way
around a server for this on the web; what we control is what the server knows.

**Design: anonymous, and blind to what the doses are.**
- No accounts. The device asks its browser vendor's push service (FCM / Mozilla / Apple) for
  an anonymous subscription and uploads it, with a list of **future timestamps + an opaque
  tag** ("<protocolId>|<ISO time>"), to `POST /api/push/schedule`.
- The server never receives compound names, doses or protocol names. A scheduled function
  (`push-send`, every minute) pushes `{ "tag": ... }` when a timestamp comes due.
- The service worker (`public/sw-notifications.js`) receives it and rebuilds the visible text
  from the phone's own IndexedDB (name, dose, language). Verified: server data contains none
  of those strings (`pushSchedule.test.ts` asserts it).
- Device → server data: push endpoint + keys, up to 500 timestamps (45 days ahead). The
  device re-uploads on every app open, after saving/pausing/deleting a protocol, and after
  logging a dose (so a dose taken early isn't pushed). If the app isn't opened for 45 days,
  reminders stop.
- Code: `src/lib/push.ts` (client), `src/lib/pushSchedule.ts` (what gets uploaded),
  `netlify/lib/*` (validation + handlers, pure and tested), `netlify/functions/*` (thin
  Netlify wrappers over Netlify Blobs).
- The upload endpoint only accepts real push-service hosts (allowlist in `pushLogic.ts`);
  without that, the function would POST to any URL a caller supplied.
- When push is active the on-open fallback loop stands down (`isPushActive`) so a dose isn't
  announced twice; if the upload fails it takes over again.
- Off unless `VITE_VAPID_PUBLIC_KEY` is set at build time; the app then behaves as before.

**Deploy (Netlify) — one-time:**
1. `npx web-push generate-vapid-keys`
2. Site environment variables: `VITE_VAPID_PUBLIC_KEY` (the public key — needed at *build*
   time), `VAPID_PUBLIC_KEY` (same value), `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
   (e.g. `mailto:someone@peptidescostarica.net`). Keep the private key secret; if it changes,
   existing subscriptions stop working until each device re-opens the app.
3. Deploy. Functions in `netlify/functions` and the every-minute schedule are picked up
   automatically. Scheduled functions only run on published (production) deploys.

**Verified locally, not on Netlify:** real Chrome subscribed through Google's push service; the
real `netlify/lib` handlers (in-memory store instead of Blobs) stored the schedule; a real push
was delivered and produced the notification with the app open *and* with the page closed, in
Spanish. Not verified: Netlify Blobs / scheduled-function behaviour, iOS, Android, Firefox.
Test on a real iPhone (installed to Home Screen, iOS 16.4+) and Android before promising it.

**Known limits:** iOS delivery is best-effort and needs the app installed; a phone in
low-power/"force stopped" state may delay or drop pushes; the sender runs at most once a minute,
so a reminder can be up to ~1 min late; the sender scans every stored device each run, fine for
hundreds of devices — move to a keyed index if it ever needs to be thousands.

**Privacy wording:** Settings now discloses this. `legal.ts` is still placeholder text and must
be updated by the client's lawyer to match ("data stays on your device" is no longer
literally true for the push address and reminder times).
