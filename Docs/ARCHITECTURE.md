# Architecture

## Stack

| Layer | What |
| --- | --- |
| Server | Node.js 22+, **Express 5**, TypeScript compiled with `tsc` |
| Data sources | a **JSON file** (atomic whole-file writes), **SQLite** (better-sqlite3) and **MySQL/MariaDB** (mysql2), the SQL two through **Knex** (a query builder, not an ORM) |
| Web page | **React 19**, **Vite 8**, **Tailwind CSS v4**, TanStack Query, **dnd-kit** (drag and drop), Radix (dialogs, menus), lucide icons, sonner (toasts), react-easy-crop |
| Fonts | Newsreader (names, headings) and Public Sans (everything else), bundled — no internet needed |
| Login | bcryptjs, cookie-session, express-rate-limit; helmet for headers |
| Tests | Vitest — store, rules and HTTP suites; the store and rules suites also run on MySQL |

## Folders

```
server/src/
  index.ts          start: read config, open the data source, listen
  app.ts            the Express app: security middleware, login gate, every /api route, photos, the built UI
  config.ts         config.json: defaults, deep merge, atomic 0600 save, restart-needed keys, masking
  auth.ts           the optional login (password file, bcrypt, sessions)
  security.ts       Host check, same-origin writes, network addresses
  service.ts        the rules: placement and order, empty-only deletes, moves, search, notes, photos, custom fields
  transfer.ts       validation report, import (replace / add alongside), export (JSON)
  csv.ts            spreadsheets: template, column recognition, preview, import + undo, export (papaparse)
  backups.ts        backup zips and restore
  store/types.ts    the Store interface every data source implements
  store/json.ts     JSON file data source
  store/sql.ts      SQLite + MySQL data source
shared/types.ts     the data model, used by server and page
web/src/
  App.tsx           theme, login screens or the app; hash routes (#/settings/…)
  components/       Shell (layout + drag and drop), TabsBar, Sidebar, MainPane, SearchResults,
                    PersonDialog (+ PersonView, PersonEditor, PhotoPanel, NotesPanel), dialogs, ui, confirm
  settings/         the Settings pages
  lib/              api client, query hooks, shared actions, formatting, themes
schema/             sqlite.sql and mysql.sql — the only place tables are defined
scripts/            seed-demo.ts (invented demo data)
test/               store, service and api suites + helpers
```

## Data model

```
tabs ──< directories (parent_id → directories, any depth)
  │           │
  └──────< people >── person_facts, person_contacts, person_links, person_notes,
                      person_photos, person_tags, custom_values >── custom_fields
```

- **Ids are 12-character random strings** made by the app, not database auto-numbers, so the
  same record keeps its id across JSON, SQLite and MySQL, and photo folders
  (`data/images/<person id>/`) stay attached through export → import.
- `directory_id` / `parent_id` **NULL** = the top level of the tab.
- **Order** is an integer `position` within each group of siblings (directories under one
  parent, people in one place). Moves renumber the old and new groups to 0…n-1.
- `people.search_text` holds first + last + nickname + tags, lower-cased and without accents.
- `meta.schema_version` = 1. The app checks it at start and never runs DDL itself (only Build
  database / the setup scripts load `schema/*.sql`).

## The Store interface

`store/types.ts` defines what every data source provides: list/insert/update/delete for tabs,
directories, people and custom fields; `savePerson` (replace a person's whole record,
including child lists); `placePeople` / `placeDirectories` (bulk position changes);
`searchPeople`; `fieldUsage`; `exportAll` / `replaceAll` / `appendAll`; and `status` /
`build` / `hasSchema`.

Stores are deliberately simple. **All rules live in `service.ts`** — written once for all three
sources. Adding a data source means implementing this interface and one line in
`store/index.ts`.

## How a few things work

**Search.** The query is folded (lower case, accents removed). The store finds people whose
names, nickname or tags contain it (SQL: `search_text LIKE %q%`, with `%` and `_` escaped). The
service then checks whether the **name** matched — if not, it reports the first matching tag
(“matched tag: …”) — builds each result's path from the tab and directory names, and sorts
names that start with the query first.

**Moving.** `movePerson(id, { tabId, directoryId, index })` takes the destination siblings, puts
the person at `index`, renumbers them, and renumbers the place it left.
`moveDirectory` also refuses a move into itself or its own sub-directories, and — when the
tab changes — carries every nested directory and person to the new tab.

**Empty-only deletes.** The service counts everything nested, and the refusal names the first
five direct children (directories first) and how many more there are.

**Drag and drop (page).** One `DndContext` wraps the tabs, sidebar and main area. The pointer
sensor starts a drag after a ~250 ms press (so clicks still open things). Person cards are
*sortable* within their grid; sidebar directories are draggable and are *drop targets*, as are
the tab's top-level row and the tabs.
`Shell.onDragEnd` turns “what was dropped on what” into a move call (see the table in the user
guide).

**Settings.** `PUT /api/settings` accepts only known keys (types checked), merges them into
`config.json`, reopens the data source if it changed, and returns which changed keys still
need a restart (`server.port`, `server.allowNetwork`, `security.sessionHours`).

**Photos.** The page crops to a square JPEG (at most 1000 px) before uploading. The server
keeps the original file name with spaces as underscores (and `_1`, `_2` on a clash), writes it
under `<photos dir>/<person id>/`, and records it on the person.

## Request flow

```
browser ──► hostGuard ──► helmet ──► json ──► cookie-session ──► sameOriginWrites
        ──► /api/health, /api/auth/*  (always open)
        ──► login gate (401 when the login is on and you're not signed in)
        ──► /api/* routes ──► Service ──► Store (JSON | SQLite | MySQL)
        ──► /photos/:person/:file
        ──► dist/web (the built page; every other path gets index.html)
```
