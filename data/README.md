# data/

Everything you store lives here by default, and none of it is committed to git:

| Path | What it is |
| --- | --- |
| `people.json` | the JSON data source (when Settings → Data source is JSON) |
| `people.db` | the SQLite data source (when it is SQLite) |
| `images/<person id>/` | photos of each person |
| `backups/` | zips made by Settings → Backups (photos not included) |
| `people.log`, `people.pid` | the server log and process id while it runs in the background |

Every location can be changed in Settings (or `config.json`).
