# Installation

## What it needs

| | |
| --- | --- |
| **Node.js 22+** | Runs the app. `INSTALL_APP.sh` installs it with Homebrew if missing. |
| **jq**, **sqlite3** | Used by the database setup scripts. `sqlite3` comes with macOS; `jq` is installed if missing. |
| **MariaDB** (optional) | Only for the MySQL data source: `./INSTALL_APP.sh --mysql`. |
| **Homebrew** (optional) | The easy way to get the above on a Mac: https://brew.sh |
| **Chrome, Edge, Brave or Arc** (optional) | For the desktop-app launcher's own window. Any browser works otherwise. |

## Install

```bash
cd ~/Desktop/REPOs/people_manager
./INSTALL_APP.sh
```

It checks and (with your OK) installs Node.js and jq, installs the app's packages, builds it,
creates `config.json` from `config.example.json`, and runs the tests. `./INSTALL_APP.sh --check`
only reports what is there; `-y` skips the questions. See [SCRIPTS.md](SCRIPTS.md#install_appsh).

## First start

```bash
./PEOPLE.sh --start
```

Your browser opens **http://localhost:8400**. With the default settings:

- the data source is a **JSON file**, `data/people.json`, created when you add your first tab;
- the **login is off** and only **this computer** can open the app.

Create a tab (“Clients”), a directory or two, and add people. Want to look around first?
`npm run seed` fills an empty data source with 250 invented people (see
[SCRIPTS.md](SCRIPTS.md#demo-data)).

Prefer SQLite or MySQL from the start? See [DATA.md](DATA.md#choosing-a-data-source).

## As a desktop app

`Start_People_Manager.sh` starts the server and opens People Manager in its **own window**
(not a browser tab); closing the window stops it. Make it a double-clickable app with
[my_mac_app](https://github.com/mattwalker75/my_mac_app):

```bash
cd ~/Desktop/REPOs/my_mac_app
./mk_mac_app.py --name "People Manager" \
                --script ~/Desktop/REPOs/people_manager/Start_People_Manager.sh \
                --icon ~/Desktop/REPOs/people_manager/icon/people_manager.icns
```

If People Manager is already running (started with `./PEOPLE.sh`), the launcher just opens a
window onto it and leaves it running when you close the window.

## Using it from another device

Settings → General → **Allow other devices on my network**, then `./PEOPLE.sh --restart`. The
page lists the addresses to use (e.g. `http://192.168.1.20:8400`). Read
[SECURITY.md](SECURITY.md) first — consider turning the login on.

## Updating

After pulling new code:

```bash
./INSTALL_APP.sh        # reinstalls packages and rebuilds
./PEOPLE.sh --restart
```

(`./PEOPLE.sh --start` also rebuilds on its own when it sees the code changed.)

## Moving to another computer

1. On the old computer: **Settings → Backups → Back up now** (or Import & export → Export).
2. Copy the backup zip **and the photos folder** (`data/images/`) to the new computer.
3. Install there, put the photos folder back at the same place (Settings → General shows it),
   then **Settings → Backups → Restore from a file…**.

If you use SQLite you can also simply copy `data/people.db` and `data/images/` across.

## Uninstall

Stop it (`./PEOPLE.sh --stop`), then delete the folder. Your data lives in `data/` (and
wherever you pointed the data source in Settings) — keep a copy first if you want it.
