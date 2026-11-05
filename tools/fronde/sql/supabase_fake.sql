-- Imitation minimale de l'environnement Supabase pour tester les schémas en local (PostgreSQL 16) :
-- rôles anon / authenticated / service_role, auth.users, auth.uid() lu dans request.jwt.claim.sub (comme PostgREST),
-- schéma extensions (pgcrypto), droits par défaut larges sur public (comme Supabase : d'où les « revoke all »),
-- table saves (sauvegardes du jeu, data → savegame → credits).
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema extensions;
create extension pgcrypto with schema extensions;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, extensions, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.saves (user_id uuid primary key references auth.users (id), data jsonb not null, save_version text, updated_at timestamptz not null default now());
-- outil de test : vérifier qu'une requête échoue avec l'erreur attendue
create schema t; grant usage on schema t to anon, authenticated;
create function t.expect(q text, err text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like err || '%' then return; end if;
    raise exception 'attendu « % », obtenu « % » pour : %', err, sqlerrm, q;
  end;
  raise exception 'attendu l''erreur « % », la requête a réussi : %', err, q;
end $$;
grant execute on function t.expect(text, text) to anon, authenticated;
create function t.ok(c boolean, m text) returns void language plpgsql as $$ begin if not coalesce(c, false) then raise exception 'ÉCHEC : %', m; end if; raise notice 'ok — %', m; end $$;
grant execute on function t.ok(boolean, text) to anon, authenticated;
