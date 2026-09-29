#!/usr/bin/env bash
#
# INSTALL_APP.sh — set up People Manager on this computer.
#
# What it needs:
#   REQUIRED  Node.js 22 or newer (npm comes with it) — installed with Homebrew if missing.
#   REQUIRED  jq and sqlite3 — used by the database setup scripts (sqlite3 ships with macOS).
#   OPTIONAL  MariaDB, only if you want MySQL as the data source (--mysql).
#   OPTIONAL  Homebrew — the easiest way to install the above on a Mac (https://brew.sh).
#
# Usage:  ./INSTALL_APP.sh [options…]
#
#   (no options)    Check/install Node and jq, install the app's packages, build it,
#                   create config.json from config.example.json, run the tests.
#   -m, --mysql     Also install MariaDB (a MySQL server) with Homebrew and start it.
#   -y, --yes       Don't ask before installing things with Homebrew.
#   -c, --check     Only report what is installed or missing; change nothing.
#   -h, --help      This help.
#
# Examples:
#   ./INSTALL_APP.sh              the usual install (JSON or SQLite data source)
#   ./INSTALL_APP.sh --mysql      …and a local MariaDB for the MySQL data source
#   ./INSTALL_APP.sh -m -y        the same, without questions
#   ./INSTALL_APP.sh --check      just tell me what is missing
#
# Safe to run again at any time — for example after pulling new code (it rebuilds).
# Then:  ./PEOPLE.sh --start
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$HERE"
if [[ -t 1 ]]; then C_RESET=$'\033[0m'; C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'; C_BLU=$'\033[0;34m'; else C_RESET=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; fi
info() { echo "${C_BLU}==>${C_RESET} $*"; }; ok() { echo "${C_GRN}OK ${C_RESET} $*"; }; warn() { echo "${C_YEL}!! ${C_RESET} $*"; }; err() { echo "${C_RED}ERROR${C_RESET} $*" >&2; }
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "${BASH_SOURCE[0]}"; }

WANT_MYSQL=0; YES=0; CHECK_ONLY=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -m|--mysql) WANT_MYSQL=1 ;;
    -y|--yes)   YES=1 ;;
    -c|--check) CHECK_ONLY=1 ;;
    -h|--help)  usage; exit 0 ;;
    *) err "Unknown option: $1"; echo; usage; exit 2 ;;
  esac; shift
done
confirm() { [[ $YES -eq 1 ]] && return 0; read -r -p "$1 [y/N] " a; [[ "$a" == y || "$a" == Y ]]; }
have() { command -v "$1" >/dev/null 2>&1; }
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
brew_install() { # brew_install <formula> <why>
  if [[ $CHECK_ONLY -eq 1 ]]; then return 1; fi
  if ! have brew; then err "Install $1 ($2). The easy way on a Mac is Homebrew (https://brew.sh), then: brew install $1"; return 1; fi
  confirm "Install $1 with Homebrew (brew install $1)?" && brew install "$1"
}

echo "People Manager — install"; echo
# ---- Node.js
if have node && [[ "$(node_major)" -ge 22 ]]; then ok "Node.js $(node -v)"
else
  if have node; then warn "Node.js $(node -v) is too old — 22 or newer is needed"; else warn "Node.js is not installed"; fi
  if brew_install node "to run the app"; then ok "Node.js $(node -v)"; elif [[ $CHECK_ONLY -eq 0 ]]; then err "Node.js 22+ is still not available."; exit 1; fi
fi
# ---- jq and sqlite3 (the setup scripts use them)
if have jq; then ok "jq $(jq --version 2>/dev/null)"; else warn "jq is not installed"; brew_install jq "the database setup scripts read config.json with it" && ok "jq installed"; fi
if have sqlite3; then ok "sqlite3 $(sqlite3 --version | cut -d' ' -f1)"; else warn "sqlite3 is not installed"; brew_install sqlite "for ./SETUP_SQLITE_DB.sh" && ok "sqlite3 installed"; fi
# ---- MariaDB (optional)
if have mariadb || have mysql; then
  ok "MySQL client present ($(command -v mariadb || command -v mysql))"
  if have brew && brew services list 2>/dev/null | grep -Eq '^(mariadb|mysql)[^ ]* +started'; then ok "MariaDB/MySQL server running"
  elif [[ $WANT_MYSQL -eq 1 && $CHECK_ONLY -eq 0 ]] && have brew; then info "Starting MariaDB…"; brew services start mariadb >/dev/null && ok "MariaDB started"
  else info "No local MariaDB/MySQL server running (only needed for the MySQL data source)"; fi
elif [[ $WANT_MYSQL -eq 1 ]]; then
  brew_install mariadb "for the MySQL data source" && { brew services start mariadb >/dev/null && ok "MariaDB installed and started"; }
else info "MariaDB not installed (optional — ./INSTALL_APP.sh --mysql adds it)"; fi

if [[ $CHECK_ONLY -eq 1 ]]; then
  [[ -d node_modules/express ]] && ok "Packages installed" || warn "Packages not installed"
  [[ -f dist/web/index.html ]] && ok "App built" || warn "App not built"
  [[ -f config.json ]] && ok "config.json present" || warn "config.json not created yet"
  exit 0
fi

# ---- packages + build
info "Installing the app's packages…"
if [[ -f package-lock.json ]]; then npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null; else npm install --no-audit --no-fund >/dev/null; fi
node -e "for (const m of ['express','better-sqlite3','mysql2','knex','vite','react']) require.resolve(m)" 2>/dev/null && ok "Packages installed" || { err "A package failed to install — run npm install to see why."; exit 1; }
info "Building…"
mkdir -p data
if npm run build > data/build.log 2>&1; then touch dist/.built; ok "Built"; else err "The build failed — see data/build.log"; tail -n 25 data/build.log; exit 1; fi
# ---- config.json
if [[ -f config.json ]]; then ok "config.json present"
else cp config.example.json config.json && chmod 600 config.json && ok "config.json created from config.example.json"; fi
# ---- tests
info "Running the tests…"
if npx vitest run >data/test.log 2>&1; then ok "Tests pass"; else warn "Some tests failed — see data/test.log (or ./PEOPLE.sh --test)"; fi

echo
echo "Next:  ./PEOPLE.sh --start      (opens http://localhost:$(node -e "try{console.log(require('./config.json').server.port||8400)}catch{console.log(8400)}"))"
[[ $WANT_MYSQL -eq 1 ]] && echo "MySQL: ./SETUP_MYSQL_DB.sh creates the database, then choose MySQL in Settings → Data source."
exit 0
