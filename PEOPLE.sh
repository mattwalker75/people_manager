#!/usr/bin/env bash
#
# PEOPLE.sh — run People Manager.
#
# Usage:  ./PEOPLE.sh [options…]     options run in the order given, e.g.  ./PEOPLE.sh -x -s
#
#   -s, --start     Start in the background and open it in your browser. Builds the
#                   app first if it has not been built (or the code changed). Does
#                   nothing if it is already running.
#   -x, --stop      Stop the background server.
#   -r, --restart   Stop, then start (needed after changing the port or network access).
#   -i, --status    Is it running? Prints the address and process id.
#   -l, --logs      Follow the server log (Ctrl-C to leave).
#   -f, --fg        Run in the foreground instead (Ctrl-C to stop).
#   -c, --check     Check that everything it needs is in place, and exit.
#   -t, --test      Run the tests.
#   -d, --dev       Developer mode: live-reloading UI at http://localhost:5173 (Ctrl-C to stop).
#   -h, --help      This help.
#
# Bare words work too:  ./PEOPLE.sh start | stop | restart | status | logs | fg | check | test | dev | help
#
# Examples:
#   ./PEOPLE.sh                 start it (same as --start)
#   ./PEOPLE.sh --status        is it running, and where?
#   ./PEOPLE.sh -r              restart after changing the port in Settings
#   ./PEOPLE.sh -x -s           stop, then start, in one go
#   ./PEOPLE.sh --logs          watch what the server is doing
#
# Settings live in config.json next to this script (Settings in the app edits the same
# file). First-time setup on a new computer:  ./INSTALL_APP.sh
# Set PM_NO_OPEN=1 to start without opening the browser.
#
set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$HERE"
mkdir -p "$HERE/data"; PIDFILE="$HERE/data/people.pid"; LOG="$HERE/data/people.log"
if [[ -t 1 ]]; then C_RESET=$'\033[0m'; C_RED=$'\033[0;31m'; C_GRN=$'\033[0;32m'; C_YEL=$'\033[0;33m'; C_BLU=$'\033[0;34m'; else C_RESET=''; C_RED=''; C_GRN=''; C_YEL=''; C_BLU=''; fi
info() { echo "${C_BLU}==>${C_RESET} $*"; }; ok() { echo "${C_GRN}OK ${C_RESET} $*"; }; warn() { echo "${C_YEL}!! ${C_RESET} $*"; }; err() { echo "${C_RED}ERROR${C_RESET} $*" >&2; }
usage() { awk 'NR>=3 { if (/^#/) { sub(/^# ?/, ""); print } else { exit } }' "${BASH_SOURCE[0]}"; }

cfg() { node -e "try{const c=JSON.parse(require('fs').readFileSync('config.json','utf8'));const v=process.argv[1].split('.').reduce((a,k)=>a&&a[k],c);console.log(v===undefined?process.argv[2]:v)}catch{console.log(process.argv[2])}" "$1" "$2" 2>/dev/null || echo "$2"; }
port() { cfg server.port 8400; }
url() { echo "http://localhost:$(port)"; }
running() { [[ -f "$PIDFILE" ]] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; }
node_ok() { command -v node >/dev/null 2>&1 && [[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ]]; }
ENTRY="dist/node/server/src/index.js"

# Build when there is no build yet, or when any source file is newer than the last build.
needs_build() {
  [[ -f "$ENTRY" && -f dist/web/index.html && -f dist/.built ]] || return 0
  [[ -n "$(find web/src web/index.html server/src shared package.json -newer dist/.built -print -quit 2>/dev/null)" ]]
}
build() {
  info "Building People Manager…"
  if npm run build >"$HERE/data/build.log" 2>&1; then touch dist/.built; ok "Built."; else err "The build failed — see data/build.log"; tail -n 25 "$HERE/data/build.log"; return 1; fi
}
prereqs() {
  node_ok || { err "Node.js 22 or newer is needed. Run ./INSTALL_APP.sh"; return 1; }
  [[ -d node_modules/express ]] || { err "The app's packages are not installed. Run ./INSTALL_APP.sh"; return 1; }
  [[ -f config.json ]] || { info "No config.json yet — creating it from config.example.json"; cp config.example.json config.json && chmod 600 config.json; }
  if needs_build; then build || return 1; fi
}

cmd_check() {
  local rc=0
  if node_ok; then ok "Node.js $(node -v)"; else err "Node.js 22+ is required — run ./INSTALL_APP.sh"; rc=1; fi
  if [[ -d node_modules/express ]]; then ok "Packages installed"; else err "Packages not installed — run ./INSTALL_APP.sh"; rc=1; fi
  if [[ -f dist/web/index.html && -f "$ENTRY" ]]; then needs_build && warn "Built, but the code changed since — the next start rebuilds it" || ok "Built"; else warn "Not built yet — the next start builds it"; fi
  if [[ -f config.json ]]; then ok "config.json present (port $(port), network access $(cfg server.allowNetwork false), login $(cfg security.loginEnabled false))"; else warn "config.json will be created from config.example.json on first start"; fi
  local type; type="$(cfg dataSource.type json)"
  case "$type" in
    json)   ok "Data source: JSON file $(cfg dataSource.json.path ./data/people.json)";;
    sqlite) local f; f="$(cfg dataSource.sqlite.path ./data/people.db)"; [[ -f "$f" ]] && ok "Data source: SQLite $f" || warn "Data source: SQLite $f does not exist yet — run ./SETUP_SQLITE_DB.sh or use Build database in Settings";;
    mysql)  ok "Data source: MySQL $(cfg dataSource.mysql.user pm_app)@$(cfg dataSource.mysql.host localhost):$(cfg dataSource.mysql.port 3306)/$(cfg dataSource.mysql.database people_manager) (Settings → Data source can test the connection)";;
  esac
  if running; then ok "People Manager is running — $(url)"; else info "People Manager is not running"; fi
  return $rc
}
cmd_start() {
  if running; then ok "Already running (pid $(cat "$PIDFILE")) — $(url)"; return 0; fi
  prereqs || return 1
  nohup node "$ENTRY" >> "$LOG" 2>&1 & echo $! > "$PIDFILE"
  for _ in $(seq 1 40); do curl -fsS "$(url)/api/health" >/dev/null 2>&1 && break; kill -0 "$(cat "$PIDFILE")" 2>/dev/null || break; sleep 0.25; done
  if curl -fsS "$(url)/api/health" >/dev/null 2>&1; then
    ok "People Manager is running — $(url)   (log: data/people.log)"
    [[ -z "${PM_NO_OPEN:-}" ]] && command -v open >/dev/null 2>&1 && open "$(url)"
  else err "It did not start — the end of data/people.log:"; tail -n 20 "$LOG"; rm -f "$PIDFILE"; return 1; fi
}
cmd_stop() {
  if running; then
    local pid; pid="$(cat "$PIDFILE")"; kill "$pid"
    for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null
    rm -f "$PIDFILE"; ok "Stopped."
  else rm -f "$PIDFILE"; info "Not running."; fi
}
cmd_status() { if running; then ok "Running (pid $(cat "$PIDFILE")) — $(url)"; else info "Not running."; fi; }
cmd_logs() { touch "$LOG"; tail -n 60 -f "$LOG"; }
cmd_fg() {
  running && { err "Already running in the background (pid $(cat "$PIDFILE")); stop it first: ./PEOPLE.sh -x"; return 1; }
  prereqs || return 1
  exec node "$ENTRY"
}
cmd_test() { npx vitest run; }
cmd_dev() {
  running && { err "Stop the background server first: ./PEOPLE.sh -x"; return 1; }
  node_ok && [[ -d node_modules/vite ]] || { err "Run ./INSTALL_APP.sh first."; return 1; }
  [[ -f config.json ]] || { cp config.example.json config.json && chmod 600 config.json; }
  info "Developer mode — open http://localhost:5173 (the UI reloads as you edit; Ctrl-C stops both)"
  exec npm run dev
}

[[ $# -eq 0 ]] && set -- --start
rc=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    -s|--start|start)     cmd_start   || rc=$? ;;
    -x|--stop|stop)       cmd_stop    || rc=$? ;;
    -r|--restart|restart) cmd_stop; sleep 0.5; cmd_start || rc=$? ;;
    -i|--status|status)   cmd_status  || rc=$? ;;
    -l|--logs|logs)       cmd_logs    || rc=$? ;;
    -f|--fg|fg)           cmd_fg      || rc=$? ;;
    -c|--check|check)     cmd_check   || rc=$? ;;
    -t|--test|test)       cmd_test    || rc=$? ;;
    -d|--dev|dev)         cmd_dev     || rc=$? ;;
    -h|--help|help)       usage; exit 0 ;;
    *) err "Unknown option: $1"; echo; usage; exit 2 ;;
  esac
  shift
done
exit $rc
