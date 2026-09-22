# UPD (USA Peptide Depot)

Branded installable PWA for USA Peptide Depot — dose logging, mixing calculator, and
schedule tracking. No backend, no accounts; all data stays on-device (IndexedDB via
Dexie). Rebranded September 2026 from the original client, Peptides Costa Rica — see
`NOTES.md` for that history. See `NOTES.md` for engineering decisions and `HANDOVER.md`
for the client-facing summary.

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
