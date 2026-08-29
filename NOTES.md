# NOTES

Running log of decisions and things the client needs to weigh in on. Newest at top.

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
