# Community library

One JSON file per library entry, `<id>.json`. Everything here ships in every build.

To publish a mod once its author approves:

1. Move its file from `src/data/library-pending/` to `src/data/library/`.
2. Fill its provenance: `author`, `licence`, `source` (the thread URL, or short text), `posted` (YYYY-MM-DD, if known) and `role` (`library`, or `both` to preload it on a new visitor's home too).
3. Run `npm run credits` to regenerate `docs/CREDITS.md`, and `npm run library` to check it has no errors; `npm test` fails until both pass.

`src/data/library-pending/` is gitignored. Its entries appear in `npm run dev`, and in a build only with `VITE_INCLUDE_PENDING=1 npm run build`; a plain `npm run build` leaves them out.
