#!/usr/bin/env bash
#
# SETUP_MYSQL_DB.sh — create the MySQL / MariaDB database and user for People Manager.
#
# Reads everything from config.json (dataSource.mysql):
#   host, port, database, user, password
# and then:
#   1. (re)creates the database with utf8mb4,
#   2. (re)creates the app user and gives it full rights on THAT database only
#      (it needs CREATE/DROP too, so Build database works from Settings),
#   3. loads schema/mysql.sql.
# If the password in config.json is empty, a random one is made and saved there.
#
# Who runs the admin commands:
#   - Local server (localhost / 127.0.0.1): a Homebrew MariaDB lets your own Mac
#     account in through its socket; if that fails it falls back to  sudo mariadb -u root.
#   - Remote server: set MYSQL_ADMIN_PASSWORD (and MYSQL_ADMIN_USER if not root).
#   - Overrides: MYSQL_ADMIN_USER, MYSQL_ADMIN_PASSWORD, MYSQL_SOCKET.
#
# Usage:  ./SETUP_MYSQL_DB.sh [options…]
#
#   -y, --yes    Don't ask: install/start what is missing and erase an existing database.
#   -h, --help   This help.
#
# Examples:
#   ./SETUP_MYSQL_DB.sh
#   MYSQL_ADMIN_PASSWORD='root-password' ./SETUP_MYSQL_DB.sh      (a remote server)
#
# Missing tools (the MariaDB client and server, jq) are installed with Homebrew, and a
# local MariaDB that is not running is started — it asks first unless -y.
# This ERASES the database named in config.json if it exists. Export or back up first.
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
need jq jq "it reads config.json"
if ! have mariadb && ! have mysql; then need mariadb mariadb "the MySQL/MariaDB client and server"; fi
MYSQL=$(command -v mariadb || command -v mysql)
[[ -f config.json ]] || { echo "config.json not found. Run ./INSTALL_APP.sh first."; exit 1; }

DB_HOST=$(jq -r '.dataSource.mysql.host // "localhost"' config.json)
DB_PORT=$(jq -r '.dataSource.mysql.port // 3306' config.json)
DB_NAME=$(jq -r '.dataSource.mysql.database // "people_manager"' config.json)
DB_USER=$(jq -r '.dataSource.mysql.user // "pm_app"' config.json)
DB_PASS=$(jq -r '.dataSource.mysql.password // ""' config.json)
[[ "$DB_NAME" =~ ^[A-Za-z0-9_]+$ ]] || { echo "dataSource.mysql.database must be letters, digits and _ only (got \"$DB_NAME\")."; exit 1; }
[[ "$DB_USER" =~ ^[A-Za-z0-9_.-]+$ ]] || { echo "dataSource.mysql.user must be letters, digits, _ . - only (got \"$DB_USER\")."; exit 1; }

if [[ -z "$DB_PASS" ]]; then
  DB_PASS=$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)
  tmp=$(mktemp) && jq --arg p "$DB_PASS" '.dataSource.mysql.password = $p' config.json > "$tmp" && mv "$tmp" config.json && chmod 600 config.json
  echo "No MySQL password was set — made a random one and saved it in config.json."
fi
SQL_PASS=${DB_PASS//\'/\'\'}

case "$DB_HOST" in localhost|127.0.0.1|::1) MODE=local; USER_HOSTS="localhost 127.0.0.1";; *) MODE=remote; USER_HOSTS="%";; esac

echo "==========================================================="
echo "  MySQL setup for People Manager"
echo "  Server:    $DB_HOST:$DB_PORT ($MODE)"
echo "  Database:  $DB_NAME"
echo "  App user:  $DB_USER"
echo "==========================================================="

# ---- how to run admin statements
ADMIN_USER=${MYSQL_ADMIN_USER:-}
if [[ -n "${MYSQL_ADMIN_PASSWORD:-}" ]]; then export MYSQL_PWD="$MYSQL_ADMIN_PASSWORD"; fi
admin() { "${ADMIN[@]}" "$@"; }
if [[ -n "${MYSQL_SOCKET:-}" ]]; then ADMIN=("$MYSQL" --socket="$MYSQL_SOCKET" -u "${ADMIN_USER:-$(whoami)}")
elif [[ $MODE == remote || -n "${MYSQL_ADMIN_PASSWORD:-}" ]]; then
  [[ -n "${MYSQL_ADMIN_PASSWORD:-}" ]] || { echo "Remote server: set MYSQL_ADMIN_PASSWORD (and MYSQL_ADMIN_USER if not root), then run again."; exit 1; }
  ADMIN=("$MYSQL" -h "$DB_HOST" -P "$DB_PORT" -u "${ADMIN_USER:-root}")
else
  ADMIN=("$MYSQL" -u "${ADMIN_USER:-$(whoami)}")
  if ! echo "SELECT 1;" | admin >/dev/null 2>&1; then
    echo "Your account can't administer the local server directly; using sudo (you may be asked for your Mac password)."
    ADMIN=(sudo "$MYSQL" -u root)
  fi
fi
# a local server that is not running: offer to start it (Homebrew)
if [[ $MODE == local && -z "${MYSQL_SOCKET:-}" ]] && ! "$MYSQL" -u "$(whoami)" -e "SELECT 1" >/dev/null 2>&1 && ! sudo -n true 2>/dev/null; then
  if have brew && ! brew services list 2>/dev/null | grep -Eq '^(mariadb|mysql)[^ ]* +started'; then
    echo "MariaDB is not running on this computer."
    if [[ $YES -eq 1 ]] || { read -r -p "Start it now (brew services start mariadb)? [y/N] " a; [[ "$a" == y || "$a" == Y ]]; }; then
      brew services start mariadb && sleep 3
      ADMIN=("$MYSQL" -u "$(whoami)")
    fi
  fi
fi
echo "SELECT 1;" | admin >/dev/null 2>&1 || { echo "Could not connect to MySQL as an administrator. Is it running?  (brew services start mariadb)"; exit 1; }

if echo "SHOW DATABASES LIKE '$DB_NAME';" | admin -N 2>/dev/null | grep -q .; then
  echo "The database $DB_NAME already exists."
  if [[ $YES -eq 0 ]]; then
    read -r -p "Rebuilding ERASES everything in it. Type REBUILD to continue: " a
    [[ "$a" == "REBUILD" ]] || { echo "Nothing changed."; exit 1; }
  fi
fi

{
  echo "DROP DATABASE IF EXISTS \`$DB_NAME\`;"
  echo "CREATE DATABASE \`$DB_NAME\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
  for h in $USER_HOSTS; do
    echo "DROP USER IF EXISTS '$DB_USER'@'$h';"
    echo "CREATE USER '$DB_USER'@'$h' IDENTIFIED BY '$SQL_PASS';"
    echo "GRANT ALL PRIVILEGES ON \`$DB_NAME\`.* TO '$DB_USER'@'$h';"
  done
  echo "FLUSH PRIVILEGES;"
} | admin || { echo "Creating the database or user failed (see above)."; exit 1; }
echo "Database and user ready. Loading schema/mysql.sql …"
admin "$DB_NAME" < schema/mysql.sql || { echo "Loading the schema failed."; exit 1; }
echo "Done. Choose MySQL in Settings → Data source (Test these settings should say Connected)."
