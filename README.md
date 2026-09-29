# UPD (USA Peptide Depot) / Peptides CR

Branded installable PWA — dose logging, mixing calculator, and schedule tracking. No
backend, no accounts; all data stays on-device (IndexedDB via Dexie). See `NOTES.md` for
engineering decisions and `HANDOVER.md` for the client-facing summary.

One codebase, two branded builds, each deployed as its own site on its own subdomain:

| Brand | `VITE_BRAND` | Languages | Look |
| --- | --- | --- | --- |
| USA Peptide Depot | `upd` (default) | English only | forest green, Archivo/Manrope |
| Peptides Costa Rica | `pcr` | Spanish (default) + English | navy/sky blue, Montserrat/Instrument Sans |

Everything brand-specific lives in `src/brand/` (config in `brands.ts`, contact card in
`index.ts`, `tokens.css`/`fonts.css` per brand), `public/<brand>/` (icons, logo, fonts),
and `src/content/legal.ts`. Screens and logic are shared.

## Develop

```sh
npm install
npm run dev:upd   # or dev:pcr  (plain `npm run dev` = upd)
```

## Test / typecheck / lint

```sh
npm test
npx tsc -b
npm run lint
```

## Build

```sh
npm run build:upd   # or build:pcr
npm run preview
```

`npm run build` builds whichever brand `VITE_BRAND` names (default `upd`) — that's what
each Netlify site runs, with `VITE_BRAND` set in the site's environment.
