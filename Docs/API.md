# HTTP API

The web page is the only client; this is for understanding and debugging. JSON in, JSON out.
Errors are `{ "error": "a sentence for a person", "details"?: … }` with a 4xx/5xx status:
400 invalid input, 401 sign in first, 403 not same-origin, 404 not found, 409 not possible
right now (not empty, not built, already exists…), 413 too large, 421 wrong Host, 422 file has
problems, 429 too many sign-in attempts.

When the login is on, everything except `/api/health` and `/api/auth/*` needs a signed-in
session.

## Health, state, login

| Method & path | |
| --- | --- |
| `GET /api/health` | `{ ok, version }` |
| `GET /api/state` | `{ version, auth, config (MySQL password masked), restartRequired, configFile, dataSource, passwordFile, photosDir, backupsDir, networkUrls }` |
| `GET /api/auth/me` | `{ status: "disabled" \| "not_initialized" \| "unauthenticated" \| "authenticated", loginName? }` |
| `POST /api/auth/setup` | `{ loginName, password }` — create the login (only when none exists) and sign in |
| `POST /api/auth/login` | `{ loginName, password }` |
| `POST /api/auth/logout` | |

## Tabs and directories

| Method & path | |
| --- | --- |
| `GET /api/tabs` | tabs in order |
| `POST /api/tabs` | `{ name }` |
| `PATCH /api/tabs/:id` | `{ name }` |
| `DELETE /api/tabs/:id` | 409 with the contents list unless empty |
| `POST /api/tabs/reorder` | `{ ids: [...] }` — every tab id, in the new order |
| `GET /api/tabs/:id/directories` | `{ directories: [{ …, peopleCount }], topLevelPeople }` — `peopleCount` = directly inside |
| `POST /api/directories` | `{ tabId, parentId?, name, description? }` |
| `PATCH /api/directories/:id` | `{ name?, description? }` |
| `DELETE /api/directories/:id` | 409 unless empty |
| `POST /api/directories/:id/move` | `{ tabId, parentId, index? }` — carries its contents; refuses a move into itself |

## People

| Method & path | |
| --- | --- |
| `GET /api/people?tabId=&directoryId=` | cards (summaries) in order; `directoryId=root` or empty = the tab's top level |
| `GET /api/people/:id` | the whole person plus `path` |
| `POST /api/people` | `{ tabId, directoryId?, firstName, …fields, keyFacts, contacts, links, tags, custom }` |
| `PUT /api/people/:id` | the edit form: same fields (not placement, notes or photos) |
| `DELETE /api/people/:id` | also deletes their photo folder |
| `POST /api/people/:id/move` | `{ tabId, directoryId, index? }` |
| `POST /api/people/:id/notes` | `{ body }` → the note |
| `PATCH /api/people/:id/notes/:noteId` | `{ body }` |
| `DELETE /api/people/:id/notes/:noteId` | |
| `POST /api/people/:id/photos` | multipart, field `photo` (JPEG/PNG/WebP/GIF, ≤ 20 MB) → the person |
| `DELETE /api/people/:id/photos/:photoId` | → the person |
| `POST /api/people/:id/photos/:photoId/main` | → the person |
| `GET /photos/:personId/:filename` | the image file |
| `GET /api/search?q=` | `[{ …summary, path, matchedTag }]` (at most 100) |
| `GET /api/categories` | business categories already used (for suggestions) |

## Custom fields

| Method & path | |
| --- | --- |
| `GET /api/fields` | in order, archived included |
| `POST /api/fields` | `{ name, type: "boolean" \| "text" \| "paragraph" }` |
| `PATCH /api/fields/:id` | `{ name?, type?, archived? }` — yes/no ↔ text only while unused |
| `POST /api/fields/reorder` | `{ ids }` |
| `GET /api/fields/:id/usage` | everyone with a value: `[{ …summary, value, path }]` |
| `DELETE /api/fields/:id` | body `{ purge: true, confirm: "DELETE" }` to delete the values too; otherwise 409 while in use |

## Settings and data source

| Method & path | |
| --- | --- |
| `GET /api/settings` | `{ config, restartRequired, configFile }` |
| `PUT /api/settings` | a partial config (known keys only) → `{ config, restartRequired, dataSource }`; a masked MySQL password means “unchanged” |
| `GET /api/datasource` | status of the source in use: `{ type, ok, needsBuild, message, counts? }` |
| `POST /api/datasource/test` | a `dataSource` object to try without switching → its status |
| `POST /api/datasource/build` | `{}` to build an empty source; `{ rebuild: true, confirm: "REBUILD" }` to erase and rebuild |

## Spreadsheets (CSV)

| Method & path | |
| --- | --- |
| `GET /api/csv/template` | `people-template.csv` (every field, your custom fields, an example row) |
| `GET /api/csv/export?tabId=` | everyone (or one tab) as CSV — template columns + Other… + Tab + Directory |
| `POST /api/csv/preview` | `{ csv, tabId, mapping? }` → `{ columns: [{ index, header, target, sample }], targets, total, ready, skipped, duplicates, warnings, sample, tab }`; 422 with `details: { headers, targets, guessed }` when no column is First name |
| `POST /api/csv/import` | `{ csv, tabId, mapping?, newDirectory?, skipDuplicates?, fileName? }` → `{ importId, added, skipped, warnings, failed, tab, directory, directoryId, backup }` (backs up first) |
| `GET /api/csv/imports` | the last 20 imports `{ id, at, file, tab, directory, count, undone }` |
| `POST /api/csv/imports/:id/undo` | → `{ removed, directoryRemoved }` |

`mapping` is `{ "<column index>": "<target>" }`; targets are listed in the preview (`firstName`,
`phone:Mobile`, `email:*`, `link:LinkedIn`, `otherPhones`, `tags`, `custom:<field id>`, `ignore`…).
CSV bodies may be up to 30 MB.

## Import, export, backups

| Method & path | |
| --- | --- |
| `POST /api/import/validate` | `{ file? }` (default: the JSON source path) → the report |
| `POST /api/import` | `{ file?, mode: "replace" \| "add", confirm: "REPLACE" (replace only) }` |
| `POST /api/export` | `{ file? }` → `{ file, counts }` |
| `GET /api/export/download` | the export as a download |
| `GET /api/backups` | `{ dir, backups: [{ name, bytes, createdAt }] }` |
| `POST /api/backups` | back up now → `{ name, bytes, people }` |
| `GET /api/backups/:name/download` | the zip |
| `DELETE /api/backups/:name` | |
| `POST /api/backups/:name/restore` | `{ confirm: "RESTORE" }` — replaces all data |
| `POST /api/backups/restore-upload` | body = the zip, header `x-confirm: RESTORE` |
