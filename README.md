# People Manager

**A bookmark manager for the people you meet.** Before a meeting with “Susan”, search for
her and in a few seconds you see her photo, how you met, what she does, the things worth
remembering, and your notes from last time — then add a note while you talk.

People Manager runs on your own computer and you use it in your web browser. Your people
stay in a file or database you choose; nothing is sent anywhere.

![People Manager icon](icon/people_manager.png)

## What it does

- **Tabs → directories → people.** Big groupings as tabs across the top (Clients,
  Networking, Personal…); directories and sub-directories (any depth) in the sidebar; the
  people in a directory shown as cards, with their main photo.
- **A card per person** — photos (up to 5, cropped square), key facts pinned at the top, then
  *Overview · Contact & links · Notes · Details · More*. Only the first name is required;
  several people can share a name.
- **Notes log** you can add to without opening the edit form — made for the middle of a
  conversation.
- **Search** as you type, across every tab: first name, last name, nickname and tags,
  in any case and without needing accents (“ark” finds Mark; “tomas” finds Tomás).
- **Organise by dragging**: press and hold a card or directory, drop it on another directory,
  a tab, or between cards. Or use *Move to…*.
- **Your own fields** (yes/no, one line, a paragraph) with safe ways to remove them later.
- **JSON file, SQLite or MySQL** as the data source — switch in Settings; import, export and
  validate between them.
- **Light, dark, follow-the-system, or your own theme**; optional **login**; **backups**.

## Quick start

```bash
./INSTALL_APP.sh          # installs what is needed (Node.js, jq…), builds the app, runs the tests
./PEOPLE.sh --start       # starts it and opens http://localhost:8400
```

Then create your first tab. To try it with 250 invented people first:
`npm run seed` (into an empty data source).

| | |
| --- | --- |
| `./PEOPLE.sh --help` | start, stop, restart, status, logs, check, test, developer mode |
| `./INSTALL_APP.sh --mysql` | also install a local MariaDB for the MySQL data source |
| `./SETUP_SQLITE_DB.sh` / `./SETUP_MYSQL_DB.sh` | create the database for those data sources |
| `Start_People_Manager.sh` | desktop-app launcher for [my_mac_app](https://github.com/mattwalker75/my_mac_app) (icon in `icon/`) |

**Requirements:** a Mac (built and tested on macOS), Node.js 22 or newer. `INSTALL_APP.sh` installs
Node, `jq` and `sqlite3` with Homebrew if they are missing, and MariaDB with `--mysql`.

## Documentation

| | |
| --- | --- |
| [Docs/USER_GUIDE.md](Docs/USER_GUIDE.md) | Using People Manager: tabs, directories, people, notes, photos, search, moving things, custom fields, themes. |
| [Docs/INSTALLATION.md](Docs/INSTALLATION.md) | Installing, first start, the desktop app, updating, moving to another computer. |
| [Docs/SCRIPTS.md](Docs/SCRIPTS.md) | Every script and option: `PEOPLE.sh`, `INSTALL_APP.sh`, the database setup scripts, the launcher, demo data. |
| [Docs/CONFIGURATION.md](Docs/CONFIGURATION.md) | Every setting in `config.json` and whether it needs a restart. |
| [Docs/DATA.md](Docs/DATA.md) | Data sources (JSON, SQLite, MySQL), switching, import & export, validation, backups, photos, the file format. |
| [Docs/SECURITY.md](Docs/SECURITY.md) | The optional login, network access, and what is and isn't protected. |
| [Docs/ARCHITECTURE.md](Docs/ARCHITECTURE.md) | How it is built: stack, folders, data model, how search and moving work. |
| [Docs/API.md](Docs/API.md) | The HTTP API the web page uses. |
| [Docs/DEVELOPMENT.md](Docs/DEVELOPMENT.md) | Developer mode, tests (including MySQL), conventions, making changes. |
| [CHANGELOG.md](CHANGELOG.md) | What changed, when. |
| [CLAUDE.md](CLAUDE.md) | Notes for an AI assistant working on this code. |

Settings live in `config.json` (created from `config.example.json`, never committed) and are all
editable in the app under **Settings**. Your data lives in `data/` by default (also never
committed).
