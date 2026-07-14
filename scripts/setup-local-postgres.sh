#!/usr/bin/env sh

set -eu

CURRENT_USER="$(id -un)"
DB_NAME="${1:-adzone}"
DB_USER="${2:-$CURRENT_USER}"
DB_PASSWORD="${3:-adzone_local_dev}"

echo "Starting local PostgreSQL service..."
sudo service postgresql start

echo "Ensuring PostgreSQL role '${DB_USER}' exists..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${DB_USER}'" | grep -q 1; then
  sudo -u postgres createuser --login "${DB_USER}"
fi

echo "Ensuring PostgreSQL password is set for '${DB_USER}'..."
sudo -u postgres psql -c "ALTER ROLE \"${DB_USER}\" WITH LOGIN PASSWORD '${DB_PASSWORD}';"

echo "Ensuring database '${DB_NAME}' exists and is owned by '${DB_USER}'..."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1; then
  sudo -u postgres createdb "${DB_NAME}" -O "${DB_USER}"
else
  sudo -u postgres psql -c "ALTER DATABASE \"${DB_NAME}\" OWNER TO \"${DB_USER}\";"
fi

echo "Local PostgreSQL is ready for user '${DB_USER}'."
