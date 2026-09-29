# Configuration — `config.json`

All settings live in one file, `config.json`, next to the scripts. `INSTALL_APP.sh` (or the first
start) creates it from `config.example.json`. **Settings** in the app edits the same file, so
changing it by hand and changing it in the app are the same thing — after a hand edit, restart
(`./PEOPLE.sh --restart`) so the app reads it again.

- Paths are relative to the folder `config.json` is in; `~` means your home folder.
- Keys starting with `_` (like `_comment`) are notes and are ignored.
- Missing keys fall back to the defaults below; unknown keys are kept.
- The file is saved with owner-only permissions (it can hold a MySQL password).
- `PM_CONFIG=/path/to/config.json` makes the server use a different file (scratch setups, tests).

**Restart** = takes effect after `./PEOPLE.sh --restart`. Everything else applies immediately.

## `server`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `port` | `8400` | yes | The port People Manager listens on (1024–65535). |
| `allowNetwork` | `false` | yes | `false`: only this computer can open it (listens on 127.0.0.1). `true`: other devices on your network can too (listens on every interface). See [SECURITY.md](SECURITY.md). |

## `security`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `loginEnabled` | `false` | no | Ask for a login name and password. |
| `passwordFile` | `./.password` | no | Where the login is kept (bcrypt hash, owner-only). No file = you are asked to create a login. Delete it to reset. |
| `sessionHours` | `12` | yes | How long you stay signed in (1–720). |

## `dataSource`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `type` | `json` | no | `json`, `sqlite` or `mysql`. Switching opens the new source at once; it starts empty unless it already holds data. |
| `json.path` | `./data/people.json` | no | The JSON data source file. Created when you first add something. |
| `sqlite.path` | `./data/people.db` | no | The SQLite database file. Needs *Build database* (or `./SETUP_SQLITE_DB.sh`) once. |
| `mysql.host` | `localhost` | no | MySQL / MariaDB server. |
| `mysql.port` | `3306` | no | |
| `mysql.database` | `people_manager` | no | Letters, digits and `_`. |
| `mysql.user` | `pm_app` | no | The app's own database user (`./SETUP_MYSQL_DB.sh` creates it). |
| `mysql.password` | `""` | no | Shown masked in Settings. `./SETUP_MYSQL_DB.sh` fills in a random one if empty. Never included in backups. |

See [DATA.md](DATA.md).

## `photos`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `dir` | `./data/images` | no | Where photo files live (`<dir>/<person id>/<file>`). Changing it does not move existing photos. |
| `maxPerPerson` | `5` | no | Most photos one person can have (1–50). |

## `appearance`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `theme` | `light` | no | `light`, `dark`, `system` (follows your computer), or a custom theme's `id`. |
| `customThemes` | `[]` | no | Themes made in Settings → Appearance: `{ id, name, dark, tokens: { bg, surface, surface-2, ink, ink-2, mute, line, accent, accent-ink, accent-soft, accent-softer, accent-text } }` (colours as `#rrggbb`). |

## `backups`

| Key | Default | Restart | Meaning |
| --- | --- | --- | --- |
| `dir` | `./data/backups` | no | Where *Back up now* writes its zip files. |

## A complete example

```json
{
  "server": { "port": 8400, "allowNetwork": true },
  "security": { "loginEnabled": true, "passwordFile": "./.password", "sessionHours": 12 },
  "dataSource": {
    "type": "sqlite",
    "json": { "path": "./data/people.json" },
    "sqlite": { "path": "~/Dropbox/People/people.db" },
    "mysql": { "host": "localhost", "port": 3306, "database": "people_manager", "user": "pm_app", "password": "" }
  },
  "photos": { "dir": "~/Dropbox/People/images", "maxPerPerson": 5 },
  "appearance": { "theme": "system", "customThemes": [] },
  "backups": { "dir": "./data/backups" }
}
```
