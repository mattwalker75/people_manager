#!/usr/bin/env bash
#
# SETUP_SQLITE_DB.sh — create (or rebuild) the SQLite database for People Manager.
#
# Reads the file name from config.json (dataSource.sqlite.path, relative to this
# folder) and loads schema/sqlite.sql into it. Settings → Data source → Build
# database does the same from inside the app.
#
# Usage:  ./SETUP_SQLITE_DB.sh [options…]
#
#   -y, --yes    Don't ask: install missing tools and erase an existing database file.
#   -h, --help   This help.
#
# Missing tools (sqlite3, jq) are installed with Homebrew — it asks first unless -y.
# Rebuilding ERASES everything in that database. Export or back up first.
# Afterwards choose SQLite in Settings → Data source (or set dataSource.type to
# "sqlite" in config.json).
#
set -uo pipefail
cd "$(dirname "$0")"
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "$0"; }
YES=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -y|--yes)  YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; echo; usage; exit 2 ;;
  esac; shift
done

# ---- install what is missing (Homebrew), asking first unless -y
have() { command -v "$1" >/dev/null 2>&1; }
need() { # need <command> <brew formula> <why>
  have "$1" && return 0
  echo "$1 is not installed ($3)."
  if ! have brew; then echo "Install Homebrew (https://brew.sh), then run:  brew install $2"; exit 1; fi
  if [[ $YES -eq 0 ]]; then read -r -p "Install it now with Homebrew (brew install $2)? [y/N] " a; [[ "$a" == y || "$a" == Y ]] || { echo "Nothing changed."; exit 1; }; fi
  brew install "$2" || { echo "brew install $2 failed."; exit 1; }
  have "$1" || { echo "$1 is still not available after installing $2."; exit 1; }
}
need sqlite3 sqlite "it creates the database file"
need jq jq "it reads config.json"
[[ -f config.json ]] || { echo "config.json not found. Run ./INSTALL_APP.sh (or copy config.example.json to config.json)."; exit 1; }

DB_FILE=$(jq -r '.dataSource.sqlite.path // "./data/people.db"' config.json)
case "$DB_FILE" in "~"*) DB_FILE="$HOME${DB_FILE:1}";; esac

if [[ -f "$DB_FILE" ]]; then
  echo "The database $DB_FILE already exists."
  if [[ $YES -eq 0 ]]; then
    read -r -p "Rebuilding ERASES everything in it. Type REBUILD to continue: " a
    [[ "$a" == "REBUILD" ]] || { echo "Nothing changed."; exit 1; }
  fi
fi

mkdir -p "$(dirname "$DB_FILE")"
rm -f "$DB_FILE" "$DB_FILE-journal" "$DB_FILE-wal" "$DB_FILE-shm"
echo "Creating $DB_FILE from schema/sqlite.sql …"
sqlite3 "$DB_FILE" < schema/sqlite.sql || { echo "Loading the schema failed."; exit 1; }
echo "Done. Choose SQLite in Settings → Data source if it isn't already, and import your people from JSON if you have them."
