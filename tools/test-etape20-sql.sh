#!/usr/bin/env bash
# Teste supabase/etape20-droits-et-regles.sql sur un PostgreSQL local : PGHOST=… PGPORT=… PGUSER=postgres tools/test-etape20-sql.sh   (npm run test:sql)
# Base jetable (copytrack_sqltest20) : étapes 1 à 19, des données de joueurs, PUIS l'étape 20 (deux fois : relançable). On vérifie :
#   - aucune donnée n'est supprimée ni modifiée en s'appliquant (comptes avant / après, lignes identiques) ;
#   - TECH-021 : la colonne ghost_veh devient lisible sous anon et authenticated, inputs et ghost restent illisibles ;
#   - TECH-076 : close_season attend la fin de la saison + la grâce LUE DANS js/seasons.js (SEASON_GRACE_MS) : le jeu accepte une course à l'instant t exactement quand la base ne
#                l'a pas encore clôturée ; une course de la grâce entre dans les points ET dans les divisions de la même clôture ; une saison déjà close le reste ;
#   - TECH-081 : l'empreinte d'un circuit de joueur est liée à la clé de BASE : un squat de variante (collision de signature) est refusé AVANT comme APRÈS la liaison de la base,
#                et la variante soumise en premier lie aussi sa base ; l'ancienne version (étape 17) laisse faire le squat (le test échoue sans l'étape 20) ;
#   - verify-prod.sql : lignes « étape 20 » et « lisibilité » à ok après, ÉCART avant (sauf la lisibilité de ghost_veh, qui dépend de l'étape 20 seule).
set -euo pipefail
export PGOPTIONS='-c client_min_messages=warning'
cd "$(dirname "$0")/.."
DB=copytrack_sqltest20
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
create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text unique, raw_user_meta_data jsonb default '{}'::jsonb, is_anonymous boolean default false,
  encrypted_password text, created_at timestamptz default now(), updated_at timestamptz default now(), last_sign_in_at timestamptz);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz default now(), updated_at timestamptz default now(), refreshed_at timestamp);
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to anon, authenticated, service_role;
SQL
$P -d $DB -f "$TMP/stub.sql"
for n in 1-communaute 2-classements 3-description 4-comptes 5-securite 6-telemetrie 7-fantomes 8-decouverte 9-secteurs 10-social 11-saisons 12-competition 13-communaute 14-securite 15-backend 15b-publication-verifiee 16-durcissement 17-securite 18-maintenance 19-avis; do
  $P -d $DB -f supabase/etape$n.sql >/dev/null
done

# Valeurs du CLIENT, lues dans le code du jeu (jamais recopiées) : la grâce des saisons et les bornes de la saison 1.
read -r GRACE_S ENDS1 < <(node --input-type=module -e "import('./js/seasons.js').then((m) => console.log(m.SEASON_GRACE_MS / 1000, new Date(m.seasonBounds(1).ends).toISOString().replace('T', ' ').replace('Z', '+00')))")
# Comparaison du jeu et de la base, à trois instants autour de la fin de la saison 1 : le client accepte-t-il une course ? (seasonOpen renvoie '' si oui)
JS_OPEN="$(node --input-type=module -e "
import('./js/seasons.js').then((m) => { const e = m.seasonBounds(1).ends, g = m.SEASON_GRACE_MS;
  console.log([-1000, 0, 5 * 60000, g - 1000, g, g + 1000].map((d) => (m.seasonOpen(1, e + d) === '' ? 'ouvert' : 'fermé')).join(','));
});")"
[ "$JS_OPEN" = "ouvert,ouvert,ouvert,ouvert,fermé,fermé" ] || { echo "ÉCHEC : seasonOpen ne se comporte pas comme attendu autour de la fin de saison ($JS_OPEN)"; exit 1; }

cat > "$TMP/avant.sql" <<'SQL'
\set ON_ERROR_STOP off
create table public.res20 (name text, ok boolean);
grant all on public.res20 to public;
create function public.check20(n text, c boolean) returns void language plpgsql security definer as $$ begin insert into public.res20 values (n, coalesce(c, false)); end $$;
grant execute on function public.check20(text, boolean) to public;
create function public.rows20(q text) returns bigint language plpgsql as $$ declare n bigint; begin execute q; get diagnostics n = row_count; return n; exception when others then return -1; end $$;
grant execute on function public.rows20(text) to public;

-- Données de joueurs AVANT l'étape 20.
insert into auth.users (id, is_anonymous) values ('00000000-0000-0000-0000-0000000000e1', true), ('00000000-0000-0000-0000-0000000000e2', true), ('00000000-0000-0000-0000-0000000000e3', true);
insert into public.players (id, name) values ('00000000-0000-0000-0000-0000000000e1', 'Eva'), ('00000000-0000-0000-0000-0000000000e2', 'Eli'), ('00000000-0000-0000-0000-0000000000e3', 'Eve');
insert into public.scores (track_key, player, time, inputs, phys_ver, ghost, ghost_veh, splits) values
  ('b-x-1', '00000000-0000-0000-0000-0000000000e1', 31.5, 'SECRET', 39, 'GHOST', '[[3,1]]', '{100,200}'),
  ('b-s1a-1~v1.sea-1', '00000000-0000-0000-0000-0000000000e1', 20, 'A', 39, null, null, null),
  ('b-s1a-1~v1.sea-1', '00000000-0000-0000-0000-0000000000e2', 21, 'A', 39, null, null, null);
insert into public.track_binds (track_key, strong, first_player) values ('u-old', repeat('a', 64), '00000000-0000-0000-0000-0000000000e1'), ('u-old~v1.veh-moto', repeat('b', 64), '00000000-0000-0000-0000-0000000000e2');
select public.check20('état de départ : un squat de variante déjà présent (empreinte différente de sa base), conservé tel quel', (select count(*) from track_binds) = 2);
-- Sans l'étape 20 : la lecture de ghost_veh est refusée, l'ancienne version de submit_best laisse squatter une variante (c'est ce que l'étape 20 ferme).
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select public.check20('AVANT : ghost_veh illisible (le classement mondial est dégradé)', public.rows20($$select ghost_veh from scores$$) = -1);
reset role;
select (public.submit_best('00000000-0000-0000-0000-0000000000e3', 'u-pop~v1.veh-moto', 40, 'in', 39, 'Pop', null, null, null, repeat('f', 64)) ->> 'status') as pre1 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'u-pop', 41, 'in', 39, 'Pop', null, null, null, repeat('9', 64)) ->> 'status') as pre2 \gset
select public.check20('AVANT : le squat réussit (variante liée à une autre empreinte que la base : l''ancienne version ne vérifie pas la base)', :'pre1' = 'ok' and :'pre2' = 'ok');
-- Photo des données (empreinte de chaque table concernée) avant l'étape 20.
create table public.photo as select 'scores' t, md5(string_agg(x::text, '|' order by x::text)) h from (select * from scores) x
  union all select 'players', md5(string_agg(x::text, '|' order by x::text)) from (select * from players) x
  union all select 'tracks', coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from (select * from tracks) x
  union all select 'track_binds', md5(string_agg(x::text, '|' order by x::text)) from (select * from track_binds) x
  union all select 'seasons', coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from (select * from seasons) x;
SQL
$P -d $DB -f "$TMP/avant.sql" > "$TMP/avant.out" 2>&1 || true

# L'étape, DEUX fois (relançable).
$P -d $DB -f supabase/etape20-droits-et-regles.sql >/dev/null
$P -d $DB -f supabase/etape20-droits-et-regles.sql >/dev/null
# Avec une définition inchangée entre la 1re et la 2e passe (relançable = même résultat).
DEF1="$($P -d $DB -At -c "select md5(pg_get_functiondef('public.close_season(int)'::regprocedure) || pg_get_functiondef('public.submit_best(uuid,text,double precision,text,int,text,jsonb,text,jsonb,text)'::regprocedure))")"
$P -d $DB -f supabase/etape20-droits-et-regles.sql >/dev/null
DEF2="$($P -d $DB -At -c "select md5(pg_get_functiondef('public.close_season(int)'::regprocedure) || pg_get_functiondef('public.submit_best(uuid,text,double precision,text,int,text,jsonb,text,jsonb,text)'::regprocedure))")"

cat > "$TMP/apres.sql" <<SQL
\\set ON_ERROR_STOP off
\\set grace_s $GRACE_S
\\set ends1 '$ENDS1'
SQL
cat >> "$TMP/apres.sql" <<'SQL'
-- ---- Aucune donnée supprimée ni modifiée
select public.check20('aucune donnée touchée : scores, players, tracks, track_binds, seasons identiques avant et après l''étape 20 (empreinte de chaque table)',
  not exists (select 1 from public.photo p join (
    select 'scores' t, md5(string_agg(x::text, '|' order by x::text)) h from (select * from scores) x
    union all select 'players', md5(string_agg(x::text, '|' order by x::text)) from (select * from players) x
    union all select 'tracks', coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from (select * from tracks) x
    union all select 'track_binds', md5(string_agg(x::text, '|' order by x::text)) from (select * from track_binds) x
    union all select 'seasons', coalesce(md5(string_agg(x::text, '|' order by x::text)), '') from (select * from seasons) x) n on n.t = p.t where n.h is distinct from p.h));
-- ---- TECH-021
set role anon;
select public.check20('TECH-021 : anon lit ghost_veh (et pas inputs ni ghost)', public.rows20($$select ghost_veh from scores$$) >= 0 and public.rows20($$select inputs from scores$$) = -1 and public.rows20($$select ghost from scores$$) = -1);
reset role;
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select public.check20('TECH-021 : authenticated lit ghost_veh, has_ghost, splits (le classement complet), pas inputs ni ghost',
  public.rows20($$select time, player, updated_at, has_ghost, ghost_veh, splits, players.name, players.title from scores join players on players.id = scores.player$$) >= 0
  and public.rows20($$select inputs from scores$$) = -1 and public.rows20($$select ghost from scores$$) = -1);
select public.check20('TECH-021 : le véhicule lu est celui qui est en base', (select ghost_veh = '[[3,1]]'::jsonb from scores where track_key = 'b-x-1'));
reset role;
-- ---- TECH-076 : l'horloge des saisons est fixée (copytrack.now). La saison 1 finit à :ends1 ; la grâce est celle du jeu (:grace_s s).
select public.check20('TECH-076 : la grâce de la base est celle du jeu (' || :'grace_s' || ' s)', (select prosrc like '%make_interval(secs => ' || :'grace_s' || ')%' from pg_proc where oid = 'public.close_season(int)'::regprocedure));
select set_config('copytrack.now', (:'ends1'::timestamptz - interval '1 second')::text, false);
select public.check20('TECH-076 : une seconde AVANT la fin : pas close (jeu : ouvert)', public.close_season(1) = -1);
select set_config('copytrack.now', (:'ends1'::timestamptz + interval '5 minutes')::text, false);
select public.check20('TECH-076 : 5 min après la fin (dans la grâce : le jeu accepte encore la course) : la base NE clôt PAS', public.close_season(1) = -1 and (select count(*) from seasons where id = 1 and closed_at is not null) = 0);
-- Une course terminée 5 min après la fin est acceptée par le jeu (seasonOpen) : elle entre dans la saison.
insert into public.scores (track_key, player, time, inputs, phys_ver) values ('b-s1a-1~v1.sea-1', '00000000-0000-0000-0000-0000000000e3', 19, 'A', 39);
-- (le jeu appelle close_due_seasons avec une session : l'étape 17 la refuse à anon)
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select public.check20('TECH-076 : close_due_seasons dans la grâce ne clôt rien', public.close_due_seasons() = 0);
select public.check20('TECH-076 : les points affichés comptent la course de la grâce (Eve, 19 s : 1000 points ; Eva 20 s : 950)', (select points from season_points(1) where player = '00000000-0000-0000-0000-0000000000e3') = 1000
  and (select points from season_points(1) where player = '00000000-0000-0000-0000-0000000000e1') = 950);
reset role;
select set_config('copytrack.now', (:'ends1'::timestamptz + make_interval(secs => :grace_s) - interval '1 second')::text, false);
select public.check20('TECH-076 : une seconde avant la fin de la grâce : pas close (jeu : ouvert)', public.close_season(1) = -1);
select set_config('copytrack.now', (:'ends1'::timestamptz + make_interval(secs => :grace_s))::text, false);
set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', false);
select public.check20('TECH-076 : à la fin de la grâce (jeu : fermé) : close, 3 participants dont la course de la grâce', public.close_due_seasons() = 3);
reset role;
select public.check20('TECH-076 : les divisions enregistrées contiennent la course de la grâce (même clôture que les points)', (select points from division_history where season = 1 and player = '00000000-0000-0000-0000-0000000000e3') = 1000
  and (select count(*) from division_history where season = 1) = 3);
select public.check20('TECH-076 : une saison déjà close le reste (0), sans doublon', public.close_season(1) = 0 and (select count(*) from division_history where season = 1) = 3);
select public.check20('TECH-076 : close_season reste réservée au serveur (ni anon ni authenticated)', not has_function_privilege('anon', 'public.close_season(int)', 'execute') and not has_function_privilege('authenticated', 'public.close_season(int)', 'execute'));
-- ---- TECH-081
select (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'u-h1', 50, 'in', 39, 'H', null, null, null, repeat('a', 64)) ->> 'status') as r1 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-h1~v1.veh-moto', 51, 'in', 39, 'H', null, null, null, repeat('c', 64)) ->> 'status') as r2 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'u-h1~v1.veh-moto', 52, 'in', 39, 'H', null, null, null, repeat('a', 64)) ->> 'status') as r3 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-h1~v1.g-40.obs-0', 53, 'in', 39, 'H', null, null, null, repeat('c', 64)) ->> 'status') as r4 \gset
select public.check20('TECH-081 : base liée à une empreinte ; le squat d''une variante avec une autre empreinte est refusé (collision) ; la variante légitime passe', :'r1' = 'ok' and :'r2' = 'collision' and :'r3' = 'ok' and :'r4' = 'collision');
select public.check20('TECH-081 : le squat n''a rien écrit (aucun temps du squatteur, ni sous la variante ni sous la base)', not exists (select 1 from scores where player = '00000000-0000-0000-0000-0000000000e2' and track_key like 'u-h1%'));
select public.check20('TECH-081 : la liaison est UNE ligne, celle de la base (pas une par variante)', (select count(*) from track_binds where track_key like 'u-h1%') = 1 and (select strong from track_binds where track_key = 'u-h1') = repeat('a', 64));
-- Variante soumise EN PREMIER : elle lie la base ; un autre circuit de même clé de base est refusé ensuite, sur la base comme sur toute variante.
select (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'u-h2~v1.veh-moto', 60, 'in', 39, 'H', null, null, null, repeat('d', 64)) ->> 'status') as v1 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-h2', 61, 'in', 39, 'H', null, null, null, repeat('e', 64)) ->> 'status') as v2 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-h2~v1.g-40', 62, 'in', 39, 'H', null, null, null, repeat('e', 64)) ->> 'status') as v3 \gset
select (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-h2', 63, 'in', 39, 'H', null, null, null, repeat('d', 64)) ->> 'status') as v4 \gset
select public.check20('TECH-081 : une variante soumise la première lie sa base ; un autre circuit de même clé est refusé sur la base et sur une autre variante ; le bon circuit passe', :'v1' = 'ok' and :'v2' = 'collision' and :'v3' = 'collision' and :'v4' = 'ok');
select public.check20('TECH-081 : sans empreinte (circuit intégré, défi du jour), rien n''est lié et l''enregistrement marche comme avant', (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'b-x-1~v1.veh-moto', 30, 'in', 39, 'X') ->> 'status') = 'ok'
  and (select count(*) from track_binds where track_key like 'b-x-1%') = 0);
select public.check20('TECH-081 : l''ancien squat de variante (déjà en base) ne bloque plus le circuit légitime : la base fait foi', (public.submit_best('00000000-0000-0000-0000-0000000000e1', 'u-old~v1.veh-moto', 30, 'in', 39, 'X', null, null, null, repeat('a', 64)) ->> 'status') = 'ok'
  and (public.submit_best('00000000-0000-0000-0000-0000000000e2', 'u-old', 31, 'in', 39, 'X', null, null, null, repeat('b', 64)) ->> 'status') = 'collision');
select public.check20('TECH-081 : submit_best reste réservée au serveur (ni anon, ni authenticated)', not has_function_privilege('anon', 'public.submit_best(uuid,text,double precision,text,int,text,jsonb,text,jsonb,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.submit_best(uuid,text,double precision,text,int,text,jsonb,text,jsonb,text)', 'execute') and has_function_privilege('service_role', 'public.submit_best(uuid,text,double precision,text,int,text,jsonb,text,jsonb,text)', 'execute'));
select public.check20('verify-prod.sql : les deux squats de variante d''avant l''étape 20 (u-old, u-pop) sont signalés en info, rien n''est supprimé', (select constate from verify_prod_view where verification like 'étape 20 : lignes de track_binds%') = '2'
  and (select count(*) from track_binds where track_key like '%~%') >= 2);
SQL
# verify-prod.sql n'est pas une vue : on le passe dans une table temporaire pour le contrôle ci-dessus.
$P -d $DB -At -F'|' -f supabase/verify-prod.sql > "$TMP/vp.txt"
$P -d $DB -c "create table public.verify_prod_view (verification text, attendu text, constate text, statut text)" -c "grant all on public.verify_prod_view to public"
$P -d $DB -c "\\copy public.verify_prod_view from '$TMP/vp.txt' with (format csv, delimiter '|', quote E'\\001')" >/dev/null
$P -d $DB -At -f "$TMP/apres.sql" > "$TMP/apres.out" 2>&1 || true

BAD=0
$P -d $DB -At -F'|' -c "select ok, name from res20 order by name" > "$TMP/res.txt"
TOTAL=$(wc -l < "$TMP/res.txt"); FAILS=$(grep -c '^f|' "$TMP/res.txt" || true)
while IFS='|' read -r ok name; do if [ "$ok" = t ]; then echo "  ok   $name"; else echo "  FAIL $name"; fi; done < "$TMP/res.txt"
[ "$DEF1" = "$DEF2" ] && echo "  ok   relançable : les définitions de close_season et submit_best sont identiques après la 2e et la 3e passe" || { echo "  FAIL relançable : définitions différentes"; BAD=1; }
VPE="$(grep -E '^(étape 20|lisibilité \(TECH-021\))' "$TMP/vp.txt" || true)"
if echo "$VPE" | grep -qE '\|(MANQUE|ÉCART)$'; then echo "  FAIL verify-prod.sql après l'étape 20 : lignes MANQUE / ÉCART :"; echo "$VPE" | grep -E '\|(MANQUE|ÉCART)$'; BAD=1; else echo "  ok   verify-prod.sql après l'étape 20 : lignes « étape 20 » et « lisibilité » sans MANQUE ni ÉCART"; fi
[ "$(echo "$VPE" | grep -c 'étape 20')" -ge 3 ] || { echo "  FAIL verify-prod.sql : lignes de l'étape 20 absentes"; BAD=1; }
if [ "$FAILS" -gt 0 ] || [ "$TOTAL" -lt 25 ] || [ "$BAD" != 0 ]; then echo "ÉCHEC : étape 20 ($FAILS échec(s) sur $TOTAL)"; head -5 "$TMP/apres.out" 2>/dev/null || true; exit 1; fi
echo "RESULT étape 20 : $TOTAL contrôles réussis (droits de ghost_veh, grâce des saisons liée à js/seasons.js, liaison des variantes, aucune donnée touchée) ; relançable"
