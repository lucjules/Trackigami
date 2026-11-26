#!/usr/bin/env bash
# Teste supabase/etape21-recuperation.sql (code de secours, COMPLETE-003) sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape21-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest21) : étapes 1 à 20, des comptes et des données, PUIS l'étape 21 (deux fois : relançable). Chaque menace du modèle
# (supabase/COMPTES.md, « Changer et récupérer son mot de passe ») a ici son contrôle :
#   M1 énumération : pseudo inconnu, compte sans code, pseudo verrouillé et mauvais code donnent la MÊME réponse, avec un bcrypt calculé (durées comparables) ;
#   M2 force brute : verrou après 5 échecs par pseudo (le bon code est alors refusé aussi), par adresse (20), plafond global, essais simultanés sérialisés ;
#   M3 rejeu : usage unique, deux sessions simultanées avec le bon code (une seule passe), nouveau code = l'ancien ne vaut plus rien, sessions révoquées ;
#   M4 fuite : seul un haché bcrypt est stocké (contrainte), ni le code ni son empreinte n'apparaissent dans aucune table, journal sans code ni adresse ;
#   M5 session volée : créer un code exige une authentification par mot de passe de moins de 10 min (revendication amr) ;
#   droits : tables fermées à anon et authenticated, fonctions du serveur fermées au jeu ; aucune donnée existante touchée ; verify-prod.sql.
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
cd "$(dirname "$0")/.."
DB=copytrack_sqltest21
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
cat > "$TMP/stub.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
-- Supabase installe pgcrypto dans « extensions » et en accorde l'usage à ces rôles (la fonction serveur, elle, passe par les fonctions SECURITY DEFINER de l'étape).
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false,
  encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
-- Comme GoTrue : un jeton de renouvellement dépend de sa session (supprimée : jetons supprimés).
create table auth.refresh_tokens (id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean default false,
  session_id uuid references auth.sessions (id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
-- Droits par défaut d'un projet Supabase : tout objet créé dans public est accordé à anon, authenticated, service_role (l'étape doit les retirer elle-même).
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
SQL
$P -d $DB -f "$TMP/stub.sql"
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite 18-maintenance 19-avis 20-droits-et-regles; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

cat > "$TMP/avant.sql" <<'SQL'
\set ON_ERROR_STOP off
-- Objets d'ESSAI dans un schéma à part : verify-prod.sql ne regarde que « public » (il ne doit signaler aucun de nos outils de test).
create schema t21;
grant usage on schema t21 to public;
create table t21.res21 (name text, ok boolean);
grant all on t21.res21 to public;
create function t21.check21(n text, c boolean) returns void language plpgsql security definer as $$ begin insert into t21.res21 values (n, coalesce(c, false)); end $$;
grant execute on function t21.check21(text, boolean) to public;
-- Exécute q ; -1 si elle échoue (droit refusé, exception).
create function t21.ok21(q text) returns boolean language plpgsql as $$ begin execute q; return true; exception when others then return false; end $$;
grant execute on function t21.ok21(text) to public;
-- Comptes : Alice et Bob (comptes), Gus (invité anonyme).
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a1', 'alice@accounts.copytrack.invalid', '{"username":"Alice"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob_2@accounts.copytrack.invalid', '{"username":"Bob_2"}');
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e5', 'cleo@accounts.copytrack.invalid', '{"username":"Cleo"}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000c3', true);
insert into public.players (id, name) values ('00000000-0000-0000-0000-0000000000a1', 'Alice'), ('00000000-0000-0000-0000-0000000000c3', 'Gus');
insert into public.cloud_saves (user_id, data) values ('00000000-0000-0000-0000-0000000000a1', '{"profile":{"coins":7}}');
insert into public.scores (track_key, player, time, inputs, phys_ver) values ('b-x-1', '00000000-0000-0000-0000-0000000000a1', 30.5, 'IN', 39);
create table t21.photo21 as select 'accounts' t, md5(string_agg(x::text, '|' order by x::text)) h from (select * from accounts) x
  union all select 'cloud_saves', md5(string_agg(x::text, '|' order by x::text)) from (select * from cloud_saves) x
  union all select 'players', md5(string_agg(x::text, '|' order by x::text)) from (select * from players) x
  union all select 'scores', md5(string_agg(x::text, '|' order by x::text)) from (select * from scores) x
  union all select 'auth.users', md5(string_agg(x::text, '|' order by x::text)) from (select * from auth.users) x;
SQL
$P -d $DB -f "$TMP/avant.sql" > "$TMP/avant.out" 2>&1 || true
# verify-prod.sql AVANT l'étape : ses lignes « étape 21 » disent MANQUE.
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp-avant.txt"

# L'étape, DEUX fois (relançable), définitions identiques entre la 2e et la 3e passe.
$P -d $DB -f supabase/etape21-recuperation.sql >/dev/null
$P -d $DB -f supabase/etape21-recuperation.sql >/dev/null
DEF="select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.proname)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'recovery%'"
DEF1="$($P -d $DB -At -c "$DEF")"
$P -d $DB -f supabase/etape21-recuperation.sql >/dev/null
DEF2="$($P -d $DB -At -c "$DEF")"

# verify-prod.sql sur la base COMPLÈTE (étapes 1 à 21), avant tout objet d'essai.
$P -d $DB -At -F'|' -f supabase/verify-prod.sql | grep -vE '^étape 22' > "$TMP/vp.txt"          # (les lignes de l'étape 22, appliquée après, sont éprouvées par test-etape22-sql.sh)

cat > "$TMP/apres.sql" <<'SQL'
\set ON_ERROR_STOP off
-- Sessions du jeu : set_config de sub (auth.uid() du faux schéma) ET de request.jwt.claims (amr, comme PostgREST).
create function t21.as21(u uuid, amr_age_s int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false);
  perform set_config('request.jwt.claims', case when amr_age_s is null then json_build_object('sub', u)::text
    else json_build_object('sub', u, 'amr', json_build_array(json_build_object('method', 'password', 'timestamp', floor(extract(epoch from now())) - amr_age_s)))::text end, false);
end $$;
grant execute on function t21.as21(uuid, int) to public;
create function t21.sha21(t text) returns text language sql as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
grant execute on function t21.sha21(text) to public;
create table t21.codes21 (who text primary key, code text);
grant all on t21.codes21 to public;

select t21.check21('aucune donnée touchée par l''étape : accounts, cloud_saves, players, scores, auth.users identiques (empreinte de chaque table)',
  not exists (select 1 from t21.photo21 p join (
    select 'accounts' t, md5(string_agg(x::text, '|' order by x::text)) h from (select * from accounts) x
    union all select 'cloud_saves', md5(string_agg(x::text, '|' order by x::text)) from (select * from cloud_saves) x
    union all select 'players', md5(string_agg(x::text, '|' order by x::text)) from (select * from players) x
    union all select 'scores', md5(string_agg(x::text, '|' order by x::text)) from (select * from scores) x
    union all select 'auth.users', md5(string_agg(x::text, '|' order by x::text)) from (select * from auth.users) x) n on n.t = p.t where n.h is distinct from p.h));

-- ---- Droits
select t21.check21('droits : les trois tables ont la RLS et aucun droit pour anon ni authenticated',
  (select bool_and(c.relrowsecurity) from pg_class c where c.relname in ('recovery_codes', 'recovery_throttle', 'recovery_log') and c.relnamespace = 'public'::regnamespace)
  and not has_table_privilege('anon', 'public.recovery_codes', 'select,insert,update,delete') and not has_table_privilege('authenticated', 'public.recovery_codes', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.recovery_throttle', 'select,insert,update,delete') and not has_table_privilege('authenticated', 'public.recovery_throttle', 'select,insert,update,delete')
  and not has_table_privilege('anon', 'public.recovery_log', 'select,insert,update,delete') and not has_table_privilege('authenticated', 'public.recovery_log', 'select,insert,update,delete'));
set role authenticated; select t21.as21('00000000-0000-0000-0000-0000000000a1', 5);
select t21.check21('droits : un compte connecté ne lit pas recovery_codes et n''appelle pas recovery_begin / finish / abort / purge',
  not t21.ok21('select * from recovery_codes') and not t21.ok21('select * from recovery_throttle') and not t21.ok21('select * from recovery_log')
  and not t21.ok21($q$select recovery_begin('Alice', repeat('a', 64), repeat('b', 64))$q$) and not t21.ok21($q$select recovery_finish('00000000-0000-0000-0000-0000000000a1', gen_random_uuid())$q$)
  and not t21.ok21($q$select recovery_abort('00000000-0000-0000-0000-0000000000a1', gen_random_uuid())$q$) and not t21.ok21('select recovery_purge()'));
reset role;
set role anon; select t21.as21(null, null);
select t21.check21('droits : sans session (anon), ni recovery_code_new ni recovery_status ni recovery_begin', not t21.ok21('select recovery_code_new()') and not t21.ok21('select recovery_status()')
  and not t21.ok21($q$select recovery_begin('Alice', repeat('a', 64), repeat('b', 64))$q$));
reset role;

-- ---- M5 : créer un code exige une authentification par mot de passe récente
set role authenticated;
select t21.as21('00000000-0000-0000-0000-0000000000a1', null);
select t21.check21('M5 : sans revendication amr (session renouvelée sans mot de passe), recovery_code_new est refusée', not t21.ok21('select recovery_code_new()'));
select t21.as21('00000000-0000-0000-0000-0000000000a1', 3600);
select t21.check21('M5 : mot de passe saisi il y a 1 h : refusé (une session volée ne suffit pas)', not t21.ok21('select recovery_code_new()'));
select t21.as21('00000000-0000-0000-0000-0000000000c3', 5);
select t21.check21('M5 : un invité (pas un compte) ne crée pas de code', not t21.ok21('select recovery_code_new()'));
select t21.as21('00000000-0000-0000-0000-0000000000a1', 5);
select t21.check21('état : avant tout code, recovery_status dit has_code faux', (recovery_status() ->> 'has_code')::boolean = false and (recovery_status() ->> 'account')::boolean);
insert into t21.codes21 values ('alice1', recovery_code_new());
select t21.check21('code : format XXXX-XXXX-XXXX-XXXX (alphabet de 32 signes, sans I, L, O, U)', (select code ~ '^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$' from t21.codes21 where who = 'alice1'));
select t21.check21('code : un second appel dans les 20 s est refusé (double clic, rafale)', not t21.ok21('select recovery_code_new()'));
select t21.check21('état : recovery_status dit has_code vrai (jamais le haché)', (recovery_status() ->> 'has_code')::boolean and not (recovery_status()::text ~ '\$2'));
select t21.as21('00000000-0000-0000-0000-0000000000b2', 5);
insert into t21.codes21 values ('bob', recovery_code_new());
reset role;

-- ---- M4 : jamais en clair
select t21.check21('M4 : la base garde un haché bcrypt ($2a$10$…), jamais le code', (select code_hash ~ '^\$2a\$10\$' and position(c.code in code_hash) = 0 and position(replace(c.code, '-', '') in code_hash) = 0
   from recovery_codes r, t21.codes21 c where r.user_id = '00000000-0000-0000-0000-0000000000a1' and c.who = 'alice1'));
select t21.check21('M4 : le haché est bcrypt(SHA-256(code)) : il vérifie l''empreinte du code, pas le code lui-même', (select extensions.crypt(t21.sha21(replace(c.code, '-', '')), code_hash) = code_hash
   and extensions.crypt(replace(c.code, '-', ''), code_hash) <> code_hash from recovery_codes r, t21.codes21 c where r.user_id = '00000000-0000-0000-0000-0000000000a1' and c.who = 'alice1'));
select t21.check21('M4 : deux codes, deux sels (aucun haché commun)', (select count(distinct substr(code_hash, 1, 29)) from recovery_codes where code_hash is not null) = 2);
do $$ begin
  update recovery_codes set code_hash = 'ABCD-EFGH-JKMN-PQRS' where user_id = '00000000-0000-0000-0000-0000000000a1';
  perform t21.check21('M4 : la contrainte refuse un code en clair dans code_hash (même écrit par le propriétaire de la base)', false);
exception when check_violation then perform t21.check21('M4 : la contrainte refuse un code en clair dans code_hash (même écrit par le propriétaire de la base)', true);
end $$;

-- ---- Récupération (rôle de la fonction serveur)
set role service_role;
select t21.check21('M1 : pseudo inconnu → {"status": "fail"}', recovery_begin('Inconnu_9', t21.sha21('0000000000000000'), t21.sha21('10.0.0.1')) = '{"status": "fail"}'::jsonb);
select t21.check21('M1 : compte SANS code (Cleo n''en a jamais créé) → exactement la même réponse que le pseudo inconnu',
  recovery_begin('Cleo', t21.sha21('0000000000000000'), t21.sha21('10.0.0.1')) = recovery_begin('Inconnu_9', t21.sha21('0000000000000000'), t21.sha21('10.0.0.1')));
select t21.check21('M1 : mauvais code pour Alice → exactement la même réponse que le pseudo inconnu',
  recovery_begin('Alice', t21.sha21('0000000000000000'), t21.sha21('10.0.0.1')) = recovery_begin('Inconnu_9', t21.sha21('0000000000000000'), t21.sha21('10.0.0.1')));
reset role;
select t21.check21('M1 : un pseudo inconnu a sa ligne de limitation, comme un pseudo existant (rien ne les distingue)',
  (select fails from recovery_throttle where k = 'u:' || t21.sha21('inconnu_9')) = 3 and (select fails from recovery_throttle where k = 'u:' || t21.sha21('alice')) = 1
  and (select fails from recovery_throttle where k = 'u:' || t21.sha21('cleo')) = 1);
select t21.check21('M4 : les clés de limitation sont des empreintes : ni pseudo ni adresse en clair', not exists (select 1 from recovery_throttle where k ~* 'alice|inconnu|10\.0\.0'));
-- Bon code (casse et tirets indifférents : la fonction serveur normalise avant de hacher ; ici on hache la forme normalisée).
update recovery_throttle set fails = 0 where k like 'u:%';
set role service_role;
create temp table r21 as select recovery_begin('ALICE', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'alice1')), t21.sha21('10.0.0.2')) as r;
reset role;
select t21.check21('bon code : status ok, compte et jeton de réservation rendus', (select r ->> 'status' = 'ok' and r ->> 'user_id' = '00000000-0000-0000-0000-0000000000a1' and (r ->> 'nonce') ~ '^[0-9a-f-]{36}$' from r21));
set role service_role;
select t21.check21('M3 : pendant la réservation, le même bon code est refusé (fail : deux poses simultanées impossibles)',
  recovery_begin('Alice', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'alice1')), t21.sha21('10.0.0.2')) = '{"status": "fail"}'::jsonb);
select t21.check21('abort : la réservation est levée (Auth a refusé le mot de passe) : le code reste valable', recovery_abort('00000000-0000-0000-0000-0000000000a1', (select (r ->> 'nonce')::uuid from r21)));
drop table r21;
create temp table r21 as select recovery_begin('Alice', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'alice1')), t21.sha21('10.0.0.2')) as r;
reset role;
-- Sessions d'Alice (deux appareils) et d'un autre compte : seules celles d'Alice partent.
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000f003', '00000000-0000-0000-0000-0000000000b2');
insert into auth.refresh_tokens (token, user_id, session_id) values ('rt1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-00000000f001'),
  ('rt2', '00000000-0000-0000-0000-0000000000a1', null), ('rt3', '00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-00000000f003');
set role service_role;
select t21.check21('finish avec un AUTRE jeton : rien n''est consommé', (recovery_finish('00000000-0000-0000-0000-0000000000a1', gen_random_uuid()) ->> 'consumed')::boolean = false);
create temp table f21 as select recovery_finish('00000000-0000-0000-0000-0000000000a1', (select (r ->> 'nonce')::uuid from r21)) as f;
reset role;
select t21.check21('finish : code consommé, 2 sessions révoquées', (select (f ->> 'consumed')::boolean and (f ->> 'sessions')::int = 2 from f21));
select t21.check21('M3 : sessions et jetons de renouvellement d''Alice révoqués, ceux de Bob intacts',
  not exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000a1') and not exists (select 1 from auth.refresh_tokens where user_id = '00000000-0000-0000-0000-0000000000a1' and not revoked)
  and exists (select 1 from auth.sessions where user_id = '00000000-0000-0000-0000-0000000000b2') and exists (select 1 from auth.refresh_tokens where token = 'rt3' and not revoked));
select t21.check21('M3 : le haché est effacé (usage unique), la date d''usage est notée', (select code_hash is null and used_at is not null from recovery_codes where user_id = '00000000-0000-0000-0000-0000000000a1'));
set role service_role;
select t21.check21('M3 : le même code une SECONDE fois → fail', recovery_begin('Alice', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'alice1')), t21.sha21('10.0.0.2')) = '{"status": "fail"}'::jsonb);
reset role;
set role authenticated; select t21.as21('00000000-0000-0000-0000-0000000000a1', 5);
select t21.check21('état : après usage, recovery_status dit has_code faux (le jeu propose d''en créer un)', (recovery_status() ->> 'has_code')::boolean = false and recovery_status() ->> 'used_at' is not null);
reset role;

-- ---- M3 : régénération (nouveau code : l'ancien ne vaut plus rien)
update recovery_codes set created_at = now() - interval '1 minute' where user_id = '00000000-0000-0000-0000-0000000000b2';
set role authenticated; select t21.as21('00000000-0000-0000-0000-0000000000b2', 5);
insert into t21.codes21 values ('bob2', recovery_code_new());
reset role;
update recovery_throttle set fails = 0, locked_until = null where k like 'u:%' or k like 'ip:%';
set role service_role;
select t21.check21('M3 : régénération : l''ANCIEN code de Bob est refusé', recovery_begin('Bob_2', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'bob')), t21.sha21('10.0.0.3')) = '{"status": "fail"}'::jsonb);
select t21.check21('M3 : régénération : le NOUVEAU code de Bob est accepté', recovery_begin('bob_2', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'bob2')), t21.sha21('10.0.0.3')) ->> 'status' = 'ok');
reset role;
update recovery_codes set pending_nonce = null, pending_until = null where user_id = '00000000-0000-0000-0000-0000000000b2';

-- ---- M2 : verrou par pseudo (5 échecs), le bon code est alors refusé aussi ; levé après 15 min
update recovery_throttle set fails = 0, locked_until = null where k like 'u:%' or k like 'ip:%';
set role service_role;
do $$ begin for i in 1 .. 5 loop perform recovery_begin('Bob_2', t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('10.0.0.' || (10 + i))); end loop; end $$;
select t21.check21('M2 : après 5 échecs, le BON code est refusé (pseudo verrouillé) et la réponse reste « fail »',
  recovery_begin('Bob_2', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'bob2')), t21.sha21('10.0.0.99')) = '{"status": "fail"}'::jsonb);
reset role;
select t21.check21('M2 : le verrou dure 15 min et ne se lève pas par un nouvel essai', (select locked_until between now() + interval '14 minutes' and now() + interval '16 minutes' from recovery_throttle where k = 'u:' || t21.sha21('bob_2')));
update recovery_throttle set locked_until = now() - interval '1 second' where k = 'u:' || t21.sha21('bob_2');
set role service_role;
select t21.check21('M2 : verrou expiré : le bon code passe', recovery_begin('Bob_2', t21.sha21((select replace(code, '-', '') from t21.codes21 where who = 'bob2')), t21.sha21('10.0.0.99')) ->> 'status' = 'ok');
reset role;
update recovery_codes set pending_nonce = null, pending_until = null where user_id = '00000000-0000-0000-0000-0000000000b2';
-- Un pseudo INCONNU se verrouille exactement de la même façon (sinon le verrou trahirait l'existence d'un pseudo).
set role service_role;
do $$ begin for i in 1 .. 5 loop perform recovery_begin('Fantome_1', t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('10.0.1.' || i)); end loop; end $$;
reset role;
select t21.check21('M1/M2 : un pseudo inconnu est verrouillé après 5 échecs, comme un vrai', (select locked_until > now() from recovery_throttle where k = 'u:' || t21.sha21('fantome_1')));

-- ---- M2 : par adresse (20 échecs par heure, tous pseudos confondus) → « rate »
update recovery_throttle set fails = 0, locked_until = null where k like 'u:%' or k like 'ip:%';
set role service_role;
do $$ begin for i in 1 .. 20 loop perform recovery_begin('Essai_' || i, t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('192.0.2.7')); end loop; end $$;
select t21.check21('M2 : après 20 échecs d''une même adresse, la suivante reçoit « rate » (même avec un bon pseudo)', recovery_begin('Bob_2', t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('192.0.2.7')) ->> 'status' = 'rate');
select t21.check21('M2 : une autre adresse n''est pas touchée', recovery_begin('Bob_2', t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('192.0.2.8')) = '{"status": "fail"}'::jsonb);
reset role;
-- ---- M2 / M7 : plafond global (300 essais par 10 min)
update recovery_throttle set fails = 300 where k = 'global';
set role service_role;
select t21.check21('M7 : plafond global atteint → « rate » avec un délai, pour tout le monde', (select r ->> 'status' = 'rate' and (r ->> 'retry')::int between 1 and 600 from (select recovery_begin('Alice', t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('198.51.100.1')) r) x));
reset role;
update recovery_throttle set fails = 0, window_start = now() where k = 'global';
set role service_role;
select t21.check21('paramètres invalides (empreinte mal formée, pseudo trop long) : refusés par une exception, pas de « ok »',
  not t21.ok21($q$select recovery_begin('Alice', 'pas-une-empreinte', repeat('b', 64))$q$) and not t21.ok21($q$select recovery_begin(repeat('x', 41), repeat('a', 64), repeat('b', 64))$q$));
reset role;

-- ---- M1 : durées comparables (un bcrypt dans chaque cas : inconnu, mauvais code, verrouillé)
update recovery_throttle set fails = 0, locked_until = null where k like 'u:%' or k like 'ip:%';
update recovery_throttle set locked_until = now() + interval '1 hour' where k = 'u:' || t21.sha21('fantome_1');
create table t21.dur21 (kind text, ms double precision);
grant all on t21.dur21 to public;
set role service_role;
do $$ declare t0 timestamptz; k text; begin
  for i in 1 .. 4 loop
    foreach k in array array['inconnu', 'mauvais', 'verrou'] loop
      t0 := clock_timestamp();
      perform recovery_begin(case k when 'inconnu' then 'Nobody_' || i when 'mauvais' then 'Bob_2' else 'Fantome_1' end, t21.sha21('ZZZZZZZZZZZZZZZZ'), t21.sha21('203.0.113.' || i));
      insert into t21.dur21 values (k, extract(epoch from clock_timestamp() - t0) * 1000);
    end loop;
  end loop;
end $$;
reset role;
select t21.check21('M1 : inconnu, mauvais code et pseudo verrouillé coûtent chacun un bcrypt (≥ 5 ms en moyenne), à un facteur 3 près les uns des autres',
  (select min(a) >= 5 and max(a) <= 3 * min(a) from (select avg(ms) a from t21.dur21 group by kind) x));

-- ---- Divers
select t21.check21('M4 : le journal ne contient ni code, ni empreinte, ni adresse (colonnes : date, compte, issue)',
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'recovery_log') = array['id', 'at', 'user_id', 'outcome']);
select t21.check21('M4 : aucune table de public ne contient un code de secours en clair ni son empreinte SHA-256', not exists (
  select 1 from t21.codes21 c, (select row_to_json(t)::text j from recovery_codes t union all select row_to_json(t)::text from recovery_throttle t union all select row_to_json(t)::text from recovery_log t) x
  where position(replace(c.code, '-', '') in x.j) > 0 or position(c.code in x.j) > 0 or position(t21.sha21(replace(c.code, '-', '')) in x.j) > 0));
select t21.check21('journal : les issues sont tracées (new, verified, reset, fail, locked, abort)', (select count(distinct outcome) from recovery_log where outcome in ('new', 'verified', 'reset', 'fail', 'locked', 'abort')) = 6);
select t21.check21('journal : un pseudo inconnu n''y laisse aucune trace identifiante (user_id nul)', exists (select 1 from recovery_log where user_id is null and outcome = 'fail'));
set role service_role;
select t21.check21('purge : réservée au serveur, renvoie ce qu''elle efface', (recovery_purge() ? 'throttle'));
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000d4', 'dan@accounts.copytrack.invalid', '{"username":"Dan"}');
insert into recovery_codes (user_id, code_hash) values ('00000000-0000-0000-0000-0000000000d4', extensions.crypt('x', extensions.gen_salt('bf', 4)));
set role authenticated; select t21.as21('00000000-0000-0000-0000-0000000000d4', 5);
select delete_account();
reset role;
select t21.check21('suppression du compte : son code part avec lui (cascade), le journal reste sans identifiant', not exists (select 1 from recovery_codes where user_id = '00000000-0000-0000-0000-0000000000d4'));
SQL
$P -d $DB -At -f "$TMP/apres.sql" > "$TMP/apres.out" 2>&1 || true

# ---- M2 / M3 : DEUX sessions simultanées avec le bon code : une seule réservation (la seconde attend le verrou de ligne, puis voit la réservation).
CODE_C="$($P -d $DB -At -c "select replace(code, '-', '') from t21.codes21 where who = 'bob2'")"
$P -d $DB -At -c "update recovery_throttle set fails = 0, locked_until = null" -c "update recovery_codes set pending_nonce = null, pending_until = null" >/dev/null
CONC="set role service_role; select recovery_begin('Bob_2', t21.sha21('$CODE_C'), t21.sha21('10.9.9.9')) ->> 'status';"
( $P -d $DB -At -c "begin" -c "$CONC" -c "select pg_sleep(1.5)" -c "commit" > "$TMP/c1.txt" 2>&1 ) &
sleep 0.4
( $P -d $DB -At -c "begin" -c "$CONC" -c "commit" > "$TMP/c2.txt" 2>&1 ) &
wait
C1="$(grep -E '^(ok|fail|rate)$' "$TMP/c1.txt" | head -1)"; C2="$(grep -E '^(ok|fail|rate)$' "$TMP/c2.txt" | head -1)"

BAD=0
$P -d $DB -At -F'|' -c "select ok, name from t21.res21 order by name" > "$TMP/res.txt"
TOTAL=$(wc -l < "$TMP/res.txt"); FAILS=$(grep -c '^f|' "$TMP/res.txt" || true)
while IFS='|' read -r ok name; do if [ "$ok" = t ]; then echo "  ok   $name"; else echo "  FAIL $name"; fi; done < "$TMP/res.txt"
[ -n "$DEF1" ] && [ "$DEF1" = "$DEF2" ] && echo "  ok   relançable : les définitions des fonctions recovery_* sont identiques après la 2e et la 3e passe" || { echo "  FAIL relançable : définitions différentes"; BAD=1; }
if [ "$C1" = ok ] && [ "$C2" = fail ]; then echo "  ok   M2/M3 : deux sessions simultanées avec le bon code : la 1re réserve (ok), la 2e attend puis reçoit fail"; else echo "  FAIL M2/M3 : sessions simultanées : « $C1 » / « $C2 » (attendu ok / fail)"; cat "$TMP/c1.txt" "$TMP/c2.txt"; BAD=1; fi
VPA="$(grep -E '^étape 21' "$TMP/vp-avant.txt" || true)"
[ "$(echo "$VPA" | grep -c '|MANQUE$')" -ge 2 ] && echo "  ok   verify-prod.sql AVANT l'étape 21 : ses lignes disent MANQUE" || { echo "  FAIL verify-prod.sql avant l'étape 21 : MANQUE attendu"; echo "$VPA"; BAD=1; }
VPE="$(grep -E '^étape 21' "$TMP/vp.txt" || true)"
if echo "$VPE" | grep -qE '\|(MANQUE|ÉCART)$'; then echo "  FAIL verify-prod.sql après l'étape 21 : lignes MANQUE / ÉCART :"; echo "$VPE" | grep -E '\|(MANQUE|ÉCART)$'; BAD=1; else echo "  ok   verify-prod.sql après l'étape 21 : lignes « étape 21 » sans MANQUE ni ÉCART"; fi
[ "$(echo "$VPE" | grep -c 'étape 21')" -ge 4 ] || { echo "  FAIL verify-prod.sql : lignes de l'étape 21 absentes"; BAD=1; }
if grep -qE '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; then echo "  FAIL verify-prod.sql sur la base complète (étapes 1 à 21) : lignes MANQUE / ÉCART :"; grep -E '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; BAD=1; else echo "  ok   verify-prod.sql sur la base complète (étapes 1 à 21) : aucune ligne MANQUE ni ÉCART"; fi
if [ "$FAILS" -gt 0 ] || [ "$TOTAL" -lt 35 ] || [ "$BAD" != 0 ]; then echo "ÉCHEC : étape 21 ($FAILS échec(s) sur $TOTAL)"; grep -i 'error\|erreur' "$TMP/apres.out" | head -10 || true; exit 1; fi
echo "RESULT étape 21 : $TOTAL contrôles réussis (code haché, usage unique, verrous, réponses uniformes, sessions révoquées, droits) + concurrence + verify-prod.sql ; relançable"
