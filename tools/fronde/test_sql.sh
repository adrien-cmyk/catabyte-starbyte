#!/bin/sh
# Teste server/schema_mp_v41_grande_fronde.sql sur une base PostgreSQL locale qui imite Supabase.
# Usage : PGHOST=… PGPORT=… tools/fronde/test_sql.sh   (base « fronde_test » recréée à chaque fois)
set -e
cd "$(dirname "$0")/../.."
psql -U postgres -q -c 'drop database if exists fronde_test' -c 'create database fronde_test'
for r in anon authenticated service_role; do psql -U postgres -q -c "drop role if exists $r" 2>/dev/null || true; done
psql -U postgres -d fronde_test -q -v ON_ERROR_STOP=1 -f tools/fronde/sql/supabase_fake.sql
psql -U postgres -d fronde_test -q -v ON_ERROR_STOP=1 -f server/schema_mp_v41_grande_fronde.sql
psql -U postgres -d fronde_test -q -v ON_ERROR_STOP=1 -f server/schema_mp_v41_grande_fronde.sql   # relançable sans risque
psql -U postgres -d fronde_test -q -v ON_ERROR_STOP=1 -f server/schema_mp_v42_fronde_social.sql
psql -U postgres -d fronde_test -q -v ON_ERROR_STOP=1 -f server/schema_mp_v42_fronde_social.sql   # relançable sans risque
out=$(mktemp); st=0
psql -U postgres -d fronde_test -v ON_ERROR_STOP=1 -f tools/fronde/sql/test_v41.sql > "$out" 2>&1 || st=$?
[ $st = 0 ] && { psql -U postgres -d fronde_test -v ON_ERROR_STOP=1 -f tools/fronde/sql/test_v42.sql >> "$out" 2>&1 || st=$?; }
grep -E 'ok —|ERROR|ÉCHEC|TOUS' "$out" | sed 's/^psql:[^:]*:[0-9]*: //; s/^NOTICE:  //'; rm -f "$out"
exit $st
