# peptidescr

Branded installable PWA for Peptides Costa Rica — dose logging, mixing calculator, and
schedule tracking. No backend, no accounts; all data stays on-device (IndexedDB via
Dexie). See `NOTES.md` for engineering decisions and `HANDOVER.md` for the client-facing
summary.

## Develop

```sh
npm install
npm run dev
```

## Test / typecheck / lint

```sh
npm test
npx tsc -b
npm run lint
```

## Build

```sh
npm run build
npm run preview
```
