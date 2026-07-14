#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$SCRIPT_DIR"

STAMP_DIR=".run-cache"
mkdir -p "$STAMP_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

# Print a stable checksum for a file (empty string if the file is missing).
checksum_file() {
  [ -f "$1" ] || { echo ""; return 0; }
  if command -v sha1sum >/dev/null 2>&1; then
    sha1sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum "$1" | awk '{print $1}'
  elif command -v md5sum >/dev/null 2>&1; then
    md5sum "$1" | awk '{print $1}'
  else
    cksum "$1" | awk '{print $1"-"$2}'
  fi
}

# Return 0 (do work) when the tracked file changed since the last recorded
# stamp, 1 (skip) when it is unchanged.
needs_update() {
  _key="$1"
  _file="$2"
  _stamp="$STAMP_DIR/$_key.sha"
  _now="$(checksum_file "$_file")"
  if [ -f "$_stamp" ] && [ "$(cat "$_stamp")" = "$_now" ]; then
    return 1
  fi
  return 0
}

record_stamp() {
  checksum_file "$2" > "$STAMP_DIR/$1.sha"
}

# Ensure PostgreSQL (server + psql client) is installed, installing it via the
# system package manager when it is missing.
ensure_postgres_installed() {
  if command -v psql >/dev/null 2>&1; then
    return 0
  fi

  echo "PostgreSQL not found. Attempting to install it..."

  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then
    if command -v sudo >/dev/null 2>&1; then
      SUDO="sudo"
    else
      echo "PostgreSQL is missing and neither root nor sudo is available to install it." >&2
      echo "Please install PostgreSQL manually and re-run this script." >&2
      exit 1
    fi
  fi

  if command -v apt-get >/dev/null 2>&1; then
    $SUDO apt-get update
    $SUDO apt-get install -y postgresql postgresql-client
  elif command -v dnf >/dev/null 2>&1; then
    $SUDO dnf install -y postgresql-server postgresql
  elif command -v yum >/dev/null 2>&1; then
    $SUDO yum install -y postgresql-server postgresql
  elif command -v pacman >/dev/null 2>&1; then
    $SUDO pacman -Sy --noconfirm postgresql
  elif command -v zypper >/dev/null 2>&1; then
    $SUDO zypper install -y postgresql-server postgresql
  elif command -v brew >/dev/null 2>&1; then
    brew install postgresql
  else
    echo "Could not detect a supported package manager to install PostgreSQL." >&2
    echo "Please install PostgreSQL manually and re-run this script." >&2
    exit 1
  fi

  if ! command -v psql >/dev/null 2>&1; then
    echo "PostgreSQL installation did not provide the 'psql' command." >&2
    exit 1
  fi
  echo "PostgreSQL installed successfully."
}

# List PIDs currently listening on a TCP port.
port_listener_pids() {
  _port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -t -iTCP:"$_port" -sTCP:LISTEN 2>/dev/null || true
  elif command -v fuser >/dev/null 2>&1; then
    fuser "$_port"/tcp 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
  elif command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | awk -v p=":$_port" '$4 ~ p"$"' \
      | grep -o 'pid=[0-9]*' | cut -d= -f2 || true
  fi
}

# Free the dev port if a *previous instance of this app* is still holding it.
# A foreign process on the same port is reported and left untouched so we never
# kill something unrelated.
free_dev_port() {
  _port="$1"
  _pids="$(port_listener_pids "$_port")"
  [ -n "$_pids" ] || return 0

  for _pid in $_pids; do
    _cmd="$(ps -p "$_pid" -o args= 2>/dev/null || true)"
    case "$_cmd" in
      *server.ts*|*next*dev*|*"npm run dev"*|*react-example*)
        echo "Port $_port is held by a stale Adzone dev server (pid $_pid). Stopping it..."
        kill "$_pid" 2>/dev/null || true
        ;;
      *)
        echo "Port $_port is in use by another process (pid $_pid):" >&2
        echo "  $_cmd" >&2
        echo "Stop it or set a different PORT in .env, then re-run." >&2
        exit 1
        ;;
    esac
  done

  # Wait for the port to actually free up (SIGTERM, then SIGKILL as a fallback).
  _tries=0
  while [ "$_tries" -lt 20 ]; do
    [ -z "$(port_listener_pids "$_port")" ] && return 0
    _tries=$((_tries + 1))
    sleep 0.25
  done
  for _pid in $(port_listener_pids "$_port"); do
    kill -9 "$_pid" 2>/dev/null || true
  done
}

require_command node
require_command npm

if [ ! -f ".env" ] && [ -f ".env.example" ]; then
  cp .env.example .env
  echo "Created .env from .env.example"
fi

if [ ! -f ".env" ]; then
  echo "Missing .env file" >&2
  exit 1
fi

set -a
. ./.env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is not set in .env" >&2
  exit 1
fi

APP_PORT="${PORT:-3000}"

PARSED_DB_INFO="$(node -e '
const raw = process.env.DATABASE_URL;
let dbName = "adzone";
let dbUser = process.env.USER || "postgres";
let dbHost = "localhost";
let dbPassword = "adzone_local_dev";

const socketStyleMatch = raw.match(/^postgres(?:ql)?:\/\/([^@/?#:]+)(?::[^@/?#]*)?@\/([^?]+)(?:\?(.*))?$/);

if (socketStyleMatch) {
  dbUser = decodeURIComponent(socketStyleMatch[1] || dbUser);
  dbName = decodeURIComponent((socketStyleMatch[2] || dbName).replace(/^\/+/, ""));
  const params = new URLSearchParams(socketStyleMatch[3] || "");
  dbHost = params.get("host") || dbHost;
} else {
  const url = new URL(raw);
  dbName = url.pathname.replace(/^\/+/, "") || dbName;
  dbUser = decodeURIComponent(url.username || dbUser);
  dbPassword = decodeURIComponent(url.password || dbPassword);
  dbHost = url.searchParams.get("host") || url.hostname || dbHost;
}

console.log([dbName, dbUser, dbHost, dbPassword].join("\n"));
')"

DB_NAME="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '1p')"
DB_USER="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '2p')"
DB_HOST="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '3p')"
DB_PASSWORD="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '4p')"

# Connection string without the "?schema=..." query, which libpq/psql rejects.
CLEAN_DB_URL="${DATABASE_URL%%\?*}"

# True when we can already open a connection to the target database.
db_reachable() {
  command -v psql >/dev/null 2>&1 || return 1
  PGCONNECT_TIMEOUT=3 psql "$CLEAN_DB_URL" -c 'SELECT 1' >/dev/null 2>&1
}

# --- Dependencies (only when package-lock.json changed) ---------------------
if [ ! -d node_modules ] || needs_update deps package-lock.json; then
  echo "Installing dependencies..."
  npm install
  record_stamp deps package-lock.json
else
  echo "Dependencies already up to date. Skipping npm install."
fi

# --- Local PostgreSQL (only when the database is not already reachable) ------
case "$DB_HOST" in
  /var/run/postgresql|localhost|127.0.0.1)
    if db_reachable; then
      echo "Database '$DB_NAME' already exists and is reachable. Skipping PostgreSQL bootstrap."
    else
      ensure_postgres_installed
      require_command sudo
      require_command service
      echo "Preparing local PostgreSQL database '$DB_NAME' for user '$DB_USER'..."
      sh ./scripts/setup-local-postgres.sh "$DB_NAME" "$DB_USER" "$DB_PASSWORD"
    fi
    ;;
  *)
    echo "Skipping local PostgreSQL bootstrap because DATABASE_URL points to '$DB_HOST'."
    ;;
esac

# --- Prisma client + schema (only when schema.prisma changed) ----------------
if [ ! -d node_modules/.prisma/client ] || needs_update schema prisma/schema.prisma; then
  echo "Generating Prisma client..."
  npm run db:generate
  echo "Applying database schema..."
  npm run db:push
  record_stamp schema prisma/schema.prisma
else
  echo "Prisma client and schema already up to date. Skipping generate/push."
fi

echo "Seeding database..."
npm run db:seed

# --- Make sure the dev port is free, then start ------------------------------
free_dev_port "$APP_PORT"

echo "Starting Adzone..."
exec npm run dev
