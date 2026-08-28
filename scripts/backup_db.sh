#!/bin/bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/home/tokki/backups/db}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/tokki_prod_$TIMESTAMP.sql.gz"

mkdir -p "$BACKUP_DIR"

# Dump and compress PostgreSQL database
pg_dump -U tokki_app -h 127.0.0.1 tokki_prod | gzip > "$FILENAME"

# Retain only last 14 days of backups
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -exec rm -f {} \;

echo "Database backup created at $FILENAME"
