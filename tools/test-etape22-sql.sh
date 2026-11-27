#!/usr/bin/env bash
# Teste supabase/etape22-moderation.sql (outils de modération, COMPLETE-004) sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape22-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest22) : étapes 1 à 21, des comptes et des données, PUIS l'étape 22 (deux fois : relançable). Ce que le test exige :
#   R  refus : CHAQUE fonction mod_* (et la fonction interne d'écriture), sous le rôle anon (sans session) comme sous authenticated (joueur non modérateur), est refusée, AVANT toute lecture
#      ou écriture ; le message est celui du contrôle de modérateur, et rien n'a changé ; le journal et les suspensions ne se lisent pas non plus par l'API ;
#   M  un modérateur : voit la file (pagination bornée), masque / rétablit un circuit et un commentaire avec un motif obligatoire, consulte les signalements (jamais qui a signalé),
#      suspend / réactive un compte (motif, date), lit le journal ; un circuit masqué n'est plus listé, ses données restent ;
#   J  journal : chaque décision y laisse une ligne (qui, quoi, quand, pourquoi) ; mod_hide (étape 13) y passe aussi ; la suppression d'un compte anonymise ses lignes ;
#   S  suspension : un compte suspendu ne publie plus (circuit, mode, playlist, nom d'un circuit) ni ne commente, par TOUTES les voies ; ses temps, ses j'aime, ses contenus
#      publiés restent ; levée, ou échue, il retrouve ces droits ; un modérateur ne se suspend pas ni ne suspend un autre modérateur ;
#   C  concurrence : deux modérateurs simultanés sur le même contenu : une seule décision, une seule ligne de journal ;
#   I  relançable (définitions identiques aux 2e et 3e passes), aucune donnée existante touchée, verify-prod.sql.
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
cd "$(dirname "$0")/.."
DB=copytrack_sqltest22
P="psql -v ON_ERROR_STOP=1 -q -X"
TMP="$(mktemp -d)"
if [ -n "${GARDER:-}" ]; then trap 'rm -rf "$TMP"' EXIT; else trap 'rm -rf "$TMP"; psql -q -X -d postgres -c "drop database if exists '"$DB"'" >/dev/null 2>&1 || true' EXIT; fi          # GARDER=1 : conserve la base pour l'examiner
$P -d postgres -c "drop database if exists $DB" -c "create database $DB"
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
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite 18-maintenance 19-avis 20-droits-et-regles 21-recuperation; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

cat > "$TMP/avant.sql" <<'SQL'
\set ON_ERROR_STOP off
-- Objets d'ESSAI dans un schéma à part : verify-prod.sql ne regarde que « public » (il ne doit signaler aucun de nos outils de test).
create schema t22;
grant usage on schema t22 to public;
create table t22.res22 (name text, ok boolean, detail text);
grant all on t22.res22 to public;
create function t22.check22(n text, c boolean, d text default null) returns void language plpgsql security definer as $$ begin insert into t22.res22 values (n, coalesce(c, false), d); end $$;
grant execute on function t22.check22(text, boolean, text) to public;
-- Session du jeu : auth.uid() du faux schéma (null : sans session).
create function t22.as22(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), false); end $$;
grant execute on function t22.as22(uuid) to public;
-- 'OK' si la requête réussit, sinon le message de l'erreur (refus de droit, exception de la fonction…). Exécutée avec les droits de l'appelant.
create function t22.err22(q text) returns text language plpgsql as $$ begin execute q; return 'OK'; exception when others then return sqlerrm; end $$;
grant execute on function t22.err22(text) to public;
-- La valeur (texte) de la première colonne de la première ligne ; 'ERREUR : …' si la requête échoue.
create function t22.val22(q text) returns text language plpgsql as $$ declare v text; begin execute q into v; return v; exception when others then return 'ERREUR : ' || sqlerrm; end $$;
grant execute on function t22.val22(text) to public;

-- Joueurs : alice et mod2 (modératrices, comptes), bob et erin (comptes), zed (compte, supprimé en fin de test), carl et dave (invités), fay et gus (invités qui signalent).
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'alice@accounts.copytrack.invalid', '{"username":"Alice"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'mod2@accounts.copytrack.invalid', '{"username":"Mod2"}'),
  ('00000000-0000-0000-0000-0000000000b2', 'bob@accounts.copytrack.invalid', '{"username":"Bob"}'),
  ('00000000-0000-0000-0000-0000000000e5', 'erin@accounts.copytrack.invalid', '{"username":"Erin"}'),
  ('00000000-0000-0000-0000-0000000000f6', 'zed@accounts.copytrack.invalid', '{"username":"Zed"}');
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000c3', true), ('00000000-0000-0000-0000-0000000000d4', true),
  ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true);
insert into public.players (id, name, created_at) values
  ('00000000-0000-0000-0000-0000000000a1', 'Alice', now() - interval '5 days'), ('00000000-0000-0000-0000-0000000000a2', 'Mod2', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000b2', 'Bob', now() - interval '5 days'), ('00000000-0000-0000-0000-0000000000e5', 'Erin', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000f6', 'Zed', now() - interval '5 days'), ('00000000-0000-0000-0000-0000000000c3', 'Carl', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000d4', 'Dave', now() - interval '5 days'), ('00000000-0000-0000-0000-0000000000e1', 'Fay', now() - interval '5 days'),
  ('00000000-0000-0000-0000-0000000000e2', 'Gus', now() - interval '5 days');
insert into public.moderators values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
-- Circuits : t1 et t3 (Carl), t2 (Erin) ; t1 est signalé deux fois (deux invités : « compte » vrai pour la base).
insert into public.tracks (id, author, name, decor, code, signature, author_time, pieces, description) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000c3', 'Circuit de Carl', 'x', 'code1', 'sig1', 30, 5, 'desc 1'),
  ('00000000-0000-0000-0000-00000000f102', '00000000-0000-0000-0000-0000000000e5', 'Circuit d''Erin', 'x', 'code2', 'sig2', 30, 5, 'desc 2'),
  ('00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000c3', 'Autre circuit de Carl', 'x', 'code3', 'sig3', 30, 5, 'desc 3');
insert into public.track_reports (track_id, player, counts, created_at) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000e1', true, now() - interval '2 hours'),
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000e2', false, now() - interval '1 hour');
update public.tracks set reports = 2 where id = '00000000-0000-0000-0000-00000000f101';
-- Commentaires : c1 (Dave, sur t1, signalé deux fois : lignes d'AVANT l'étape 22, sans date) ; c2 (Bob, sur t1, non signalé).
insert into public.track_comments (id, track_id, author, body, created_at) overriding system value values          -- (anciens : la limite de débit de comment_add, 20 s, ne doit pas gêner les essais)
  (1, '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000d4', 'un commentaire désagréable', now() - interval '2 days'),
  (2, '00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000b2', 'un commentaire sympa', now() - interval '2 days');
insert into public.comment_reports (comment_id, player) values (1, '00000000-0000-0000-0000-0000000000b2'), (1, '00000000-0000-0000-0000-0000000000e5');
update public.track_comments set reports = 2 where id = 1;
select setval(pg_get_serial_sequence('public.track_comments', 'id'), 1000);          -- (les identifiants 1 et 2 ont été posés à la main : la suite repart de 1001)
-- 120 commentaires signalés d'un coup : de quoi vérifier que la pagination de la file est bornée.
insert into public.track_comments (track_id, author, body, reports) select '00000000-0000-0000-0000-00000000f103', '00000000-0000-0000-0000-0000000000d4', 'bruit ' || g, 1 from generate_series(1, 120) g;
-- Des temps d'Erin : ils doivent survivre à sa suspension.
insert into public.scores (track_key, player, time, inputs, phys_ver) values ('b-x-1', '00000000-0000-0000-0000-0000000000e5', 30.5, 'IN', 39);
-- Photo des données AVANT l'étape (empreinte de chaque table) : l'étape n'en touche aucune.
create table t22.photo22 as
  select 'accounts' t, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from accounts) x
  union all select 'cloud_saves', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from cloud_saves) x
  union all select 'players', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from players) x
  union all select 'scores', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from scores) x
  union all select 'auth.users', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from auth.users) x
  union all select 'tracks', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from tracks) x
  union all select 'track_comments', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from track_comments) x
  union all select 'track_reports', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from track_reports) x
  union all select 'comment_reports', md5(coalesce(string_agg((x.comment_id, x.player)::text, '|' order by (x.comment_id, x.player)::text), '')) from (select * from comment_reports) x
  union all select 'moderators', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from moderators) x;
SQL
$P -d $DB -f "$TMP/avant.sql" > "$TMP/avant.out" 2>&1 || true
if grep -qiE 'error|erreur' "$TMP/avant.out"; then echo "ÉCHEC : la préparation des données d'essai a échoué :"; grep -iE 'error|erreur' "$TMP/avant.out" | head; exit 1; fi
# verify-prod.sql AVANT l'étape : ses lignes « étape 22 » disent MANQUE.
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp-avant.txt"

# L'étape, DEUX fois (relançable), définitions identiques entre la 2e et la 3e passe.
$P -d $DB -f supabase/etape22-moderation.sql >/dev/null
$P -d $DB -f supabase/etape22-moderation.sql >/dev/null
DEF="select md5(string_agg(pg_get_functiondef(p.oid), '|' order by p.oid::regprocedure::text)) from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname like 'moderation\_%')"
DEF1="$($P -d $DB -At -c "$DEF")"
$P -d $DB -f supabase/etape22-moderation.sql >/dev/null
DEF2="$($P -d $DB -At -c "$DEF")"
NFUNC="$($P -d $DB -At -c "select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname like 'moderation\_%')")"

# verify-prod.sql sur la base COMPLÈTE (étapes 1 à 22), avant tout objet d'essai de la suite.
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp.txt"

cat > "$TMP/apres.sql" <<'SQL'
\set ON_ERROR_STOP off
select t22.check22('aucune donnée existante touchée par l''étape : accounts, cloud_saves, players, scores, auth.users, tracks, track_comments, track_reports, comment_reports, moderators identiques',
  not exists (select 1 from t22.photo22 p join (
    select 'accounts' t, md5(coalesce(string_agg(x::text, '|' order by x::text), '')) h from (select * from accounts) x
    union all select 'cloud_saves', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from cloud_saves) x
    union all select 'players', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from players) x
    union all select 'scores', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from scores) x
    union all select 'auth.users', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from auth.users) x
    union all select 'tracks', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from tracks) x
    union all select 'track_comments', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from track_comments) x
    union all select 'track_reports', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from track_reports) x
    union all select 'comment_reports', md5(coalesce(string_agg((x.comment_id, x.player)::text, '|' order by (x.comment_id, x.player)::text), '')) from (select * from comment_reports) x
    union all select 'moderators', md5(coalesce(string_agg(x::text, '|' order by x::text), '')) from (select * from moderators) x) n on n.t = p.t where n.h is distinct from p.h));
select t22.check22('les signalements de commentaires d''AVANT l''étape gardent une date inconnue (null), pas une date inventée', (select count(*) from comment_reports where created_at is null) = 2);

-- ================================================================ R. Refus
create table t22.calls22 (name text primary key, q text not null);
insert into t22.calls22 values
  ('mod_queue', $$select * from mod_queue()$$),
  ('mod_detail', $$select mod_detail('track', '00000000-0000-0000-0000-00000000f101')$$),
  ('mod_reports', $$select * from mod_reports('track', '00000000-0000-0000-0000-00000000f101')$$),
  ('mod_set_track_hidden', $$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, 'motif de test')$$),
  ('mod_set_track_hidden (rétablir)', $$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', false, 'motif de test')$$),
  ('mod_set_comment_hidden', $$select mod_set_comment_hidden(1, true, 'motif de test')$$),
  ('mod_hide', $$select mod_hide('track', '00000000-0000-0000-0000-00000000f101', true)$$),
  ('mod_suspend', $$select mod_suspend('00000000-0000-0000-0000-0000000000c3', 'motif de test', null)$$),
  ('mod_unsuspend', $$select mod_unsuspend('00000000-0000-0000-0000-0000000000c3', 'motif de test')$$),
  ('mod_suspensions', $$select * from mod_suspensions()$$),
  ('mod_log', $$select * from mod_log()$$),
  ('moderation_apply_hide (interne)', $$select moderation_apply_hide('track', '00000000-0000-0000-0000-00000000f101', true, 'motif de test', true)$$),
  ('moderation_active_suspension (interne)', $$select moderation_active_suspension('00000000-0000-0000-0000-0000000000c3')$$);
grant select on t22.calls22 to public;

set role anon; select t22.as22(null);
select t22.check22('R anon (sans session) : CHAQUE fonction de modération est refusée (droit d''exécution retiré), y compris mod_status',
  not exists (select 1 from t22.calls22 where t22.err22(q) = 'OK') and t22.err22('select mod_status()') like 'permission denied%',
  (select string_agg(name || ' → ' || t22.err22(q), ' ; ') from t22.calls22 where t22.err22(q) = 'OK'));
select t22.check22('R anon : ni le journal ni les suspensions ne se lisent ni ne s''écrivent par l''API', t22.err22('select * from moderation_log') like 'permission denied%' and t22.err22('select * from account_suspensions') like 'permission denied%'
  and t22.err22($$insert into moderation_log (action, kind, target, reason) values ('hide', 'track', 'x', 'abc')$$) like 'permission denied%' and t22.err22($$insert into account_suspensions (user_id, reason) values (gen_random_uuid(), 'abc')$$) like 'permission denied%');
reset role;

set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000b2');          -- Bob : un compte, pas modérateur
select t22.check22('R authenticated (Bob, non modérateur) : CHAQUE fonction de modération est refusée par le contrôle de modérateur (message « Réservé aux modérateurs. »), avant tout effet',
  not exists (select 1 from t22.calls22 where t22.err22(q) <> 'Réservé aux modérateurs.' and q not like '%moderation_%'),
  (select string_agg(name || ' → ' || t22.err22(q), ' ; ') from t22.calls22 where t22.err22(q) <> 'Réservé aux modérateurs.' and q not like '%moderation_%'));
select t22.check22('R authenticated : les fonctions INTERNES (moderation_*) ne s''appellent pas par l''API (droit d''exécution retiré)',
  (select bool_and(t22.err22(q) like 'permission denied%') from t22.calls22 where q like '%moderation_%'));
select t22.check22('R authenticated : mod_status répond FAUX à un joueur ordinaire (et ne prend aucun identifiant : on ne peut pas interroger le statut d''un autre)',
  t22.val22('select mod_status()') = 'false' and (select pronargs from pg_proc where proname = 'mod_status') = 0);
select t22.check22('R authenticated : le journal et les suspensions ne se lisent ni ne s''écrivent par l''API',
  t22.err22('select * from moderation_log') like 'permission denied%' and t22.err22('select * from account_suspensions') like 'permission denied%'
  and t22.err22($$insert into moderation_log (action, kind, target, reason) values ('hide', 'track', 'x', 'abc')$$) like 'permission denied%'
  and t22.err22($$update moderation_log set reason = 'efface'$$) like 'permission denied%' and t22.err22($$delete from moderation_log$$) like 'permission denied%'
  and t22.err22($$insert into account_suspensions (user_id, reason) values ('00000000-0000-0000-0000-0000000000b2', 'abc')$$) like 'permission denied%'
  and t22.err22($$delete from account_suspensions$$) like 'permission denied%');
select t22.check22('R authenticated : on ne se fait pas modérateur (moderators fermée) ni ne lit le statut d''autrui (is_moderator fermée)',
  t22.err22($$insert into moderators values ('00000000-0000-0000-0000-0000000000b2')$$) like 'permission denied%' and t22.err22($$select is_moderator('00000000-0000-0000-0000-0000000000a1')$$) like 'permission denied%');
reset role;
select t22.check22('R rien n''a changé après tous ces refus : aucun circuit ni commentaire masqué, journal vide, aucune suspension',
  (select count(*) from tracks where hidden) = 0 and (select count(*) from track_comments where hidden) = 0 and (select count(*) from moderation_log) = 0 and (select count(*) from account_suspensions) = 0);

-- Droits et forme des fonctions, lus dans le catalogue.
select t22.check22('R catalogue : les fonctions mod_* et moderation_* sont toutes SECURITY DEFINER avec un search_path fixé', (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname like 'moderation\_%')) >= 14
  and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname like 'moderation\_%') and (not p.prosecdef or p.proconfig is null or array_to_string(p.proconfig, ',') not like 'search_path=%')));
select t22.check22('R catalogue : TOUTES les fonctions mod_* (hors mod_status, qui renvoie is_moderator pour l''appelant) et moderation_apply_hide COMMENCENT par « if not is_moderator(… » avant toute autre instruction',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname = 'moderation_apply_hide') and p.proname <> 'mod_status'
    and p.prosrc !~ '^\s*(#variable_conflict use_column\s+)?(declare[^\n]*\n\s*)?begin\s+if not is_moderator\('),
  (select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname = 'moderation_apply_hide') and p.proname <> 'mod_status'
    and p.prosrc !~ '^\s*(#variable_conflict use_column\s+)?(declare[^\n]*\n\s*)?begin\s+if not is_moderator\('));
select t22.check22('R catalogue : mod_status ne fait que renvoyer is_moderator(auth.uid())', (select regexp_replace(prosrc, '\s+', ' ', 'g') from pg_proc where proname = 'mod_status') ~ '^ ?begin return is_moderator\(auth\.uid\(\)\); end ?$');
select t22.check22('R catalogue : les fonctions mod_* ne sont exécutables que par authenticated (ni public, ni anon) ; les internes par aucun rôle de l''API',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'mod\_%' and (has_function_privilege('anon', p.oid, 'execute') or not has_function_privilege('authenticated', p.oid, 'execute')))
  and not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'moderation\_%' and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))));
select t22.check22('R catalogue : tables moderation_log et account_suspensions : RLS active, aucun droit pour anon ni authenticated, aucune règle',
  (select bool_and(c.relrowsecurity) from pg_class c where c.relname in ('moderation_log', 'account_suspensions') and c.relnamespace = 'public'::regnamespace)
  and not exists (select 1 from pg_class c where c.relname in ('moderation_log', 'account_suspensions') and c.relnamespace = 'public'::regnamespace
    and (has_table_privilege('anon', c.oid, 'select,insert,update,delete,truncate') or has_table_privilege('authenticated', c.oid, 'select,insert,update,delete,truncate')))
  and not exists (select 1 from pg_policies where tablename in ('moderation_log', 'account_suspensions')));
select t22.check22('R aucune fonction de modération ne supprime de données : aucun « delete » ni « truncate » dans leur code',
  not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and (p.proname like 'mod\_%' or p.proname like 'moderation\_%') and p.proname <> 'mod_hide_legacy' and p.prosrc ~* '\m(delete|truncate|drop)\M'));
select t22.check22('R mod_reports ne renvoie jamais qui a signalé : colonnes (reported_at, counted) seulement', pg_get_function_result('mod_reports(text,text)'::regprocedure) = 'TABLE(reported_at timestamp with time zone, counted boolean)');

-- ================================================================ M. Un modérateur
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');          -- Alice : modératrice
select t22.check22('M mod_status : vrai pour une modératrice', t22.val22('select mod_status()') = 'true');
select t22.check22('M la file (défaut : à examiner) liste le circuit signalé et le commentaire signalé, avec leurs compteurs et le nom de l''auteur',
  (select count(*) from mod_queue() where kind = 'track' and id = '00000000-0000-0000-0000-00000000f101' and reports = 2 and counted = 1 and author_name = 'Carl' and pending and not hidden and last_report_at is not null) = 1
  and (select count(*) from mod_queue() where kind = 'comment' and id = '1' and reports = 2 and author_name = 'Dave' and label = 'un commentaire désagréable' and pending and last_report_at is null) = 1);
select t22.check22('M la file ne liste ni le circuit non signalé ni le commentaire non signalé', not exists (select 1 from mod_queue('all', 'all', 100, 0) where id in ('00000000-0000-0000-0000-00000000f102', '2')));
select t22.check22('M la file : pagination bornée à 100 lignes par appel, même si on en demande bien plus ; au moins 1 ; décalage négatif ignoré',
  (select count(*) from mod_queue('comment', 'all', 100000, 0)) = 100 and (select count(*) from mod_queue('comment', 'all', 0, 0)) = 1 and (select count(*) from mod_queue('comment', 'all', -5, -9)) = 1
  and (select count(*) from mod_queue('comment', 'all', 100, 100)) = 21 and (select count(*) from mod_queue('track', 'all', 100, 0)) = 1);
select t22.check22('M la file : type ou état inconnu refusé', t22.err22($$select * from mod_queue('mode')$$) = 'Type inconnu.' and t22.err22($$select * from mod_queue('all', 'x')$$) = 'État inconnu.');
select t22.check22('M les signalements d''un circuit : leur date et s''ils comptent, rien d''autre', (select count(*) from mod_reports('track', '00000000-0000-0000-0000-00000000f101')) = 2
  and (select count(*) filter (where counted) from mod_reports('track', '00000000-0000-0000-0000-00000000f101')) = 1 and (select count(*) from mod_reports('comment', '1')) = 2);
select t22.check22('M la fiche d''un circuit : texte public, compteurs, auteur, pas de suspension, historique vide',
  t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') ->> 'name'$$) = 'Circuit de Carl'
  and t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') #>> '{author,name}'$$) = 'Carl'
  and t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') #>> '{author,suspension}'$$) is null
  and t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') ->> 'history'$$) = '[]'
  and t22.val22($$select mod_detail('comment', '1') ->> 'body'$$) = 'un commentaire désagréable'
  and t22.err22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f1ff')$$) = 'Contenu introuvable.' and t22.err22($$select mod_detail('track', 'pas-un-id')$$) = 'Identifiant de circuit invalide.');
select t22.check22('M la fiche ne contient aucun identifiant de joueur qui a signalé (le texte de la fiche ne cite ni Bob ni Erin qui ont signalé le commentaire)',
  t22.val22($$select (mod_detail('comment', '1'))::text ~ '(0000000000b2|0000000000e5)'$$) = 'false');

-- Masquer un circuit : motif obligatoire.
select t22.check22('M masquer : sans motif, ou avec un motif trop court, refusé, sans effet',
  t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, '')$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, 'ab')$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, null)$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, repeat('x', 301))$$) = 'Un motif de 3 à 300 caractères est obligatoire.');
select t22.check22('M masquer un circuit inconnu : refusé', t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f1ff', true, 'motif de test')$$) = 'Circuit introuvable.');
select t22.check22('M masquer un circuit : réussit', t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, '  Insultes dans la description  ')$$) = 'OK');
reset role;
select t22.check22('M le circuit masqué EXISTE toujours en base, tous ses champs intacts (masquer n''est pas supprimer)', (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f101' and hidden and name = 'Circuit de Carl' and code = 'code1' and reports = 2) = 1
  and (select count(*) from track_reports where track_id = '00000000-0000-0000-0000-00000000f101') = 2);
set role anon; select t22.as22(null);
select t22.check22('M un circuit masqué n''est plus listé : ni pour un visiteur (anon), ni dans la lecture publique des circuits', (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f101') = 0 and (select count(*) from tracks) = 2);
reset role;
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000b2');
select t22.check22('M un circuit masqué n''est plus listé pour un joueur ordinaire (Bob) ; son auteur (Carl) le voit encore', (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f101') = 0 and t22.val22($$select mod_status()$$) = 'false');
select t22.as22('00000000-0000-0000-0000-0000000000c3');
select t22.check22('M son auteur le voit encore (règle « Circuits visibles »)', (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f101') = 1);
select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('M mod_queue (états) : masqué et examiné → plus « à examiner », mais listé dans « masqués » et « tous »',
  (select count(*) from mod_queue('track', 'pending', 100, 0)) = 0 and (select count(*) from mod_queue('track', 'hidden', 100, 0) where id = '00000000-0000-0000-0000-00000000f101' and hidden and not pending) = 1);
select t22.check22('M masquer deux fois : refusé (« déjà masqué »), et aucune seconde ligne de journal', t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', true, 'motif de test')$$) = 'Ce circuit est déjà masqué.');
select t22.check22('M la fiche montre la décision déjà prise (historique : qui, quoi, pourquoi)',
  t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') #>> '{history,0,reason}'$$) = 'Insultes dans la description'
  and t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') #>> '{history,0,actor_name}'$$) = 'Alice'
  and t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f101') #>> '{history,0,action}'$$) = 'hide');
-- Un NOUVEAU signalement (par Bob, compte de plus de 24 h) : le circuit redevient « à examiner », et reste masqué.
select t22.as22('00000000-0000-0000-0000-0000000000b2');
select report_track('00000000-0000-0000-0000-00000000f101');
select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('M un signalement APRÈS la décision remet le circuit « à examiner » (3 > 2), toujours masqué ; un signalement ne le rétablit jamais',
  (select count(*) from mod_queue('track', 'pending', 100, 0) where id = '00000000-0000-0000-0000-00000000f101' and reports = 3 and hidden and pending) = 1);
select t22.check22('M rétablir un circuit : réussit, avec motif ; le rétablir deux fois : refusé', t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', false, 'Description corrigée par l''auteur')$$) = 'OK'
  and t22.err22($$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f101', false, 'motif de test')$$) = 'Ce circuit est déjà visible.');
reset role;
set role anon; select t22.as22(null);
select t22.check22('M un circuit rétabli est de nouveau listé', (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f101') = 1);
reset role;

-- Masquer un commentaire.
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('M masquer un commentaire : réussit ; inconnu et sans motif refusés', t22.err22($$select mod_set_comment_hidden(1, true, '')$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_set_comment_hidden(99999, true, 'motif de test')$$) = 'Commentaire introuvable.' and t22.err22($$select mod_set_comment_hidden(1, true, 'Propos injurieux')$$) = 'OK'
  and t22.err22($$select mod_set_comment_hidden(1, true, 'motif de test')$$) = 'Ce commentaire est déjà masqué.');
select t22.as22(null);
reset role;
set role anon; select t22.as22(null);
select t22.check22('M un commentaire masqué n''est plus listé (track_comments_list) et la ligne existe toujours', (select count(*) from track_comments_list('00000000-0000-0000-0000-00000000f101', 100, 0) where id = 1) = 0
  and (select count(*) from track_comments_list('00000000-0000-0000-0000-00000000f101', 100, 0) where id = 2) = 1);
reset role;
select t22.check22('M le commentaire masqué existe toujours en base, intact', (select count(*) from track_comments where id = 1 and hidden and body = 'un commentaire désagréable' and reports = 2) = 1);
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('M rétablir un commentaire : réussit', t22.err22($$select mod_set_comment_hidden(1, false, 'Faux positif, commentaire correct')$$) = 'OK');
reset role;
select t22.check22('M le commentaire rétabli est de nouveau visible', (select count(*) from track_comments where id = 1 and not hidden) = 1);

-- mod_hide (étape 13) : toujours là, même effet, désormais journalisée.
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('M mod_hide (étape 13) : masque / rétablit encore, sans erreur sur un état déjà atteint ni un contenu inconnu ; type inconnu refusé',
  t22.err22($$select mod_hide('track', '00000000-0000-0000-0000-00000000f103', true)$$) = 'OK' and t22.err22($$select mod_hide('track', '00000000-0000-0000-0000-00000000f103', true)$$) = 'OK'
  and t22.err22($$select mod_hide('track', '00000000-0000-0000-0000-00000000f1ff', true)$$) = 'OK' and t22.err22($$select mod_hide('comment', '2', true)$$) = 'OK' and t22.err22($$select mod_hide('truc', '2', true)$$) = 'Type inconnu.');
select t22.err22($$select mod_hide('track', '00000000-0000-0000-0000-00000000f103', false)$$), t22.err22($$select mod_hide('comment', '2', false)$$) \gset
reset role;

-- ================================================================ J. Journal
select t22.check22('J chaque décision a laissé UNE ligne : qui (Alice), quoi, sur quoi, qui était visé, pourquoi, et le nombre de signalements vus',
  (select count(*) from moderation_log where kind = 'track' and target = '00000000-0000-0000-0000-00000000f101' and action = 'hide' and actor = '00000000-0000-0000-0000-0000000000a1' and reason = 'Insultes dans la description'
     and target_user = '00000000-0000-0000-0000-0000000000c3' and reports_seen = 2) = 1
  and (select count(*) from moderation_log where kind = 'track' and target = '00000000-0000-0000-0000-00000000f101' and action = 'restore' and reports_seen = 3 and reason = 'Description corrigée par l''auteur') = 1
  and (select count(*) from moderation_log where kind = 'comment' and target = '1' and action = 'hide' and target_user = '00000000-0000-0000-0000-0000000000d4' and reason = 'Propos injurieux') = 1
  and (select count(*) from moderation_log where kind = 'comment' and target = '1' and action = 'restore') = 1);
select t22.check22('J les refus (état déjà atteint, motif manquant, non-modérateur) n''ont laissé aucune ligne : 4 lignes pour les 4 décisions ci-dessus, plus celles de mod_hide',
  (select count(*) from moderation_log where target in ('00000000-0000-0000-0000-00000000f101', '1')) = 4);
select t22.check22('J mod_hide laisse aussi une ligne (motif générique), une seule par changement réel : le 1er masquage et le rétablissement de f103, le masquage puis le rétablissement du commentaire 2',
  (select count(*) from moderation_log where target = '00000000-0000-0000-0000-00000000f103') = 2 and (select count(*) from moderation_log where kind = 'comment' and target = '2') = 2
  and (select count(*) from moderation_log where reason like 'Décision prise par mod_hide%') = 4);
select t22.check22('J la date est celle de la décision', (select bool_and(at > now() - interval '1 hour' and at <= now()) from moderation_log));
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('J le modérateur lit le journal (récent d''abord, filtrable par contenu, pagination bornée) ; les noms sont ceux, publics, des joueurs',
  (select count(*) from mod_log()) = 8 and (select count(*) from mod_log('track', '00000000-0000-0000-0000-00000000f101')) = 2
  and (select actor_name from mod_log('track', '00000000-0000-0000-0000-00000000f101') limit 1) = 'Alice' and (select target_name from mod_log('track', '00000000-0000-0000-0000-00000000f101') limit 1) = 'Carl'
  and (select count(*) from mod_log(null, null, 3, 0)) = 3 and (select count(*) from mod_log(null, null, 100000, 0)) <= 100 and (select id from mod_log() limit 1) = (select max(id) from mod_log()));
reset role;

-- ================================================================ S. Suspension
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('S suspendre : motif obligatoire, date de fin future (moins de 10 ans), compte connu, pas soi-même, pas un modérateur',
  t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', '', null)$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'motif de test', now() - interval '1 hour')$$) like 'La date de fin doit être dans le futur%'
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'motif de test', now() + interval '4000 days')$$) like 'La date de fin doit être dans le futur%'
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-000000000999', 'motif de test', null)$$) = 'Compte introuvable.'
  and t22.err22($$select mod_suspend(null, 'motif de test', null)$$) = 'Compte introuvable.'
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000a1', 'motif de test', null)$$) = 'On ne se suspend pas soi-même.'
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000a2', 'motif de test', null)$$) like 'Un modérateur ne se suspend pas%');
reset role;
select t22.check22('S ces refus n''ont créé aucune suspension', (select count(*) from account_suspensions) = 0);
-- Avant la suspension : Erin publie et commente (témoins), Bob commente.
insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-0000000000e5', 'Circuit d''Erin 2', 'x', 'code4', 'sig4', 30, 5);
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('S suspendre Erin (24 h, motif) : réussit et renvoie un identifiant', t22.val22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'Spam de commentaires', now() + interval '1 day')$$) ~ '^[0-9]+$');
select t22.check22('S une suspension en cours : on ne la double pas', t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'motif de test', null)$$) like 'Ce compte est déjà suspendu%');
select t22.check22('S la liste des suspensions : active, avec son motif, sa fin, le nom du modérateur',
  (select count(*) from mod_suspensions() where name = 'Erin' and reason = 'Spam de commentaires' and active and until > now() and created_by_name = 'Alice') = 1);
select t22.check22('S la fiche d''un circuit d''Erin annonce sa suspension', t22.val22($$select mod_detail('track', '00000000-0000-0000-0000-00000000f102') #>> '{author,suspension,reason}'$$) = 'Spam de commentaires');
reset role;
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000e5');
select t22.check22('S Erin suspendue ne peut PAS commenter (comment_add)', t22.err22($$select comment_add('00000000-0000-0000-0000-00000000f101', 'je commente')$$) like 'Compte suspendu : publier et commenter est impossible jusqu’au %(UTC).');
select t22.check22('S … ni publier un mode (mode_publish)', t22.err22($$select mode_publish('Mon mode', '', '', null)$$) like 'Compte suspendu%');
select t22.check22('S … ni créer une playlist (playlist_save)', t22.err22($$select playlist_save(null, 'Ma liste', true, '{}')$$) like 'Compte suspendu%');
select t22.check22('S … ni changer le nom ou la description d''un de ses circuits (update_track_meta)', t22.err22($$select update_track_meta('00000000-0000-0000-0000-00000000f102', 'Nouveau nom', 'Nouvelle description')$$) like 'Compte suspendu%');
reset role;
set role service_role;
select t22.check22('S … ni publier un circuit par la fonction serveur (publish_track), ni en republier un (mise à jour du code)', t22.err22($$select publish_track('00000000-0000-0000-0000-0000000000e5', 'Neuf', 'x', 'codeN', 'sigN', 31, 5, 1, '', null)$$) like 'Compte suspendu%'
  and t22.err22($$select publish_track('00000000-0000-0000-0000-0000000000e5', 'Circuit d''Erin', 'x', 'code2bis', 'sig2', 31, 5, 1, '', null)$$) like 'Compte suspendu%');
reset role;
select t22.check22('S … et aucune insertion directe en base ne contourne la garde (déclencheur)', t22.err22($$insert into tracks (author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-0000000000e5', 'x', 'x', 'c', 's9', 30, 5)$$) like 'Compte suspendu%'
  and t22.err22($$insert into track_comments (track_id, author, body) values ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-0000000000e5', 'direct')$$) like 'Compte suspendu%');
select t22.check22('S la suspension laisse tout le reste : ses temps sont là, ses circuits restent publiés et visibles',
  (select count(*) from scores where player = '00000000-0000-0000-0000-0000000000e5' and time = 30.5) = 1 and (select count(*) from tracks where author = '00000000-0000-0000-0000-0000000000e5' and not hidden) = 2);
set role service_role;
select t22.check22('S … et un NOUVEAU temps s''enregistre encore (submit_best) : la suspension ne touche pas aux classements', t22.val22($$select submit_best('00000000-0000-0000-0000-0000000000e5', 'b-x-1', 29.25, 'IN2', 39, 'nm') ->> 'improved'$$) = 'true');
reset role;
select t22.check22('S … le nouveau temps est bien en base', (select count(*) from scores where player = '00000000-0000-0000-0000-0000000000e5' and time = 29.25) = 1);
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000e5');
select t22.check22('S … elle peut encore aimer et signaler (hors publication), et retirer SES propres contenus', t22.err22($$select toggle_like('00000000-0000-0000-0000-00000000f101')$$) = 'OK'
  and t22.err22($$select report_track('00000000-0000-0000-0000-00000000f103')$$) = 'OK' and t22.err22($$delete from tracks where id = '00000000-0000-0000-0000-00000000f104'$$) = 'OK');
select t22.as22('00000000-0000-0000-0000-0000000000b2');
select t22.check22('S les autres joueurs ne sont pas touchés : Bob commente', t22.err22($$select comment_add('00000000-0000-0000-0000-00000000f101', 'bonjour')$$) = 'OK');
reset role;
-- Levée.
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('S réactiver : motif obligatoire ; un compte non suspendu ne se réactive pas', t22.err22($$select mod_unsuspend('00000000-0000-0000-0000-0000000000e5', '')$$) = 'Un motif de 3 à 300 caractères est obligatoire.'
  and t22.err22($$select mod_unsuspend('00000000-0000-0000-0000-0000000000b2', 'motif de test')$$) = 'Ce compte n’est pas suspendu.');
select t22.check22('S réactiver Erin : réussit', t22.err22($$select mod_unsuspend('00000000-0000-0000-0000-0000000000e5', 'Elle s''est excusée')$$) = 'OK');
select t22.check22('S la suspension levée reste dans l''historique (levée par qui, quand, pourquoi) mais n''est plus active', (select count(*) from mod_suspensions(true)) = 0
  and (select count(*) from mod_suspensions(false) where name = 'Erin' and not active and lifted_at is not null and lift_reason = 'Elle s''est excusée') = 1);
select t22.as22('00000000-0000-0000-0000-0000000000e5');
select t22.check22('S Erin réactivée recommence à commenter, publier un mode et une playlist', t22.err22($$select comment_add('00000000-0000-0000-0000-00000000f101', 'me revoilà')$$) = 'OK'
  and t22.err22($$select mode_publish('Mon mode', '', '', null)$$) = 'OK' and t22.err22($$select playlist_save(null, 'Ma liste', true, '{}')$$) = 'OK'
  and t22.err22($$select update_track_meta('00000000-0000-0000-0000-00000000f102', 'Nouveau nom', 'Nouvelle description')$$) = 'OK');
reset role;
-- Échéance : une suspension dont la date est passée ne bloque plus, sans que personne ne la lève.
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'Deuxième suspension', now() + interval '1 day')$$) \gset
reset role;
update account_suspensions set created_at = now() - interval '2 days', until = now() - interval '1 day' where user_id = '00000000-0000-0000-0000-0000000000e5' and lifted_at is null;
delete from track_comments where author = '00000000-0000-0000-0000-0000000000e5';          -- (la limite de débit des commentaires est celle de l'étape 13 : un par 20 secondes)
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000e5');
select t22.check22('S une suspension ÉCHUE ne bloque plus (Erin commente de nouveau)', t22.err22($$select comment_add('00000000-0000-0000-0000-00000000f101', 'échéance passée')$$) = 'OK');
select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('S … elle n''est plus « active » dans la liste, mais figure dans l''historique ; on peut en prononcer une nouvelle', (select count(*) from mod_suspensions(true)) = 0 and (select count(*) from mod_suspensions(false)) = 2
  and t22.err22($$select mod_suspend('00000000-0000-0000-0000-0000000000e5', 'Troisième suspension', null)$$) = 'OK');
select t22.check22('S une suspension sans date de fin : active jusqu''à réactivation', (select count(*) from mod_suspensions(true) where until is null and active) = 1);
select t22.err22($$select mod_unsuspend('00000000-0000-0000-0000-0000000000e5', 'Fin de test')$$) \gset
reset role;

-- ================================================================ J (suite). Le journal des suspensions, et l'anonymisation
select t22.check22('J chaque suspension et chaque réactivation a laissé une ligne (3 suspensions, 2 réactivations d''Erin ; l''échue n''a jamais été levée par un modérateur)',
  (select count(*) from moderation_log where kind = 'account' and action = 'suspend' and target_user = '00000000-0000-0000-0000-0000000000e5' and actor = '00000000-0000-0000-0000-0000000000a1') = 3
  and (select count(*) from moderation_log where kind = 'account' and action = 'unsuspend' and target_user = '00000000-0000-0000-0000-0000000000e5') = 2
  and (select count(*) from moderation_log where reason = 'Spam de commentaires' and action = 'suspend') = 1 and (select count(*) from moderation_log where reason = 'Elle s''est excusée' and action = 'unsuspend') = 1);
insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-0000000000f6', 'Circuit de Zed', 'x', 'code5', 'sig5', 30, 5);
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select mod_suspend('00000000-0000-0000-0000-0000000000f6', 'Compte de passage', null), mod_set_track_hidden('00000000-0000-0000-0000-00000000f105', true, 'Contenu hors sujet') \gset
reset role;
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000f6');
select delete_account();
reset role;
select t22.check22('J supprimer un compte efface sa suspension et ses circuits (cascade) mais le journal garde la décision, sans plus aucune référence au compte (anonymisé)',
  (select count(*) from account_suspensions where user_id = '00000000-0000-0000-0000-0000000000f6') = 0 and (select count(*) from tracks where id = '00000000-0000-0000-0000-00000000f105') = 0
  and (select count(*) from moderation_log where reason in ('Compte de passage', 'Contenu hors sujet') and target_user is null) = 2
  and (select count(*) from moderation_log where reason in ('Compte de passage', 'Contenu hors sujet') and actor = '00000000-0000-0000-0000-0000000000a1') = 2
  and not exists (select 1 from moderation_log l where l::text like '%0000000000f6%'));          -- (aucune colonne du journal ne garde l'identifiant du compte supprimé)
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1');
select t22.check22('J … et le journal reste lisible du modérateur, avec un compte visé sans nom', (select count(*) from mod_log(null, null, 100, 0) where reason = 'Compte de passage' and target_name is null) = 1);
reset role;
-- Un modérateur disparu : ses décisions restent.
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a9', 'mod9@accounts.copytrack.invalid', '{"username":"Mod9"}');
insert into players (id, name) values ('00000000-0000-0000-0000-0000000000a9', 'Mod9');
insert into moderators values ('00000000-0000-0000-0000-0000000000a9');
set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a9');
select mod_set_comment_hidden(2, true, 'Décision de Mod9') \gset
select delete_account();
reset role;
select t22.check22('J la suppression d''un MODÉRATEUR garde ses décisions (auteur à null) et ne bloque pas', (select count(*) from moderation_log where reason = 'Décision de Mod9' and actor is null) = 1);

-- ================================================================ Garde de modifications ordinaires
select t22.check22('S les écritures ordinaires que la garde ne doit PAS gêner passent : signalements, j''aime, compteurs, masquage par la modération (colonne hidden)',
  t22.err22($$update tracks set hidden = hidden where author = '00000000-0000-0000-0000-0000000000c3'$$) = 'OK' and t22.err22($$update tracks set plays = plays + 1, likes = likes where id = '00000000-0000-0000-0000-00000000f101'$$) = 'OK');

-- ================================================================ Détail
select t22.check22('les colonnes de la file n''exposent ni code de circuit ni identifiant de signalant', pg_get_function_result('mod_queue(text,text,integer,integer)'::regprocedure)
  = 'TABLE(kind text, id text, label text, author uuid, author_name text, reports integer, counted integer, hidden boolean, created_at timestamp with time zone, last_report_at timestamp with time zone, pending boolean)');
SQL
$P -d $DB -At -f "$TMP/apres.sql" > "$TMP/apres.out" 2>&1 || true

# ---- C : DEUX modérateurs simultanés sur le même circuit : une seule décision, une seule ligne de journal (le second attend le verrou, voit la décision, est refusé).
$P -d $DB -At -c "insert into tracks (id, author, name, decor, code, signature, author_time, pieces) values ('00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-0000000000c3', 'Course', 'x', 'code6', 'sig6', 30, 5)" >/dev/null
CONC1="set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a1'); select t22.err22(\$q\$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f106', true, 'Premier modérateur')\$q\$);"
CONC2="set role authenticated; select t22.as22('00000000-0000-0000-0000-0000000000a2'); select t22.err22(\$q\$select mod_set_track_hidden('00000000-0000-0000-0000-00000000f106', true, 'Second modérateur')\$q\$);"
( $P -d $DB -At -c "begin" -c "$CONC1" -c "select pg_sleep(1.5)" -c "commit" > "$TMP/c1.txt" 2>&1 ) &
sleep 0.4
( $P -d $DB -At -c "begin" -c "$CONC2" -c "commit" > "$TMP/c2.txt" 2>&1 ) &
wait
C1="$(grep -E '^(OK|Ce circuit)' "$TMP/c1.txt" | head -1)"; C2="$(grep -E '^(OK|Ce circuit)' "$TMP/c2.txt" | head -1)"
CLOG="$($P -d $DB -At -c "select count(*) from moderation_log where target = '00000000-0000-0000-0000-00000000f106' and action = 'hide'")"

BAD=0
$P -d $DB -At -F'|' -c "select ok, name, coalesce(detail, '') from t22.res22 order by name" > "$TMP/res.txt"
TOTAL=$(wc -l < "$TMP/res.txt"); FAILS=$(grep -c '^f|' "$TMP/res.txt" || true)
while IFS='|' read -r ok name detail; do if [ "$ok" = t ]; then echo "  ok   $name"; else echo "  FAIL $name${detail:+ — $detail}"; fi; done < "$TMP/res.txt"
[ -n "$DEF1" ] && [ "$DEF1" = "$DEF2" ] && echo "  ok   relançable : les définitions des $NFUNC fonctions mod_* / moderation_* sont identiques après la 2e et la 3e passe" || { echo "  FAIL relançable : définitions différentes"; BAD=1; }
if [ "$C1" = OK ] && [ "$C2" = 'Ce circuit est déjà masqué.' ] && [ "$CLOG" = 1 ]; then echo "  ok   C : deux modérateurs simultanés : le 1er masque (OK), le 2e attend puis est refusé (« déjà masqué »), UNE seule ligne de journal"; else echo "  FAIL C : modérateurs simultanés : « $C1 » / « $C2 » / $CLOG ligne(s) de journal (attendu OK / déjà masqué / 1)"; cat "$TMP/c1.txt" "$TMP/c2.txt"; BAD=1; fi
VPA="$(grep -E '^étape 22' "$TMP/vp-avant.txt" || true)"
[ "$(echo "$VPA" | grep -c '|MANQUE$')" -ge 3 ] && echo "  ok   verify-prod.sql AVANT l'étape 22 : ses lignes disent MANQUE" || { echo "  FAIL verify-prod.sql avant l'étape 22 : MANQUE attendu"; echo "$VPA"; BAD=1; }
VPE="$(grep -E '^étape 22' "$TMP/vp.txt" || true)"
if echo "$VPE" | grep -qE '\|(MANQUE|ÉCART)$'; then echo "  FAIL verify-prod.sql après l'étape 22 : lignes MANQUE / ÉCART :"; echo "$VPE" | grep -E '\|(MANQUE|ÉCART)$'; BAD=1; else echo "  ok   verify-prod.sql après l'étape 22 : lignes « étape 22 » sans MANQUE ni ÉCART"; fi
[ "$(echo "$VPE" | grep -c 'étape 22')" -ge 5 ] || { echo "  FAIL verify-prod.sql : lignes de l'étape 22 absentes"; BAD=1; }
if grep -qE '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; then echo "  FAIL verify-prod.sql sur la base complète (étapes 1 à 22) : lignes MANQUE / ÉCART :"; grep -E '\|(MANQUE|ÉCART)$' "$TMP/vp.txt"; BAD=1; else echo "  ok   verify-prod.sql sur la base complète (étapes 1 à 22) : aucune ligne MANQUE ni ÉCART"; fi
if [ "$FAILS" -gt 0 ] || [ "$TOTAL" -lt 50 ] || [ "$BAD" != 0 ]; then echo "ÉCHEC : étape 22 ($FAILS échec(s) sur $TOTAL)"; grep -i 'error\|erreur' "$TMP/apres.out" | head -10 || true; exit 1; fi
echo "RESULT étape 22 : $TOTAL contrôles réussis (refus de chaque fonction sous anon et authenticated, file bornée, masquer / rétablir, suspension, journal, anonymisation, droits) + concurrence + verify-prod.sql ; relançable"
