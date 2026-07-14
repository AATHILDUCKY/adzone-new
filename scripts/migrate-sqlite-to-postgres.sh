#!/usr/bin/env sh

set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
PROJECT_DIR="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"
cd "$PROJECT_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command npm
require_command sqlite3
require_command psql

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

SQLITE_DB="${1:-prisma/dev.db}"
if [ ! -f "$SQLITE_DB" ]; then
  echo "SQLite database not found at $SQLITE_DB" >&2
  exit 1
fi

PARSED_DB_INFO="$(node -e '
const raw = process.env.DATABASE_URL;
const url = new URL(raw);
const dbName = url.pathname.replace(/^\/+/, "") || "adzone";
const dbUser = decodeURIComponent(url.username || process.env.USER || "postgres");
const dbPassword = decodeURIComponent(url.password || "");
const dbHost = url.searchParams.get("host") || url.hostname || "localhost";
const dbPort = url.port || "5432";
console.log([dbName, dbUser, dbPassword, dbHost, dbPort].join("\n"));
')"

DB_NAME="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '1p')"
DB_USER="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '2p')"
DB_PASSWORD="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '3p')"
DB_HOST="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '4p')"
DB_PORT="$(printf '%s\n' "$PARSED_DB_INFO" | sed -n '5p')"

run_psql() {
  PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 "$@"
}

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "Generating Prisma client..."
npm run db:generate >/dev/null

echo "Applying PostgreSQL schema..."
npm run db:push >/dev/null

export_csv() {
  table_name="$1"
  select_sql="$2"
  output_file="$TMP_DIR/$table_name.csv"

  sqlite3 \
    -cmd ".headers off" \
    -cmd ".mode csv" \
    -cmd ".nullvalue \\N" \
    -cmd ".once $output_file" \
    "$SQLITE_DB" \
    "$select_sql"
}

copy_csv() {
  table_name="$1"
  columns="$2"
  output_file="$TMP_DIR/$table_name.csv"

  run_psql <<SQL
\copy "$table_name" ($columns) FROM '$output_file' WITH (FORMAT csv, NULL '\N')
SQL
}

sqlite_count() {
  table_name="$1"
  sqlite3 "$SQLITE_DB" "SELECT COUNT(*) FROM \"$table_name\";"
}

postgres_count() {
  table_name="$1"
  run_psql -Atqc "SELECT COUNT(*) FROM \"$table_name\";"
}

echo "Exporting SQLite data..."
export_csv "User" "SELECT \"id\",\"name\",\"email\",\"passwordHash\",\"role\",\"status\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\",CASE WHEN \"updatedAt\" IS NULL THEN NULL WHEN CAST(\"updatedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"updatedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"updatedAt\" END AS \"updatedAt\" FROM \"User\";"
export_csv "Category" "SELECT \"id\",\"name\",\"description\" FROM \"Category\";"
export_csv "Supplier" "SELECT \"id\",\"name\",\"contactPerson\",\"phone\",\"email\",\"address\",\"taxNumber\",\"paymentTerms\",\"leadTimeDays\",\"bankName\",\"bankAccountNumber\",\"notes\",\"status\" FROM \"Supplier\";"
export_csv "Customer" "SELECT \"id\",\"name\",\"phone\",\"email\",\"address\" FROM \"Customer\";"
export_csv "AppMeta" "SELECT \"key\",\"value\",CASE WHEN \"updatedAt\" IS NULL THEN NULL WHEN CAST(\"updatedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"updatedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"updatedAt\" END AS \"updatedAt\" FROM \"AppMeta\";"
export_csv "BannerSizePreset" "SELECT \"id\",\"name\",\"width\",\"height\",\"isActive\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\",CASE WHEN \"updatedAt\" IS NULL THEN NULL WHEN CAST(\"updatedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"updatedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"updatedAt\" END AS \"updatedAt\" FROM \"BannerSizePreset\";"
export_csv "NotificationRecipient" "SELECT \"id\",\"name\",\"email\",\"isEnabled\",\"notificationType\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\",CASE WHEN \"updatedAt\" IS NULL THEN NULL WHEN CAST(\"updatedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"updatedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"updatedAt\" END AS \"updatedAt\" FROM \"NotificationRecipient\";"
export_csv "Product" "SELECT \"id\",\"name\",\"sku\",\"barcode\",\"categoryId\",\"supplierId\",\"unitType\",\"buyingPrice\",\"sellingPrice\",\"currentStock\",\"minimumStockThreshold\",\"rollLengthFeet\",\"rollWidthFeet\",\"isService\",\"materialId\",\"status\",CASE WHEN \"lastRestockDate\" IS NULL THEN NULL WHEN CAST(\"lastRestockDate\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"lastRestockDate\" AS REAL) / 1000.0, 'unixepoch') ELSE \"lastRestockDate\" END AS \"lastRestockDate\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\",CASE WHEN \"updatedAt\" IS NULL THEN NULL WHEN CAST(\"updatedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"updatedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"updatedAt\" END AS \"updatedAt\" FROM \"Product\" ORDER BY CASE WHEN \"materialId\" IS NULL THEN 0 ELSE 1 END, \"createdAt\", \"id\";"
export_csv "SupplierSupplyItem" "SELECT \"id\",\"supplierId\",\"name\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\" FROM \"SupplierSupplyItem\";"
export_csv "SupplierSupplyRecord" "SELECT \"id\",\"supplierId\",\"itemName\",\"quantity\",\"unitPrice\",\"notes\",CASE WHEN \"suppliedAt\" IS NULL THEN NULL WHEN CAST(\"suppliedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"suppliedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"suppliedAt\" END AS \"suppliedAt\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\" FROM \"SupplierSupplyRecord\";"
export_csv "Sale" "SELECT \"id\",\"invoiceNumber\",\"customerId\",\"cashierId\",\"subtotal\",\"discount\",\"total\",\"paidAmount\",\"balance\",\"paymentMethod\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\" FROM \"Sale\";"
export_csv "SaleItem" "SELECT \"id\",\"saleId\",\"productId\",\"quantity\",\"width\",\"height\",\"designerCost\",\"buyingPrice\",\"sellingPrice\",\"discount\",\"total\" FROM \"SaleItem\";"
export_csv "InventoryTransaction" "SELECT \"id\",\"productId\",\"transactionType\",\"quantity\",\"referenceId\",\"reason\",\"performedBy\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\" FROM \"InventoryTransaction\";"
export_csv "StockAlert" "SELECT \"id\",\"productId\",\"currentStock\",\"thresholdValue\",\"status\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\",CASE WHEN \"resolvedAt\" IS NULL THEN NULL WHEN CAST(\"resolvedAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"resolvedAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"resolvedAt\" END AS \"resolvedAt\" FROM \"StockAlert\";"
export_csv "AuditLog" "SELECT \"id\",\"userId\",\"action\",\"module\",\"details\",CASE WHEN \"createdAt\" IS NULL THEN NULL WHEN CAST(\"createdAt\" AS TEXT) GLOB '[0-9]*' THEN strftime('%Y-%m-%dT%H:%M:%fZ', CAST(\"createdAt\" AS REAL) / 1000.0, 'unixepoch') ELSE \"createdAt\" END AS \"createdAt\" FROM \"AuditLog\";"

echo "Replacing PostgreSQL data with SQLite contents..."
run_psql -c 'TRUNCATE TABLE "AuditLog", "StockAlert", "InventoryTransaction", "SaleItem", "Sale", "SupplierSupplyRecord", "SupplierSupplyItem", "Product", "NotificationRecipient", "BannerSizePreset", "AppMeta", "Customer", "Supplier", "Category", "User" RESTART IDENTITY CASCADE;'

copy_csv "User" '"id","name","email","passwordHash","role","status","createdAt","updatedAt"'
copy_csv "Category" '"id","name","description"'
copy_csv "Supplier" '"id","name","contactPerson","phone","email","address","taxNumber","paymentTerms","leadTimeDays","bankName","bankAccountNumber","notes","status"'
copy_csv "Customer" '"id","name","phone","email","address"'
copy_csv "AppMeta" '"key","value","updatedAt"'
copy_csv "BannerSizePreset" '"id","name","width","height","isActive","createdAt","updatedAt"'
copy_csv "NotificationRecipient" '"id","name","email","isEnabled","notificationType","createdAt","updatedAt"'
copy_csv "Product" '"id","name","sku","barcode","categoryId","supplierId","unitType","buyingPrice","sellingPrice","currentStock","minimumStockThreshold","rollLengthFeet","rollWidthFeet","isService","materialId","status","lastRestockDate","createdAt","updatedAt"'
copy_csv "SupplierSupplyItem" '"id","supplierId","name","createdAt"'
copy_csv "SupplierSupplyRecord" '"id","supplierId","itemName","quantity","unitPrice","notes","suppliedAt","createdAt"'
copy_csv "Sale" '"id","invoiceNumber","customerId","cashierId","subtotal","discount","total","paidAmount","balance","paymentMethod","createdAt"'
copy_csv "SaleItem" '"id","saleId","productId","quantity","width","height","designerCost","buyingPrice","sellingPrice","discount","total"'
copy_csv "InventoryTransaction" '"id","productId","transactionType","quantity","referenceId","reason","performedBy","createdAt"'
copy_csv "StockAlert" '"id","productId","currentStock","thresholdValue","status","createdAt","resolvedAt"'
copy_csv "AuditLog" '"id","userId","action","module","details","createdAt"'

echo "Verifying row counts..."
for table_name in \
  User Category Supplier SupplierSupplyItem SupplierSupplyRecord Customer Product \
  AppMeta BannerSizePreset Sale SaleItem InventoryTransaction StockAlert \
  NotificationRecipient AuditLog
do
  sqlite_rows="$(sqlite_count "$table_name")"
  postgres_rows="$(postgres_count "$table_name")"
  if [ "$sqlite_rows" != "$postgres_rows" ]; then
    echo "Count mismatch for $table_name: sqlite=$sqlite_rows postgres=$postgres_rows" >&2
    exit 1
  fi
done

BACKUP_PATH="${SQLITE_DB}.migrated-backup-$(date +%Y%m%d-%H%M%S)"
cp "$SQLITE_DB" "$BACKUP_PATH"
rm "$SQLITE_DB"

echo "Migration complete."
echo "SQLite backup saved to: $BACKUP_PATH"
echo "Original SQLite database removed: $SQLITE_DB"
