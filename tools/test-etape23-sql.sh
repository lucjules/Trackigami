#!/usr/bin/env bash
# Teste supabase/etape23-amorces.sql (amorces officielles, rival juste devant, boîte de réception : COMPLETE-010, COMPLETE-015) sur un PostgreSQL local :
#   PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape23-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest23) : étapes 1 à 22, des comptes et des données (classement, saison, duels, abonnements), PUIS l'étape 23 (trois fois : relançable).
# Ce que le test exige :
#   W  un joueur (anon, authenticated) ne peut ni écrire dans official_runs (insert, update, delete), ni lire ses commandes ; la clé de service écrit ;
#      les autres colonnes se lisent sans session ;
#   D  les amorces n'ont AUCUN effet sur le monde réel : une saison close AVEC et SANS amorces (deux bases identiques par ailleurs) donne le même historique,
#      les mêmes divisions et le même classement ; points de saison et rang renvoyé par submit_best identiques ; règlement d'un duel identique ;
#   A  rival_ahead : le plus proche devant (strictement : un ex æquo n'est pas devant), départage des égalités, premier du classement (rien), fantôme absent sauté,
#      jamais l'appelant, bornes absurdes sans erreur, appelable sans session ;
#   I  inbox_summary : refusée sans session ; ne renvoie que les événements de l'appelant (battu, duels, saison, abonnements), rien d'un autre joueur ; 20 éléments
#      au plus ; période bornée à 30 jours ;
#   R  relançable (définitions identiques aux 2e et 3e passes), aucune donnée existante touchée, verify-prod.sql (lignes « étape 23 »).
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
cd "$(dirname "$0")/.."
DB=copytrack_sqltest23
DB2=copytrack_sqltest23b
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
if [ -n "${GARDER:-}" ]; then trap 'rm -rf "$TMP"' EXIT; else trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" -c "drop database if exists '"$DB2"'" >/dev/null 2>&1 || true' EXIT; fi
$P -d postgres -c "drop database if exists $DB2" -c "drop database if exists $DB" -c "create database $DB"
cat > "$TMP/stub.sql" <<'SQL'
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false,
  encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
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
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite 18-maintenance 19-avis 20-droits-et-regles 21-recuperation 22-moderation; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

# L'heure du test : fixée (season_clock, étape 11) au mercredi 25 novembre 2026, 12:00 UTC : saison 3 en cours (depuis le lundi 23), saison 2 finie (16 → 23 novembre).
CLOCK="2026-11-25 12:00:00+00"
cat > "$TMP/avant.sql" <<SQL
\set ON_ERROR_STOP off
create schema t23;
grant usage on schema t23 to public;
create table t23.res23 (name text, ok boolean, detail text);
grant all on t23.res23 to public;
create function t23.check23(n text, c boolean, d text default null) returns void language plpgsql security definer as \$\$ begin insert into t23.res23 values (n, coalesce(c, false), d); end \$\$;
grant execute on function t23.check23(text, boolean, text) to public;
create function t23.as23(u uuid) returns void language plpgsql as \$\$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end \$\$;
grant execute on function t23.as23(uuid) to public;
create function t23.err23(q text) returns text language plpgsql as \$\$ begin execute q; return 'OK'; exception when others then return sqlerrm; end \$\$;
grant execute on function t23.err23(text) to public;
create function t23.val23(q text) returns text language plpgsql as \$\$ declare v text; begin execute q into v; return v; exception when others then return 'ERREUR : ' || sqlerrm; end \$\$;
grant execute on function t23.val23(text) to public;
create function t23.clock() returns timestamptz language sql immutable as \$\$ select timestamptz '$CLOCK' \$\$;
grant execute on function t23.clock() to public;

-- Pilotes : Alice, Bob, Erin, Hugo (comptes) ; Carl, Dave, Fay, Gus (invités). Tous en division 5 (nouveaux).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@accounts.copytrack.invalid', '{"username":"Alice"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@accounts.copytrack.invalid', '{"username":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000e5', 'erin@accounts.copytrack.invalid', '{"username":"Erin"}'),
  ('00000000-0000-0000-0000-0000000000a8', 'hugo@accounts.copytrack.invalid', '{"username":"Hugo"}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000c3', true), ('00000000-0000-0000-0000-0000000000d4', true),
  ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true);
insert into public.players (id, name, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alice', t23.clock() - interval '40 days'), ('00000000-0000-0000-0000-0000000000b2', 'Bob', t23.clock() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000e5', 'Erin', t23.clock() - interval '40 days'), ('00000000-0000-0000-0000-0000000000a8', 'Hugo', t23.clock() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'Carl', t23.clock() - interval '40 days'), ('00000000-0000-0000-0000-0000000000d4', 'Dave', t23.clock() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000e1', 'Fay', t23.clock() - interval '40 days'), ('00000000-0000-0000-0000-0000000000e2', 'Gus', t23.clock() - interval '40 days');

-- Classement du circuit K (b-eclats-1ocqc5y, physique 39). Alice : 50 s (il y a 3 jours). Devant elle : Bob et Erin ex æquo à 48 s (après son record : Bob il y a 1 jour,
-- Erin il y a 12 h), Dave 47 s (il y a 10 jours : AVANT le record d'Alice, il ne l'a pas « battue »). Derrière : Carl 52 s (sans fantôme), Fay 55 s.
-- Gus 40 s mais en physique 38 (une autre version : jamais comparée).
insert into public.scores (track_key, player, time, inputs, phys_ver, track_name, updated_at, ghost, ghost_veh) values
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000a1', 50, 'IN', 39, 'Éclats', t23.clock() - interval '3 days', 'GA', '[]'),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000b2', 48, 'IN', 39, 'Éclats', t23.clock() - interval '1 day', 'GB', '[]'),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000e5', 48, 'IN', 39, 'Éclats', t23.clock() - interval '12 hours', 'GE', '[[3,1]]'),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000d4', 47, 'IN', 39, 'Éclats', t23.clock() - interval '10 days', 'GD', '[]'),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000c3', 52, 'IN', 39, 'Éclats', t23.clock() - interval '2 days', null, null),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000e1', 55, 'IN', 39, 'Éclats', t23.clock() - interval '2 days', 'GF', '[]'),
  ('b-eclats-1ocqc5y', '00000000-0000-0000-0000-0000000000e2', 40, 'IN', 38, 'Éclats', t23.clock() - interval '1 day', 'GG', '[]');
-- Glacier : Hugo a battu Alice il y a 35 jours (après son record, mais hors de la période bornée à 30 jours).
insert into public.scores (track_key, player, time, inputs, phys_ver, track_name, updated_at, ghost) values
  ('b-glacier-u8musw', '00000000-0000-0000-0000-0000000000a1', 70, 'IN', 39, 'Glacier', t23.clock() - interval '50 days', 'GA'),
  ('b-glacier-u8musw', '00000000-0000-0000-0000-0000000000a8', 65, 'IN', 39, 'Glacier', t23.clock() - interval '35 days', 'GH');
-- Un autre circuit : Bob s'y fait battre par Carl (événement de Bob, jamais d'Alice).
insert into public.scores (track_key, player, time, inputs, phys_ver, track_name, updated_at, ghost) values
  ('b-canyon-ymt2z', '00000000-0000-0000-0000-0000000000b2', 60, 'IN', 39, 'Canyon', t23.clock() - interval '5 days', 'GB'),
  ('b-canyon-ymt2z', '00000000-0000-0000-0000-0000000000c3', 58, 'IN', 39, 'Canyon', t23.clock() - interval '6 hours', 'GC');

-- Saison 2 (16 → 23 novembre) : six pilotes sur trois circuits (étiquettes ~v1.sea-2). Rien n'est encore clos.
insert into public.scores (track_key, player, time, inputs, phys_ver, updated_at)
  select k || '~v1.sea-2', p, 40 + i * 1.5 + j, 'IN', 39, timestamptz '2026-11-18 10:00:00+00'
  from (values ('b-eclats-1ocqc5y', 0), ('b-canyon-ymt2z', 1), ('b-spirale-dzfkwp', 2)) c(k, j),
       (values ('00000000-0000-0000-0000-0000000000a1'::uuid, 1), ('00000000-0000-0000-0000-0000000000b2'::uuid, 2), ('00000000-0000-0000-0000-0000000000c3'::uuid, 3),
               ('00000000-0000-0000-0000-0000000000d4'::uuid, 4), ('00000000-0000-0000-0000-0000000000e1'::uuid, 5), ('00000000-0000-0000-0000-0000000000e2'::uuid, 6)) pl(p, i);
-- Saison 1, close la veille (à la main : son historique est le décor de la boîte de réception) : Alice est montée en division 4.
insert into public.seasons (id, closed_at, participants) values (1, t23.clock() - interval '1 day', 1);
insert into public.division_history (season, player, division, points, rank, moved) values (1, '00000000-0000-0000-0000-0000000000a1', 5, 900, 1, -1);
insert into public.season_divisions (player, division) values ('00000000-0000-0000-0000-0000000000a1', 4);

-- Amis et duels : Bob défie Alice (en attente) ; Alice a battu Erin (réglé il y a 2 jours) ; Bob et Carl ne concernent pas Alice.
insert into public.friends (a, b, status, accepted_at) values ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'accepted', t23.clock() - interval '20 days'),
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'accepted', t23.clock() - interval '20 days');
insert into public.duels (challenger, opponent, track_key, track_name, status, created_at, ends_at) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000a1', 'b-canyon-ymt2z', 'Canyon', 'pending', t23.clock() - interval '2 hours', t23.clock() + interval '22 hours'),
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-0000000000c3', 'b-canyon-ymt2z', 'Canyon', 'pending', t23.clock() - interval '2 hours', t23.clock() + interval '22 hours');
insert into public.duels (challenger, opponent, track_key, track_name, status, created_at, ends_at, c_time, o_time, winner, c_delta, o_delta, settled_at) values
  ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'b-eclats-1ocqc5y', 'Éclats', 'settled', t23.clock() - interval '3 days', t23.clock() - interval '2 days', 47.5, 49, '00000000-0000-0000-0000-0000000000a1', 16, -16, t23.clock() - interval '2 days');
-- Un duel accepté, échu il y a une heure, pas encore réglé (Alice 47 s, Erin 46 s sous sa clé) : il sera réglé avec et sans amorces (D).
insert into public.duels (id, challenger, opponent, track_key, track_name, status, created_at, ends_at) overriding system value values
  (900, '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', 'b-eclats-1ocqc5y', 'Éclats', 'accepted', t23.clock() - interval '25 hours', t23.clock() - interval '1 hour');
insert into public.scores (track_key, player, time, inputs, phys_ver, updated_at) values
  ('b-eclats-1ocqc5y~v1.duel-900', '00000000-0000-0000-0000-0000000000a1', 47, 'IN', 39, t23.clock() - interval '3 hours'),
  ('b-eclats-1ocqc5y~v1.duel-900', '00000000-0000-0000-0000-0000000000e5', 46, 'IN', 39, t23.clock() - interval '2 hours');

-- Abonnements : Alice suit Erin. Erin publie un circuit hier, et un circuit masqué ; Bob (pas suivi) publie aussi. Trente circuits d'Erin pour le plafond de 20.
insert into public.follows (follower, author, created_at) values ('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e5', t23.clock() - interval '30 days');
insert into public.tracks (id, author, name, decor, code, signature, author_time, pieces, created_at, hidden) values
  ('00000000-0000-0000-0000-00000000f201', '00000000-0000-0000-0000-0000000000e5', 'Nouveau d''Erin', 'x', 'code1', 'sig1', 30, 5, t23.clock() - interval '1 day', false),
  ('00000000-0000-0000-0000-00000000f202', '00000000-0000-0000-0000-0000000000e5', 'Masqué d''Erin', 'x', 'code2', 'sig2', 30, 5, t23.clock() - interval '1 day', true),
  ('00000000-0000-0000-0000-00000000f203', '00000000-0000-0000-0000-0000000000b2', 'Circuit de Bob', 'x', 'code3', 'sig3', 30, 5, t23.clock() - interval '1 day', false);

create table t23.photo23 as
  select 'players' t, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from players) x
  union all select 'scores', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from scores) x
  union all select 'tracks', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from tracks) x
  union all select 'duels', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from duels) x
  union all select 'follows', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from follows) x
  union all select 'seasons', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from seasons) x
  union all select 'division_history', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from division_history) x
  union all select 'season_divisions', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from season_divisions) x;
SQL
$P -d $DB -f "$TMP/avant.sql" > "$TMP/avant.out" 2>&1 || true
if grep -qiE 'error|erreur' "$TMP/avant.out"; then echo "ÉCHEC : la préparation des données d'essai a échoué :"; grep -iE 'error|erreur' "$TMP/avant.out" | head; exit 1; fi
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp-avant.txt"

# L'étape, TROIS fois (relançable) ; définitions identiques entre la 2e et la 3e passe.
$P -d $DB -f supabase/etape23-amorces.sql >/dev/null
$P -d $DB -f supabase/etape23-amorces.sql >/dev/null
DEF="select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text)) || md5(coalesce((select string_agg(pg_get_constraintdef(c.oid), '|' order by c.conname) from pg_constraint c where c.conrelid = 'public.official_runs'::regclass), '')) || md5(coalesce(array_to_string((select relacl from pg_class where oid = 'public.official_runs'::regclass), ','), '')) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('rival_ahead', 'inbox_summary')"
DEF1="$($P -d $DB -At -c "$DEF")"
$P -d $DB -f supabase/etape23-amorces.sql >/dev/null
DEF2="$($P -d $DB -At -c "$DEF")"
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp.txt"

# D : une copie de la base, identique (étape 23 comprise) mais SANS amorces, pour comparer une clôture de saison et un règlement de duel avec et sans.
$P -d postgres -c "create database $DB2 template $DB"

cat > "$TMP/apres.sql" <<SQL
\set ON_ERROR_STOP off
set copytrack.now = '$CLOCK';
select t23.check23('R aucune donnée existante touchée par l''étape : players, scores, tracks, duels, follows, seasons, division_history, season_divisions identiques',
  not exists (select 1 from t23.photo23 p join (
    select 'players' t, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from players) x
    union all select 'scores', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from scores) x
    union all select 'tracks', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from tracks) x
    union all select 'duels', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from duels) x
    union all select 'follows', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from follows) x
    union all select 'seasons', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from seasons) x
    union all select 'division_history', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from division_history) x
    union all select 'season_divisions', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from season_divisions) x) n on n.t = p.t where n.h is distinct from p.h));

-- ================================================================ W. Écriture réservée à la clé de service
set role service_role;
select t23.check23('W la clé de service écrit les amorces (insertion, puis mise à jour par « upsert » : relancer l''outil remplace)',
  t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs, ghost, ghost_veh, splits, tool) values
    ('b-eclats-1ocqc5y', 39, 'auto', 'cristal', 45.8, 'AUTO-C', 'OGC', '[]', '{100,200}', 'seed 1'),
    ('b-eclats-1ocqc5y', 39, 'auto', 'or', 48.12, 'AUTO-O', 'OGO', '[]', null, 'seed 1'),
    ('b-eclats-1ocqc5y', 39, 'auto', 'argent', 55.4, 'AUTO-A', 'OGA', '[]', null, 'seed 1'),
    ('b-eclats-1ocqc5y', 39, 'auto', 'bronze', 65.01, 'AUTO-B', 'OGB', '[]', null, 'seed 1')\$q\$) = 'OK'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs, ghost, tool) values ('b-eclats-1ocqc5y', 39, 'auto', 'or', 48.12, 'AUTO-O', 'OGO', 'seed 2')
    on conflict (track_key, phys_ver, source, level) do update set "time" = excluded."time", inputs = excluded.inputs, ghost = excluded.ghost, tool = excluded.tool, updated_at = now()\$q\$) = 'OK');
select t23.check23('W … l''« upsert » remplace la ligne au lieu d''en ajouter une', (select count(*) from official_runs) = 4 and (select tool from official_runs where level = 'or') = 'seed 2');
-- Amorces sur les trois circuits de la saison 2, PLUS RAPIDES que tous les joueurs (le pire cas : si elles comptaient, le meilleur temps de saison changerait les points).
select t23.check23('W … et sur les circuits de la saison (clés de base : une étiquette de saison ne change pas le circuit)',
  t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs, tool) values
    ('b-canyon-ymt2z', 39, 'auto', 'cristal', 30, 'X', 'seed 1'), ('b-spirale-dzfkwp', 39, 'auto', 'cristal', 30, 'X', 'seed 1'), ('b-canyon-ymt2z', 39, 'testeur', 'ana', 31, 'X', 'seed 1')\$q\$) <> 'OK'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, pilot, "time", inputs, tool) values
    ('b-canyon-ymt2z', 39, 'auto', 'cristal', null, 30, 'X', 'seed 1'), ('b-spirale-dzfkwp', 39, 'auto', 'cristal', null, 30, 'X', 'seed 1'), ('b-canyon-ymt2z', 39, 'testeur', 'ana', 'Ana', 31, 'X', 'seed 1')\$q\$) = 'OK');
select t23.check23('W les contraintes refusent une clé de variante (saison, duel), un niveau inconnu du pilote automatique, un testeur sans pseudo, un temps absurde',
  t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y~v1.sea-2', 39, 'auto', 'or', 40, 'X')\$q\$) like '%check%'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('u-abc', 39, 'auto', 'or', 40, 'X')\$q\$) like '%check%'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'auto', 'platine', 40, 'X')\$q\$) like '%check%'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'testeur', 'ana', 40, 'X')\$q\$) like '%check%'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'auto', 'bronze', 0, 'X')\$q\$) like '%check%');
reset role;

set role anon; select t23.as23(null);
select t23.check23('W anon (sans session) : insertion, mise à jour et suppression dans official_runs refusées ; rien n''a changé',
  t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'auto', 'bronze', 1, 'X')\$q\$) like 'permission denied%'
  and t23.err23(\$q\$update official_runs set "time" = 1\$q\$) like 'permission denied%' and t23.err23(\$q\$delete from official_runs\$q\$) like 'permission denied%');
select t23.check23('W anon : les amorces se lisent sans session (temps, niveau, fantôme), pas leurs commandes',
  t23.val23(\$q\$select count(*) from official_runs where track_key = 'b-eclats-1ocqc5y' and phys_ver = 39\$q\$) = '4'
  and t23.val23(\$q\$select ghost from official_runs where track_key = 'b-eclats-1ocqc5y' and level = 'or'\$q\$) = 'OGO'
  and t23.err23(\$q\$select inputs from official_runs\$q\$) like 'permission denied%' and t23.err23(\$q\$select * from official_runs\$q\$) like 'permission denied%');
reset role;
set role authenticated; select t23.as23('00000000-0000-0000-0000-0000000000a1');
select t23.check23('W un joueur connecté : insertion, mise à jour, suppression, « upsert » refusés ; commandes illisibles',
  t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'auto', 'bronze', 1, 'X')\$q\$) like 'permission denied%'
  and t23.err23(\$q\$insert into official_runs (track_key, phys_ver, source, level, "time", inputs) values ('b-eclats-1ocqc5y', 39, 'auto', 'or', 1, 'X') on conflict (track_key, phys_ver, source, level) do update set "time" = 1\$q\$) like 'permission denied%'
  and t23.err23(\$q\$update official_runs set "time" = 1\$q\$) like 'permission denied%' and t23.err23(\$q\$delete from official_runs\$q\$) like 'permission denied%'
  and t23.err23(\$q\$select inputs from official_runs\$q\$) like 'permission denied%');
reset role;
select t23.check23('W … après ces essais, les amorces sont celles de la clé de service, intactes', (select count(*) from official_runs) = 7 and (select min("time") from official_runs where track_key = 'b-eclats-1ocqc5y') = 45.8);
select t23.check23('W la table est fermée par défaut : RLS activée, aucun droit de table entière pour anon ni authenticated',
  (select relrowsecurity from pg_class where oid = 'public.official_runs'::regclass)
  and not has_table_privilege('anon', 'public.official_runs', 'select') and not has_table_privilege('authenticated', 'public.official_runs', 'insert')
  and not has_any_column_privilege('authenticated', 'public.official_runs', 'insert') and not has_any_column_privilege('anon', 'public.official_runs', 'update'));

SQL
$P -d $DB -At -f "$TMP/apres.sql" > "$TMP/apres.out" 2>&1 || true


cat > "$TMP/lire.sql" <<SQL
\set ON_ERROR_STOP off
set copytrack.now = '$CLOCK';
-- ================================================================ A. Rival juste devant
set role anon; select t23.as23(null);
select t23.check23('A sans session : rival_ahead est appelable et ne crée rien', t23.err23(\$q\$select * from rival_ahead('b-eclats-1ocqc5y', 39, 50)\$q\$) = 'OK');
select t23.check23('A derrière un ex æquo : le plus proche devant 50 s est à 48 s ; entre Bob et Erin (48 s), Erin (la plus récente, classée juste au-dessus) ; place 2 (seul Dave est plus rapide)',
  t23.val23(\$q\$select name || ':' || "time" || ':' || place || ':' || ghost from rival_ahead('b-eclats-1ocqc5y', 39, 50)\$q\$) = 'Erin:48:2:GE',
  t23.val23(\$q\$select name || ':' || "time" || ':' || place || ':' || ghost from rival_ahead('b-eclats-1ocqc5y', 39, 50)\$q\$));
select t23.check23('A un temps égal n''est pas « devant » : à 48 s, le rival est Dave (47 s, 1er)', t23.val23(\$q\$select name || ':' || place from rival_ahead('b-eclats-1ocqc5y', 39, 48)\$q\$) = 'Dave:1');
select t23.check23('A le premier du classement n''a personne devant (47 s : aucune ligne ; les amorces ne sont pas des joueurs)', t23.val23(\$q\$select count(*) from rival_ahead('b-eclats-1ocqc5y', 39, 47)\$q\$) = '0');
select t23.check23('A le dernier (60 s) : Fay (55 s) est juste devant ; à 54 s, Carl (52 s) n''a pas de fantôme : le rival est Alice (50 s, place 4)',
  t23.val23(\$q\$select name || ':' || place from rival_ahead('b-eclats-1ocqc5y', 39, 60)\$q\$) = 'Fay:6' and t23.val23(\$q\$select name || ':' || place from rival_ahead('b-eclats-1ocqc5y', 39, 54)\$q\$) = 'Alice:4',
  t23.val23(\$q\$select name || ':' || place from rival_ahead('b-eclats-1ocqc5y', 39, 54)\$q\$));
select t23.check23('A une autre physique ne se mélange pas (Gus, 40 s en physique 38, n''est le rival de personne en 39 ; en 38 il est seul)',
  t23.val23(\$q\$select count(*) from rival_ahead('b-eclats-1ocqc5y', 38, 45)\$q\$) = '1' and t23.val23(\$q\$select name from rival_ahead('b-eclats-1ocqc5y', 39, 47.5)\$q\$) = 'Dave');
select t23.check23('A circuit sans aucun temps : aucune ligne, sans erreur', t23.val23(\$q\$select count(*) from rival_ahead('b-vide-abc', 39, 50)\$q\$) = '0');
select t23.check23('A bornes absurdes sans erreur ni ligne (temps nul, négatif, énorme, clé géante, nulls)', t23.val23(\$q\$select count(*) from rival_ahead('b-eclats-1ocqc5y', 39, 0)\$q\$) = '0'
  and t23.val23(\$q\$select count(*) from rival_ahead('b-eclats-1ocqc5y', 39, -5)\$q\$) = '0' and t23.val23(\$q\$select count(*) from rival_ahead('b-eclats-1ocqc5y', 39, 1e9)\$q\$) = '0'
  and t23.val23(\$q\$select count(*) from rival_ahead(repeat('b', 500), 39, 50)\$q\$) = '0' and t23.val23(\$q\$select count(*) from rival_ahead(null, null, null)\$q\$) = '0');
select t23.check23('A sans session, inbox_summary est refusée (droit d''exécution retiré à anon)', t23.err23(\$q\$select * from inbox_summary(now())\$q\$) like 'permission denied%');
reset role;
set role authenticated; select t23.as23('00000000-0000-0000-0000-0000000000a1');
select t23.check23('A jamais soi-même : Alice (50 s) qui demande devant 51 s obtient Erin, pas elle-même', t23.val23(\$q\$select name from rival_ahead('b-eclats-1ocqc5y', 39, 51)\$q\$) = 'Erin');
reset role;

-- ================================================================ I. Boîte de réception
set role authenticated; select t23.as23(null);
select t23.check23('I une session sans identifiant (jeton sans « sub ») ne reçoit rien', t23.val23(\$q\$select count(*) from inbox_summary(now() - interval '7 days')\$q\$) = '0');
select t23.as23('00000000-0000-0000-0000-0000000000a1');
create temporary table ia as select * from inbox_summary(t23.clock() - interval '2 days 13 hours');
select t23.check23('I Alice, depuis le 22 à 23 h : « battu » sur Éclats par 2 pilotes (Bob, Erin : après son record), le plus récent nommé (Erin) ; pas Dave (avant son record), ni Gus (autre physique), ni le duel 900 en cours (temps cachés jusqu''au règlement)',
  (select count(*) from ia where kind = 'beaten') = 1 and (select who || ':' || n || ':' || my_time || ':' || their_time || ':' || track_key from ia where kind = 'beaten') = 'Erin:2:50:48:b-eclats-1ocqc5y',
  (select string_agg(kind || ' ' || coalesce(who, '') || ' ' || coalesce(n::text, ''), ' ; ') from ia));
select t23.check23('I Alice : le duel de Bob qui l''attend, et son duel réglé contre Erin (victoire, +16 Elo, ses temps)',
  (select who || ':' || track_key from ia where kind = 'duel') = 'Bob:b-canyon-ymt2z' and (select who || ':' || n || ':' || my_time || ':' || their_time from ia where kind = 'duel_win') = 'Erin:16:47.5:49');
select t23.check23('I Alice : nouvelle saison (la 3, commencée le 23 : depuis la date demandée), et la fin de la saison 1 où elle est montée en division 4',
  (select ref from ia where kind = 'season') = 3 and (select string_agg(ref || ':' || n || ':' || m, ',') from ia where kind = 'season_end') = '1:-1:4');
select t23.check23('I Alice : le circuit publié par Erin, qu''elle suit ; ni son circuit masqué, ni celui de Bob (non suivi)',
  (select string_agg(track_name || ':' || who, ',') from ia where kind = 'follow') = 'Nouveau d''Erin:Erin');
select t23.check23('I Alice : rien qui ne la concerne pas (le duel Bob-Carl, Bob battu par Carl sur Canyon) ; du plus récent au plus ancien',
  not exists (select 1 from ia where track_key = 'b-canyon-ymt2z' and kind = 'beaten') and (select count(*) from ia where kind = 'duel') = 1
  and (select array_agg(at) from inbox_summary(t23.clock() - interval '2 days 13 hours')) = (select array_agg(at order by at desc) from inbox_summary(t23.clock() - interval '2 days 13 hours')));
create temporary table ia2 as select * from inbox_summary(t23.clock() - interval '4 hours');
select t23.check23('I la date de dernière visite compte : depuis 4 heures, ni « battu » (12 h), ni duel réglé, ni nouvelle saison, ni circuit suivi ; le duel en attente reste (il attend)',
  (select string_agg(kind, ',' order by kind) from ia2) = 'duel', (select string_agg(kind, ',' order by kind) from ia2));
select t23.as23('00000000-0000-0000-0000-0000000000b2');
create temporary table ib as select * from inbox_summary(t23.clock() - interval '2 days');
select t23.check23('I Bob : ses propres événements (battu par Carl sur Canyon), jamais ceux d''Alice (pas le duel qu''il a lancé, pas sa saison)',
  (select who || ':' || track_key from ib where kind = 'beaten') = 'Carl:b-canyon-ymt2z' and not exists (select 1 from ib where kind in ('duel', 'season_end', 'duel_win', 'duel_loss')),
  (select string_agg(kind || ' ' || coalesce(who, ''), ' ; ') from ib));
select t23.as23('00000000-0000-0000-0000-0000000000a1');
select t23.check23('I une date très ancienne est bornée à 30 jours (Hugo a battu Alice sur Glacier il y a 35 jours : absent) ; null : 7 jours, sans erreur',
  t23.val23(\$q\$select count(*) from inbox_summary(timestamptz '2000-01-01')\$q\$) = '6' and t23.val23(\$q\$select count(*) from inbox_summary(timestamptz '2000-01-01') where who = 'Hugo'\$q\$) = '0'
  and t23.err23(\$q\$select * from inbox_summary(null)\$q\$) = 'OK', t23.val23(\$q\$select string_agg(kind || ' ' || coalesce(who, ''), ' ; ') from inbox_summary(timestamptz '2000-01-01')\$q\$));
reset role;
insert into tracks (id, author, name, decor, code, signature, author_time, pieces, created_at)
  select ('00000000-0000-0000-0000-0000000f' || lpad(g::text, 4, '0'))::uuid, '00000000-0000-0000-0000-0000000000e5', 'Série ' || g, 'x', 'cs' || g, 'ss' || g, 30, 5, t23.clock() - make_interval(mins => g)
  from generate_series(1, 30) g;
set role authenticated; select t23.as23('00000000-0000-0000-0000-0000000000a1');
select t23.check23('I plafond : 30 circuits d''Erin de plus, la boîte renvoie 20 éléments, pas plus (les plus récents d''abord)', t23.val23(\$q\$select count(*) from inbox_summary(t23.clock() - interval '2 days 13 hours')\$q\$) = '20'
  and t23.val23(\$q\$select track_name from inbox_summary(t23.clock() - interval '2 days 13 hours') limit 1\$q\$) = 'Série 1');
reset role;
select t23.check23('I les colonnes de la boîte ne contiennent ni commandes, ni fantôme, ni identifiant de joueur',
  pg_get_function_result('inbox_summary(timestamp with time zone)'::regprocedure) = 'TABLE(kind text, at timestamp with time zone, track_key text, track_name text, track_id uuid, who text, my_time double precision, their_time double precision, ref bigint, n integer, m integer)');
select t23.check23('droits : rival_ahead à anon et authenticated ; inbox_summary à authenticated seulement ; aucune des deux à PUBLIC ; security definer, search_path fixé',
  has_function_privilege('anon', 'public.rival_ahead(text,integer,double precision)', 'execute') and has_function_privilege('authenticated', 'public.rival_ahead(text,integer,double precision)', 'execute')
  and not has_function_privilege('anon', 'public.inbox_summary(timestamp with time zone)', 'execute') and has_function_privilege('authenticated', 'public.inbox_summary(timestamp with time zone)', 'execute')
  and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a where p.oid in ('public.rival_ahead(text,integer,double precision)'::regprocedure, 'public.inbox_summary(timestamp with time zone)'::regprocedure) and a.grantee = 0)
  and not exists (select 1 from pg_proc p where p.oid in ('public.rival_ahead(text,integer,double precision)'::regprocedure, 'public.inbox_summary(timestamp with time zone)'::regprocedure) and (not p.prosecdef or array_to_string(p.proconfig, ',') not like 'search_path=%')));
select t23.check23('aucune fonction de classement, de saison ou de compétition ne lit official_runs (lecture du code des fonctions)',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ilike '%official_runs%'));
SQL
$P -d $DB -At -f "$TMP/lire.sql" > "$TMP/lire.out" 2>&1 || true

# D : AVEC amorces (cette base), puis SANS (la copie faite juste après l'étape, avant toute amorce), et comparaison.
cat > "$TMP/d.sql" <<SQL
\\set ON_ERROR_STOP off
set copytrack.now = '$CLOCK';
-- ================================================================ D. Aucun effet sur le monde réel (ici, AVEC amorces)
create table t23.d_with as select 'points' w, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from season_points(2)) x
  union all select 'standings', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from season_standings(2, 50)) x
  union all select 'rank', public.submit_best('00000000-0000-0000-0000-0000000000a8', 'b-spirale-dzfkwp', 46.5, 'IN', 39, 'Spirale')::text;
select close_due_seasons();
select settle_due();
insert into t23.d_with select 'history', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from division_history) x
  union all select 'divisions', md5(coalesce(string_agg((x.player, x.division)::text, '|' order by x.player), '')) from season_divisions x
  union all select 'seasons', md5(coalesce(string_agg((x.id, x.participants)::text, '|' order by x.id), '')) from seasons x
  union all select 'duels', md5(coalesce(string_agg((x.id, x.status, x.c_time, x.o_time, x.winner)::text, '|' order by x.id), '')) from duels x
  union all select 'ratings', md5(coalesce(string_agg((x.player, x.rating, x.games, x.wins)::text, '|' order by x.player), '')) from ratings x;
select t23.check23('D le rang renvoyé par submit_best ne compte que les joueurs (Hugo, 46,5 s sur Spirale : 1er sur 1 ; l''amorce cristal à 30 s ne compte pas)',
  (select h from t23.d_with where w = 'rank')::jsonb ->> 'rank' = '1' and (select h from t23.d_with where w = 'rank')::jsonb ->> 'total' = '1', (select h from t23.d_with where w = 'rank'));
select t23.check23('D la saison 2 a bien été close avec des montées, le duel 900 réglé (Erin gagne) : le test compare quelque chose', (select participants from seasons where id = 2) = 6 and exists (select 1 from division_history where season = 2 and moved = -1)
  and (select status || ':' || (winner = '00000000-0000-0000-0000-0000000000e5') from duels where id = 900) = 'settled:true');
grant select on t23.d_with to public;
SQL
$P -d $DB -At -f "$TMP/d.sql" > "$TMP/d.out" 2>&1 || true
# D (suite) : la même chose dans la copie SANS amorces, puis comparaison.
cat > "$TMP/sans.sql" <<SQL
set copytrack.now = '$CLOCK';
create table t23.d_without as select 'points' w, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from season_points(2)) x
  union all select 'standings', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from season_standings(2, 50)) x
  union all select 'rank', public.submit_best('00000000-0000-0000-0000-0000000000a8', 'b-spirale-dzfkwp', 46.5, 'IN', 39, 'Spirale')::text;
select close_due_seasons();
select settle_due();
insert into t23.d_without select 'history', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from division_history) x
  union all select 'divisions', md5(coalesce(string_agg((x.player, x.division)::text, '|' order by x.player), '')) from season_divisions x
  union all select 'seasons', md5(coalesce(string_agg((x.id, x.participants)::text, '|' order by x.id), '')) from seasons x
  union all select 'duels', md5(coalesce(string_agg((x.id, x.status, x.c_time, x.o_time, x.winner)::text, '|' order by x.id), '')) from duels x
  union all select 'ratings', md5(coalesce(string_agg((x.player, x.rating, x.games, x.wins)::text, '|' order by x.player), '')) from ratings x;
select string_agg(w || '=' || h, ';' order by w) from t23.d_without;
SQL
SANS="$($P -d $DB2 -At -f "$TMP/sans.sql" | tail -1)"
AVEC="$($P -d $DB -At -c "select string_agg(w || '=' || h, ';' order by w) from t23.d_with")"
NOFF2="$($P -d $DB2 -At -c "select count(*) from official_runs")"
NOFF1="$($P -d $DB -At -c "select count(*) from official_runs")"

BAD=0
$P -d $DB -At -F'|' -c "select ok, name, coalesce(detail, '') from t23.res23 order by name" > "$TMP/res.txt"
TOTAL=$(wc -l < "$TMP/res.txt"); FAILS=$(grep -c '^f|' "$TMP/res.txt" || true)
while IFS='|' read -r ok name detail; do if [ "$ok" = t ]; then echo "  ok   $name"; else echo "  FAIL $name${detail:+ — $detail}"; fi; done < "$TMP/res.txt"
[ -n "$DEF1" ] && [ "$DEF1" = "$DEF2" ] && echo "  ok   R relançable : fonctions, contraintes et droits de official_runs identiques après la 2e et la 3e passe" || { echo "  FAIL R relançable : définitions différentes"; BAD=1; }
if [ -n "$SANS" ] && [ "$SANS" = "$AVEC" ] && [ "$NOFF1" = 7 ] && [ "$NOFF2" = 0 ]; then
  echo "  ok   D saison 2 close, duel réglé et record envoyé AVEC 7 amorces (plus rapides que tous) et SANS amorce : points, classement, rang, historique des divisions, divisions, participants, duels et Elo IDENTIQUES"
else echo "  FAIL D avec / sans amorces : différent ($NOFF1 / $NOFF2 amorces)"; echo "    avec : $AVEC"; echo "    sans : $SANS"; BAD=1; fi
VPA="$(grep -E '^étape 23' "$TMP/vp-avant.txt" || true)"
[ "$(echo "$VPA" | grep -c '|MANQUE$')" -ge 2 ] && echo "  ok   verify-prod.sql AVANT l'étape 23 : ses lignes disent MANQUE" || { echo "  FAIL verify-prod.sql avant l'étape 23 : MANQUE attendu"; echo "$VPA"; BAD=1; }
VPE="$(grep -E '^étape 23' "$TMP/vp.txt" || true)"
if echo "$VPE" | grep -qE '\|(MANQUE|ÉCART)$'; then echo "  FAIL verify-prod.sql après l'étape 23 : lignes MANQUE / ÉCART :"; echo "$VPE" | grep -E '\|(MANQUE|ÉCART)$'; BAD=1; else echo "  ok   verify-prod.sql après l'étape 23 : lignes « étape 23 » sans MANQUE ni ÉCART"; fi
[ "$(echo "$VPE" | grep -c 'étape 23')" -ge 3 ] || { echo "  FAIL verify-prod.sql : lignes de l'étape 23 absentes"; BAD=1; }
if grep -qE '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; then echo "  FAIL verify-prod.sql sur la base complète (étapes 1 à 23) : lignes MANQUE / ÉCART :"; grep -E '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; BAD=1; else echo "  ok   verify-prod.sql sur la base complète (étapes 1 à 23) : aucune ligne MANQUE ni ÉCART"; fi
if [ "$FAILS" -gt 0 ] || [ "$TOTAL" -lt 30 ] || [ "$BAD" != 0 ]; then echo "ÉCHEC : étape 23 ($FAILS échec(s) sur $TOTAL)"; grep -ih 'error\|erreur' "$TMP/apres.out" "$TMP/lire.out" "$TMP/d.out" | head -10 || true; exit 1; fi
echo "RESULT étape 23 : $TOTAL contrôles réussis (écriture réservée au service, amorces sans effet sur saisons / divisions / duels / rangs, rival juste devant, boîte de réception bornée et personnelle) + verify-prod.sql ; relançable"
