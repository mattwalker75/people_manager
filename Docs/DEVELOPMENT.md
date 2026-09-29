# Development

## Run it while you work

```bash
./PEOPLE.sh --dev        # UI with live reload at http://localhost:5173, server restarts on change
```

(Vite serves the page and forwards `/api` and `/photos` to the server on the port in
`config.json`.) Or build and run as a user would: `npm run build && ./PEOPLE.sh --fg`.

A scratch setup that never touches your own data:

```bash
mkdir -p /tmp/pm && cat > /tmp/pm/config.json <<'EOF'
{ "server": { "port": 8411 }, "dataSource": { "type": "sqlite", "sqlite": { "path": "./data/people.db" } } }
EOF
mkdir -p /tmp/pm/data && sqlite3 /tmp/pm/data/people.db < schema/sqlite.sql
PM_CONFIG=/tmp/pm/config.json npx tsx scripts/seed-demo.ts --people 300
PM_CONFIG=/tmp/pm/config.json node dist/node/server/src/index.js
```

## Commands

| | |
| --- | --- |
| `npm run build` | page (`dist/web`) and server (`dist/node`) |
| `npm run typecheck` | server and page type-checks |
| `npm test` | all tests |
| `npm run dev` | what `./PEOPLE.sh --dev` runs |
| `npm run seed` | demo data (see [SCRIPTS.md](SCRIPTS.md#demo-data)) |

## Tests

`test/` holds three suites (Vitest):

| File | Covers |
| --- | --- |
| `store.test.ts` | the Store contract, on every data source: tabs, directories, full person round-trip, placement, search, custom fields, export / replace / append, a SQLite file that isn't built, a damaged JSON file |
| `service.test.ts` | the rules, on every data source: first name required, duplicate names, search (substring, case, accents, tags, matched tag), empty-only deletes and their message, moves (people, directories across tabs, into itself), notes, photos (names, clashes, limit, main, deletion), custom fields (type changes, archive, usage, delete flows) |
| `csv.test.ts` | dates, column recognition (template, LinkedIn, Google, Outlook), the template and its skipped example row, preview (duplicates, skipped rows, warnings, nothing saved), import (top level or a new directory, backup first, first name only), undo, corrected column choices, Google label/value pairs, `;` files with a byte-order mark, and export → import round trips — on every data source |
| `api.test.ts` | the HTTP app: login off/on (setup, sign in/out, wrong password, reset by deleting the file), Host and same-origin guards, settings (restart-needed, masked password, file permissions), switching JSON → SQLite + build + validate + import (replace and add) + export, validation errors/warnings, backups (contents, restore, upload, delete) |

**MySQL.** The store and rules suites also run on MySQL when `PM_TEST_MYSQL` is set to
`host:port:user:password:database`. **Point it at a throwaway database — the tests rebuild it.**
A private MariaDB that doesn't touch your real one:

```bash
D=/tmp/pm-mariadb; mkdir -p $D
mariadb-install-db --datadir=$D/data --auth-root-authentication-method=socket --skip-test-db
mariadbd --no-defaults --datadir=$D/data --port=3399 --bind-address=127.0.0.1 --socket=/tmp/pm_mdb.sock &
mariadb --socket=/tmp/pm_mdb.sock -u "$(whoami)" -e "CREATE DATABASE pm_test; CREATE USER 'pm_test'@'127.0.0.1' IDENTIFIED BY 'pw'; GRANT ALL ON pm_test.* TO 'pm_test'@'127.0.0.1';"
PM_TEST_MYSQL=127.0.0.1:3399:pm_test:pw:pm_test npm test
```

## Conventions

- **Rules in `service.ts`, storage in the stores.** A new rule is written once; a store only
  reads and writes.
- **Schema only in `schema/*.sql`.** A change there means: both files, bump `schema_version`
  (and `SCHEMA_VERSION` in `store/sql.ts`), the JSON store, `shared/types.ts`, the validator in
  `transfer.ts`, and a note in [DATA.md](DATA.md) — plus a way for people to move their data
  (export → rebuild → import works for any change).
- **Messages are sentences for a person** (“That directory is in another tab.”) — they are
  shown as-is.
- **Config keys:** a default in `config.ts → DEFAULTS`, a line in `config.example.json`, a row in
  [CONFIGURATION.md](CONFIGURATION.md), handling in `app.ts → settingsPatch`, a field in Settings,
  and `RESTART_REQUIRED` if it only applies at start.
- **Destructive actions** ask for a typed word in the page *and* check it on the server.
- **Theme tokens only.** Components use the token colours (`bg`, `surface`, `ink`, `accent`…),
  never literal colours, so every theme works.
- **Commits:** one per feature with a dated `CHANGELOG.md` entry. Don't push — Matt pushes.

## Adding a standard person field

1. `shared/types.ts` — `PersonFields` and `EMPTY_FIELDS`.
2. Both schemas (a new column) + schema version; `service.ts → personInput` (validation).
3. `PersonEditor.tsx` (the form) and `PersonView.tsx` (Details / wherever it shows).
4. The file format in [DATA.md](DATA.md) and the user guide.
