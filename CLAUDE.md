# CLAUDE.md — working on People Manager

Read this before changing anything. `Docs/` has the detail.

## What it is
A local, single-user "bookmark manager for people": tabs → nested directories → people cards,
a rich person card, search on names/nickname/tags, drag-and-drop organising. Runs on Matt's
Mac, used in the browser. Server: Node 22+ / Express 5 / TypeScript. Page: React 19 + Vite +
Tailwind v4 + dnd-kit + Radix. Data: JSON file, SQLite or MySQL behind one Store interface.
The person using it is not a developer — every message the page shows is a plain sentence.

## Map
- `server/src/service.ts` — ALL rules (placement/order, empty-only deletes, moves, search,
  notes, photos, custom fields). `store/json.ts`, `store/sql.ts` (SQLite + MySQL via Knex) only
  read and write. `app.ts` routes + guards; `config.ts`; `auth.ts`; `transfer.ts`; `backups.ts`.
- `shared/types.ts` — the data model used by both sides.
- `web/src/components/Shell.tsx` — layout + drag and drop; `PersonDialog.tsx` — the card;
  `settings/` — Settings pages; `lib/actions.tsx` — shared create/move/delete with confirms.
- `schema/sqlite.sql`, `schema/mysql.sql` — the only place tables are defined.

## Rules that exist for a reason
1. **Matt's chosen design** ("C · Atelier", mockups artifact LjBq3FZo5n4Q1qab6EfzYH): tabs on top,
   sidebar = directories ONLY, people as CARDS in the main area; person card = photo column +
   key-fact tiles + section tabs (Overview · Contact & links · Notes · Details · More), tab bar
   sticky, right side scrolls. Newsreader + Public Sans, teal accent. Keep it.
2. **Spec decisions:** first name is the only required field; duplicate names allowed; display
   `First Last (Nickname)` (brackets only with a nickname); tabs/directories delete only when
   empty and the refusal lists the first 5 items then "…and N more"; tags are free-form,
   lower-cased, searchable, shown ONLY in Edit; ≤ `photos.maxPerPerson` photos (default 5)
   with crop; notes = dated log with quick add, edit, delete; search = case- and
   accent-insensitive substring on first/last/nickname/tags with "matched tag".
3. **Photos never go into exports, imports or backups** (they can be GBs) — say so in the UI.
   Files: `<photos.dir>/<personId>/<original name with spaces→underscores>`, `_1`… on clash.
4. **Ids are app-made strings**, never auto-numbers, so records keep ids across sources.
5. **The app never runs DDL on its own**: Build database / SETUP_*_DB.sh load schema/*.sql;
   `meta.schema_version` is checked. Schema change = both .sql files + version + JSON store +
   validator + Docs/DATA.md.
6. **Login like my_business_manager**: `.password` JSON `{loginName, passwordHash}` bcrypt 0600;
   missing file → setup screen; deleting it resets without touching data; per-boot session key.
   Login on/off is a setting; network access is separate (Matt wants LAN use without login).
7. **Every config key is editable in Settings** and marked Applies immediately / Needs restart
   (`RESTART_REQUIRED` in config.ts). New key checklist in Docs/DEVELOPMENT.md.
8. **Destructive actions** need a typed word (REBUILD / REPLACE / RESTORE / DELETE) in the page AND
   the server checks it.
9. **Colours come from theme tokens only**; base CSS stays in `@layer base` (an unlayered rule
   once overrode every button's text colour).
10. **knex is CommonJS**: import its default export (`store/sql.ts`); the named import works under
    Vitest but crashes plain Node.
11. **Scripts:** `-x`/`--long` options + bare words + `-h`; keep them idempotent and plain-spoken.
    Setup scripts offer to install missing tools with Homebrew (ask first unless `-y`).
12. **Testing:** `npm test` (plus `PM_TEST_MYSQL=…` against a THROWAWAY MariaDB — see
    Docs/DEVELOPMENT.md). Test by hand on a scratch config (`PM_CONFIG=…`, another port), never on
    Matt's `config.json` / `data/`. Headless-Chrome checks: Radix menus open on pointerdown, not
    `.click()`; drag needs a press held ~250 ms.
13. **Commits:** one per feature with a dated CHANGELOG entry; explicit `git add <paths>`; never
    push — Matt pushes. Keep README high-level; details in Docs/.
