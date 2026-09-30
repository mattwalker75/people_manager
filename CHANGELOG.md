# Changelog

All notable changes to People Manager (Keep a Changelog style; dates are when the change was made).

## [Unreleased]

### Changed
- 2026-09-29: The header's green *Add person* button is gone — *Add person here* in the main area
  does the same and says where the person goes. *New directory* and *Add person here* are now
  the green buttons.
- 2026-09-29: The tab's name is no longer repeated inside the tab: the sidebar's first row and
  the location line say **Top level** instead (the location line is hidden at the top level itself).

### Changed
- 2026-09-29: **Phone numbers take shape as you type** on the person form: `5125550148` becomes
  `(512) 555-0148` digit by digit; anything past the tenth digit becomes the extension
  (`11122233334444` → `(111) 222-3333 x4444`); `+1` or a `1` set apart by a space is the country
  code (`+1 (512) 555-0148`); a typed extension (`x204`) is kept. Numbers starting with another
  country's `+` code are left as typed.

### Fixed
- 2026-09-29: A directory's ⋯ menu in the sidebar jumped to the top-left corner of the window as
  soon as the mouse left the row — the button it is attached to was removed on mouse-out. The
  button now stays (faded in) while its menu is open; a card's ⋯ likewise.

### Added
- 2026-09-29: **People from and to spreadsheets (CSV)** — Settings → Import & export.
  *Download CSV template* (every field, LinkedIn/Facebook/Instagram/X/TikTok/YouTube/Website link
  columns, your own fields, a self-skipping example row). *Import*: pick a CSV and a tab; columns
  are matched automatically (the template, LinkedIn's Connections.csv including its preamble,
  Google Contacts, Outlook, common variants, your field names) and can be corrected; preview with
  rows ready / skipped / names already there (optionally skipped) / unreadable dates and the first
  ten people; only First Name required; people land at the tab's top level or a new directory;
  automatic backup first; **Undo this import** (also from *Recent imports*). *Export*: everyone or
  one tab, the template's columns plus Other phones/emails/addresses/links, Tab and Directory — an
  export re-imports cleanly. Excel-friendly files (UTF-8 marker, CRLF). 24 new tests.

### Changed
- 2026-09-29: **Viewing a photo** opens it in a floating window on top of the card (with ‹ › and
  the arrow keys to step through that person's photos) instead of a new browser tab. The menu item
  is now **View photo** (first in the list), and clicking the big photo views it too.
- 2026-09-29: The **⋯ menu for a tab** now sits inside the selected tab, next to its name.
- 2026-09-29: The **main area shows people only** — directories live only in the sidebar. To move
  someone, press and hold their card and drop it on a directory in the sidebar (or a tab). The
  empty-directory message points to the sidebar when the directory has sub-directories.
- 2026-09-29: **Lighter dark theme** — from near-black (#0e1312) to a "dimmed" charcoal-teal
  (#1a201f page, lighter #222928 / #293130 surfaces) in the #121212–#1E1E1E band Material and
  GitHub recommend, with off-white text and a slightly brighter accent.

### Added
- 2026-09-29: **Documentation.** High-level `README.md` linking into `Docs/`: USER_GUIDE,
  INSTALLATION, SCRIPTS, CONFIGURATION, DATA (sources, import/export, validation, backups,
  photos, file format), SECURITY, ARCHITECTURE, API, DEVELOPMENT (incl. running the tests on a
  private MariaDB); `CLAUDE.md` with the design and spec decisions and the rules behind them.
- 2026-09-29: **Scripts and icon.** `INSTALL_APP.sh` (installs Node.js and jq with Homebrew if
  missing, MariaDB with `--mysql`, then packages, build, `config.json`, tests; `--check`, `--yes`),
  `PEOPLE.sh` (`-s/--start -x/--stop -r/--restart -i/--status -l/--logs -f/--fg -c/--check
  -t/--test -d/--dev -h/--help`, bare words too, rebuilds when the code changed),
  `SETUP_SQLITE_DB.sh` and `SETUP_MYSQL_DB.sh` (read `config.json`, offer to install missing
  tools and start a stopped local MariaDB, REBUILD confirmation, random app password if none,
  admin via your own socket account / sudo / `MYSQL_ADMIN_PASSWORD`), `Start_People_Manager.sh`
  (desktop-app launcher for my_mac_app), and the app icon (`icon/`: .icns, .png, .svg source).
- 2026-09-29: **Web UI — the "C · Atelier" design Matt chose.** Tabs across the top (rename,
  reorder, delete-when-empty), the tab's directories as a tree in the sidebar (directories only,
  counts include everything inside), the selected directory's sub-directories as tiles and its
  people as cards with their main photo. Press-and-hold drag and drop (reorder cards and tiles;
  drop on a directory, the sidebar or a tab to move) plus *Move to…*. Live search across all tabs
  with paths and "matched tag". The person card: photo column (up to N photos, crop to square,
  set main, delete) with *At a glance*, key-fact tiles, and sticky section tabs (Overview ·
  Contact & links · Notes · Details · More); edit form for every field including tags and custom
  fields; save with Undo; notes log with quick add, edit and delete. Settings: General, Security
  (login on/off, setup and sign-in screens), Data source (switch, test, build/rebuild), Import &
  export (validation report, replace / add alongside, export, download), People fields (rename,
  type, reorder, archive, the three delete flows), Appearance (light, dark, system, custom
  themes with live preview), Backups — each setting marked "Applies immediately" or "Needs
  restart". Typed-word confirmations for destructive actions. Also: per-directory people counts
  and business-category suggestions from the server; `npm run seed` demo-data generator
  (invented people, three Mark Joneses, generated portraits).

### Fixed
- 2026-09-29: The built server crashed at start because Knex's named export isn't visible to
  plain Node ESM (only under the test runner) — it now uses the default export.
- 2026-09-29: With the login on and no login created yet, the page showed *Sign in* instead of
  *Create your login* — it now asks the always-open `/api/auth/me` first.
- 2026-09-29: Filled buttons had dark text (an unlayered CSS reset beat Tailwind's utilities);
  long email addresses overflowed their card.

### Added (earlier)
- 2026-09-29: **Server and data layer.** Data model (tabs → nested directories → people,
  with key facts, labelled phones/emails/addresses, named links, a notes log, up to N photos,
  free-form tags and custom fields). Three interchangeable data sources behind one interface —
  a JSON file, SQLite and MySQL/MariaDB (Knex) — with hand-written schemas in `schema/`.
  Rules: first name is the only required field, duplicate names allowed, tabs and directories
  must be empty to delete (the refusal names the first five items and how many more), moves
  across directories and tabs (a directory carries everything inside it), search on names,
  nickname and tags (case- and accent-insensitive, anywhere in the word, "matched tag" shown),
  custom fields with safe type changes, archive, and the clear-one-by-one / delete-with-values
  flows. Optional login in the my_business_manager style (`.password` bcrypt file, delete it to
  reset), Host and same-origin guards, settings saved to `config.json` with restart-needed
  reporting, JSON validation report + import (replace or add alongside) + export, and manual
  backups (zip without photos or the MySQL password). 57 tests across all three data sources.
