# Scripts

Everything a person runs lives at the top of the folder. Every script prints its full help
with `-h` / `--help`, and every option has a short (`-s`) and a long (`--start`) form.

| Script | For |
| --- | --- |
| [`INSTALL_APP.sh`](#install_appsh) | first-time setup, and after pulling new code |
| [`PEOPLE.sh`](#peoplesh) | start, stop, status, logs, checks, tests, developer mode |
| [`SETUP_SQLITE_DB.sh`](#setup_sqlite_dbsh) | create or rebuild the SQLite database |
| [`SETUP_MYSQL_DB.sh`](#setup_mysql_dbsh) | create the MySQL / MariaDB database and user |
| [`Start_People_Manager.sh`](#start_people_managersh) | desktop-app launcher (for my_mac_app) |
| [`npm run seed`](#demo-data) | fill a data source with invented demo people |

## INSTALL_APP.sh

```
./INSTALL_APP.sh [options…]

  (no options)    Check/install Node and jq, install the app's packages, build it,
                  create config.json from config.example.json, run the tests.
  -m, --mysql     Also install MariaDB (a MySQL server) with Homebrew and start it.
  -y, --yes       Don't ask before installing things with Homebrew.
  -c, --check     Only report what is installed or missing; change nothing.
  -h, --help      This help.
```

Safe to run again at any time. Build output goes to `data/build.log`, test output to
`data/test.log`.

## PEOPLE.sh

```
./PEOPLE.sh [options…]     options run in the order given, e.g.  ./PEOPLE.sh -x -s

  -s, --start     Start in the background and open it in your browser. Builds the
                  app first if it has not been built (or the code changed). Does
                  nothing if it is already running.
  -x, --stop      Stop the background server.
  -r, --restart   Stop, then start (needed after changing the port or network access).
  -i, --status    Is it running? Prints the address and process id.
  -l, --logs      Follow the server log (Ctrl-C to leave).
  -f, --fg        Run in the foreground instead (Ctrl-C to stop).
  -c, --check     Check that everything it needs is in place, and exit.
  -t, --test      Run the tests.
  -d, --dev       Developer mode: live-reloading UI at http://localhost:5173 (Ctrl-C to stop).
  -h, --help      This help.
```

- No option = `--start`. Bare words work too: `./PEOPLE.sh restart`.
- The background server's process id is in `data/people.pid`, its log in `data/people.log`.
- `PM_NO_OPEN=1 ./PEOPLE.sh --start` starts without opening the browser.
- The port comes from `config.json` (`server.port`).

## SETUP_SQLITE_DB.sh

```
./SETUP_SQLITE_DB.sh [options…]

  -y, --yes    Don't ask: install missing tools and erase an existing database file.
  -h, --help   This help.
```

Creates the file named in `config.json` (`dataSource.sqlite.path`, default `data/people.db`)
from `schema/sqlite.sql`. If `sqlite3` or `jq` is missing it offers to install it with
Homebrew. If the file exists you must type **REBUILD** (or pass `-y`) — rebuilding erases it.
**Settings → Data source → Build database** does the same from inside the app.

## SETUP_MYSQL_DB.sh

```
./SETUP_MYSQL_DB.sh [options…]

  -y, --yes    Don't ask: install/start what is missing and erase an existing database.
  -h, --help   This help.
```

Reads `dataSource.mysql` (host, port, database, user, password) from `config.json`, then:

1. offers to install **jq** and **MariaDB** with Homebrew if they are missing, and to start a
   local MariaDB that isn't running;
2. (re)creates the **database** (utf8mb4);
3. (re)creates the **app user** with full rights on that database only (it needs CREATE/DROP
   so *Build database* works from Settings) — for a local server both `user@localhost` and
   `user@127.0.0.1`, for a remote one `user@%`;
4. loads `schema/mysql.sql`.

If the password in `config.json` is empty it makes a random 24-character one and saves it
there (the file stays owner-only).

**Who runs the admin statements:**

| Situation | How |
| --- | --- |
| Local server (localhost / 127.0.0.1) | your own Mac account through MariaDB's socket (Homebrew's default); if that is refused, `sudo mariadb -u root` |
| Remote server | `MYSQL_ADMIN_PASSWORD='…' ./SETUP_MYSQL_DB.sh` (and `MYSQL_ADMIN_USER` if not `root`) |
| Anything else | `MYSQL_SOCKET=/path/to.sock` and/or `MYSQL_ADMIN_USER` override the above |

An existing database needs **REBUILD** typed (or `-y`) — it is erased.

## Start_People_Manager.sh

The desktop-app launcher. Starts the server (`./PEOPLE.sh --fg`), waits for it, and opens a
dedicated Chrome/Edge/Brave/Arc window; closing the window stops the server. If the server
was already running, it only opens a window and leaves the server alone. Log:
`/tmp/people_manager.log`. See [INSTALLATION.md](INSTALLATION.md#as-a-desktop-app).
`PM_LAUNCHER_TEST=5` runs it for 5 seconds without a browser (used in testing).

## Demo data

```bash
npm run seed                          # 250 invented people into the data source in config.json
npm run seed -- --people 1000         # more
npm run seed -- --no-photos           # without the generated portrait photos
npm run seed -- --force               # even if the data source already has people (adds, never deletes)
PM_CONFIG=/tmp/x/config.json npm run seed   # into a scratch setup instead of yours
```

Creates four tabs (Clients, Networking, Personal, and an empty Vendors), nested directories,
people with contacts, links, key facts, notes, tags, custom fields and (for about half of them)
simple generated portraits. Everything is invented — 555 phone numbers, `.example` addresses —
and three people are deliberately called Mark Jones. It refuses to add to a data source that
already has people unless you pass `--force`.
