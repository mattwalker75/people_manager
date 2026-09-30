#!/usr/bin/env bash
#
# Start_People_Manager.sh — launcher for People Manager as a desktop app.
#
# Turn it into a clickable macOS app with my_mac_app:
#
#   cd ~/Desktop/REPOs/my_mac_app
#   ./mk_mac_app.py --name "People Manager" \
#                   --script ~/Desktop/REPOs/people_manager/Start_People_Manager.sh \
#                   --icon ~/Desktop/REPOs/people_manager/icon/people_manager.icns
#
# Behaviour:
#   • Starts the People Manager server (output in LOG) and opens it in a NEW
#     dedicated browser window — its own window, never a tab in your browser.
#   • Closing that window shuts the server down.
#   • If People Manager is already running (say, started with ./PEOPLE.sh), the
#     launcher just opens a window onto it and leaves it running afterwards.
#   • The port comes from config.json (server.port), so changing it in Settings
#     is enough — nothing to edit here.
#   • Prefer a double-click without my_mac_app? Copy this file anywhere as
#     Start_People_Manager.command (the .command ending makes macOS run it in
#     Terminal) and mark it executable:  chmod +x Start_People_Manager.command
#     The Terminal window stays open while the app window is open.
#
# ============================== CONFIG =======================================

APP_NAME="People Manager"                           # used in messages/logs only
# The app's folder. Normally this script lives in it; a copy elsewhere (say
# ~/Desktop/Start_People_Manager.command) falls back to the paths below — edit
# the last one if you keep the app somewhere else.
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ ! -f "$REPO/PEOPLE.sh" ]; then
  for candidate in "$HOME/Desktop/REPOs/people_manager" "$HOME/REPOs/people_manager" "$HOME/people_manager"; do
    if [ -f "$candidate/PEOPLE.sh" ]; then REPO="$candidate"; break; fi
  done
fi
START_CMD="PM_NO_OPEN=1 ./PEOPLE.sh --fg"           # foreground start; the launcher opens the window itself
STARTUP_TIMEOUT=90                                  # seconds (the first start may build the app)
LOG="/tmp/people_manager.log"                       # server output goes here
BROWSER_PROFILE_BASE="/tmp/people_manager_browser"  # per-launch browser profiles are created from this

# =========================== END CONFIG ======================================

set -u
BROWSER_PROFILE="$BROWSER_PROFILE_BASE.$$"
APP_PID=""
REUSED=0

environment_setup() {
  if [ ! -f "$REPO/PEOPLE.sh" ] || [ ! -d "$REPO/server" ]; then
    echo "ERROR: $REPO does not look like the People Manager folder."; exit 1
  fi
  if [ ! -d "$REPO/node_modules" ]; then
    echo "ERROR: the app is not installed yet. Run ./INSTALL_APP.sh in $REPO once."; exit 1
  fi
  PORT="$(node -e 'try{const c=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log((c.server&&c.server.port)||8400)}catch(e){console.log(8400)}' "$REPO/config.json" 2>/dev/null || echo 8400)"
  URL="http://localhost:$PORT"
  if [ -n "$BROWSER_PROFILE_BASE" ]; then
    pkill -f "user-data-dir=$BROWSER_PROFILE_BASE" 2>/dev/null && sleep 2
    rm -rf "$BROWSER_PROFILE_BASE".* 2>/dev/null
  fi
}

find_browser() {
  CHROME=""
  local path
  for path in \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser" \
    "/Applications/Arc.app/Contents/MacOS/Arc"; do
    if [ -x "$path" ]; then CHROME="$path"; break; fi
  done
}

start_app() {
  cd "$REPO" || exit 1
  if curl -sf -o /dev/null --max-time 2 "$URL/api/health"; then
    echo "$APP_NAME is already running at $URL — opening a window onto it."
    REUSED=1; return
  fi
  echo "Starting $APP_NAME..."
  bash -c "$START_CMD" > "$LOG" 2>&1 &
  APP_PID=$!
}

cleanup() {
  echo ""
  if [ "$REUSED" -eq 1 ]; then
    echo "Window closed. $APP_NAME was already running before this launch and stays up (./PEOPLE.sh --stop to stop it)."
  else
    echo "Shutting down $APP_NAME..."
    if [ -n "$APP_PID" ] && kill -0 "$APP_PID" 2>/dev/null; then
      pkill -P "$APP_PID" 2>/dev/null || true
      kill "$APP_PID" 2>/dev/null || true
    fi
    PORT_PIDS="$(lsof -ti :"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [ -n "$PORT_PIDS" ]; then
      # shellcheck disable=SC2086
      kill $PORT_PIDS 2>/dev/null || true; sleep 1
      # shellcheck disable=SC2086
      kill -9 $PORT_PIDS 2>/dev/null || true
    fi
    echo "Stopped."
  fi
  pkill -f "user-data-dir=$BROWSER_PROFILE" 2>/dev/null || true
  rm -rf "$BROWSER_PROFILE" 2>/dev/null
}

wait_for_backend() {
  [ "$REUSED" -eq 1 ] && return
  echo "Waiting for $URL ..."
  local online=0
  for _ in $(seq 1 "$STARTUP_TIMEOUT"); do
    if curl -sf -o /dev/null --max-time 2 "$URL/api/health"; then online=1; break; fi
    if ! kill -0 "$APP_PID" 2>/dev/null; then echo "ERROR: $APP_NAME exited before coming online. Last log lines:"; tail -n 40 "$LOG" || true; exit 1; fi
    sleep 1
  done
  if [ "$online" -ne 1 ]; then echo "ERROR: $URL did not respond within ${STARTUP_TIMEOUT}s. Last log lines:"; tail -n 40 "$LOG" || true; exit 1; fi
}

environment_setup
find_browser
start_app
trap cleanup EXIT INT TERM HUP
wait_for_backend

if [ -n "${PM_LAUNCHER_TEST:-}" ]; then
  echo "TEST MODE: $APP_NAME is online at $URL (pid ${APP_PID:-reused}); closing in ${PM_LAUNCHER_TEST}s."
  sleep "$PM_LAUNCHER_TEST"
elif [ -n "$CHROME" ]; then
  echo "Opening $URL in a dedicated browser window..."
  echo "(Closing that window will stop the app.)"
  "$CHROME" --app="$URL" --user-data-dir="$BROWSER_PROFILE" --no-first-run --disable-background-mode --no-default-browser-check >/dev/null 2>&1
  echo "Window closed."
else
  echo "No Chromium browser found — opening in your default browser."
  echo "The server keeps running until this script is stopped."
  open "$URL"
  if [ -n "$APP_PID" ]; then wait "$APP_PID"; fi
fi
