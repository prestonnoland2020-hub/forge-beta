#!/usr/bin/env bash
# Apply the whole migration history to a throwaway Postgres and prove the
# things that carry money or privacy actually hold.
#
# A migration that has only been read is a migration that has not been tested.
# This caught two real failures the first time it ran: a SECURITY DEFINER
# function with `search_path = ''` referencing an unqualified `citext` (which
# would have failed on the live database), and a 2024 migration that could no
# longer apply to a fresh one at all.
#
#   bash tools/db-test.sh
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
PGDATA=${PGDATA:-/tmp/pgdata}
PORT=${PGPORT:-5433}
DB=forgecheck
PSQL="psql -h /tmp -p $PORT -U postgres"

if ! $PSQL -c 'select 1' >/dev/null 2>&1; then
  echo "Starting scratch Postgres…"
  [ -d "$PGDATA" ] || su postgres -c "$PGBIN/initdb -D $PGDATA -A trust" >/dev/null
  su postgres -c "$PGBIN/pg_ctl -D $PGDATA -l /tmp/pg.log -o '-k /tmp -p $PORT' start" >/dev/null
  sleep 3
fi

echo "Rebuilding $DB from scratch…"
$PSQL -q -c "drop database if exists $DB;" -c "create database $DB;"
$PSQL -d $DB -q -v ON_ERROR_STOP=1 -f tools/supabase-shim.sql

fails=0
for file in supabase/migrations/*.sql; do
  if out=$($PSQL -d $DB -q -v ON_ERROR_STOP=1 -f "$file" 2>&1); then
    printf '  ok    %s\n' "$(basename "$file")"
  else
    printf '  FAIL  %s\n' "$(basename "$file")"
    echo "$out" | grep -i error | head -3 | sed 's/^/          /'
    fails=$((fails + 1))
  fi
done
[ "$fails" -eq 0 ] || { echo; echo "$fails migration(s) failed"; exit 1; }

echo
echo "Every public table has row-level security:"
$PSQL -d $DB -tAc "
select coalesce(string_agg(relname, ', '), 'yes — none unprotected')
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;" | sed 's/^/  /'

echo
$PSQL -d $DB -q -f tools/rls-test.sql
echo
$PSQL -d $DB -q -f tools/quota-test.sql
