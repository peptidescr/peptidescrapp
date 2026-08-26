# HANDOVER — peptidescr

Short client-facing summary. Full engineering log is in `NOTES.md`.

## What this is

A branded installable web app (PWA) for tracking peptide reconstitution math and dosing
schedules. No accounts, no cloud — all data lives on the customer's own device. Installs
from a link on peptidescostarica.net, works offline once installed.

## Status

_Updated as build steps land — see the top of NOTES.md for the latest step._

## What I need from you

1. **Deploy target**: I need either (a) a Cloudflare Pages or Netlify account you create
   and add me to, or (b) for you to connect this repo yourself once I hand it over and
   push the first deploy. Tell me which and I'll proceed.
2. **Logo files**: final red atom mark as a square SVG (and ideally a 512×512 PNG) to
   replace the placeholder in `public/brand/`.
3. **Legal wording**: Disclaimer/Terms text from your lawyer — see `src/content/legal.ts`
   for the placeholder and the specific contradiction that needs resolving (your site says
   "research use only, not for human use"; this app logs personal injections).
4. **WhatsApp/contact numbers**: confirmed in the brief, already wired in — flag if any of
   these change: WhatsApp `+506 8404-6973`, CR `+506 8404-6973`, US `+1 (831) 471-5559`,
   `info@peptidescostarica.net`.

## What's intentionally not in this build

Accounts/login, cloud sync, inventory tracking, calendar grid, visual syringe graphics,
injection site rotation, protocol templates, custom compounds, titration, progress
photos, weight/side-effect tracking, cost tracking, PDF export, and anything AI. If any
of these turn out to matter, they're Phase 2 conversations, not omissions.
