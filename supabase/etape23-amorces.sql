-- =====================================================================================
-- Trackigami : étape 23 (amorces officielles, rival juste devant, boîte de réception : COMPLETE-010, COMPLETE-015) — à lancer À LA MAIN, une fois,
-- dans Supabase > SQL Editor, après les étapes 1 à 22. Peut être relancée sans danger (idempotente). NE SUPPRIME AUCUNE DONNÉE : elle ajoute une table,
-- un index et trois fonctions ; aucune fonction ci-dessous n'écrit ailleurs que dans sa propre table (aucune n'écrit du tout, sauf la clé de service).
-- Compatible avec le jeu actuel : le jeu d'avant ne lit rien de tout cela. Le jeu 0.23.0 marche SANS elle (pas d'amorces, pas de rival juste devant
-- en ligne, pas de boîte de réception : il le dit, il ne montre rien de faux).
--
--  1. AMORCES OFFICIELLES (COMPLETE-010) : table `official_runs`, SÉPARÉE de `scores`. Des temps et des fantômes produits par le PILOTE AUTOMATIQUE du jeu
--     (un niveau par médaille, rythmes calibrés de js/ghostPaces.js) et, plus tard, par des testeurs qui l'acceptent. Ils servent de cible quand peu de joueurs
--     ont couru. Le jeu les affiche ÉTIQUETÉS « Officiel · automatique » (ou « Officiel · testeur »), sans numéro de place.
--       - Écriture : la clé de service SEULEMENT (outil tools/seed-officiels.mjs, lancé par le propriétaire). Aucun droit d'écriture pour anon ni authenticated.
--       - Lecture : publique, toutes les colonnes SAUF `inputs` (les commandes : on ne les donne pas, comme celles des joueurs).
--       - Sans effet sur le monde réel, par construction : AUCUNE fonction de classement, de saison, de duel ou de tournoi ne lit cette table
--         (season_points, season_standings, my_season, close_season, best_time, settle_duel, close_tournament, submit_best, get_ghost, sector_board, friends_board
--         ne lisent que `scores`). Les places, les points, les divisions et l'Elo des joueurs ne la voient pas. tools/test-etape23-sql.sh le démontre (saison
--         close avec et sans amorces : historique et divisions identiques ; rang renvoyé par submit_best identique).
--       - Clés : celles des circuits de la carrière seulement (`b-<id>-<empreinte>`, sans variante) ; une saison, un duel ou un tournoi (étiquettes « ~v1.sea-N »,
--         « ~v1.duel-N », « ~v1.tour-N ») ne change pas le circuit : le jeu y montre l'amorce de la clé de base, pour s'entraîner, hors classement.
--  2. RIVAL JUSTE DEVANT (COMPLETE-010) : `rival_ahead(k, pv, t)` : le record vérifié immédiatement plus rapide que le temps t sur la clé k (le plus proche devant,
--     dont le fantôme existe), avec son fantôme ; jamais celui de l'appelant. Ouverte sans session (lecture publique, TECH-031 : afficher ne crée pas de joueur).
--     Données renvoyées : pseudo, temps, place (déjà publics dans `scores` / `players`) et le fantôme (des POSITIONS, jamais les commandes ; get_ghost les donne
--     déjà pour le top 10 : celle-ci les donne pour le seul record juste devant le temps demandé).
--  3. BOÎTE DE RÉCEPTION (COMPLETE-015) : `inbox_summary(depuis)` : en UNE requête, 20 éléments au plus, ce qui concerne L'APPELANT depuis sa dernière visite :
--     « X a battu ton temps sur Y », duels qui l'attendent et duels réglés, nouvelle saison, fin d'une saison où il a couru (montée, descente), circuits publiés
--     par les auteurs qu'il suit. Réservée aux sessions (jamais anon) ; ne renvoie jamais rien d'un autre joueur que ce qui est déjà public (pseudo, temps,
--     nom d'un circuit publié non masqué). La période est bornée à 30 jours.
--
-- Moindre privilège : fonctions `security definer` à search_path fixé ; droits retirés à public ; `inbox_summary` à authenticated seulement.
-- Vérification : supabase/verify-prod.sql, lignes « étape 23 ». Test : tools/test-etape23-sql.sh (npm run test:sql).
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. Amorces officielles
create table if not exists public.official_runs (
  track_key text not null check (track_key ~ '^b-[a-z0-9]{1,40}-[a-z0-9]{1,16}$'),          -- un circuit de la carrière, sans variante
  phys_ver int not null check (phys_ver between 1 and 9999),
  source text not null check (source in ('auto', 'testeur')),                                 -- auto : pilote automatique ; testeur : course d'un testeur qui l'accepte
  level text not null check (level ~ '^[a-z0-9-]{1,24}$'),                                    -- auto : bronze, argent, or, cristal ; testeur : un identifiant
  pilot text check (pilot is null or char_length(pilot) between 1 and 20),                     -- testeur : son pseudo PUBLIC (avec son accord) ; auto : null
  "time" double precision not null check ("time" > 0 and "time" < 3600),
  inputs text not null check (char_length(inputs) <= 400000),                                -- les commandes (illisibles du jeu) : l'outil d'amorce les rejoue
  ghost text check (ghost is null or char_length(ghost) <= 800000),                           -- même format que scores.ghost (Float32 en base64, une pose tous les 4 pas)
  ghost_veh jsonb,
  has_ghost boolean generated always as (ghost is not null) stored,
  splits int[],
  tool text not null default '' check (char_length(tool) <= 80),                              -- version de l'outil qui l'a produite (traçabilité)
  updated_at timestamptz not null default now(),
  primary key (track_key, phys_ver, source, level),
  check (source <> 'auto' or (level in ('bronze', 'argent', 'or', 'cristal') and pilot is null)),
  check (source <> 'testeur' or pilot is not null)
);
create index if not exists official_runs_board on public.official_runs (track_key, phys_ver, "time");
alter table public.official_runs enable row level security;
drop policy if exists "Amorces officielles visibles par tous" on public.official_runs;
create policy "Amorces officielles visibles par tous" on public.official_runs for select using (true);
revoke all on public.official_runs from public, anon, authenticated;
-- Lecture : toutes les colonnes sauf les commandes.
grant select (track_key, phys_ver, source, level, pilot, "time", ghost, ghost_veh, has_ghost, splits, tool, updated_at) on public.official_runs to anon, authenticated;
-- Écriture : la clé de service seulement (tools/seed-officiels.mjs). Sur Supabase, service_role contourne déjà la RLS (bypassrls) ; la règle ci-dessous le dit explicitement,
-- pour qu'une base où ce rôle ne la contourne pas se comporte de même. Elle ne vise QUE service_role : anon et authenticated n'ont de toute façon aucun droit d'écriture.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select, insert, update, delete on public.official_runs to service_role;
    drop policy if exists "Amorces écrites par la clé de service" on public.official_runs;
    create policy "Amorces écrites par la clé de service" on public.official_runs for all to service_role using (true) with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------- 2. Rival juste devant
-- Le record vérifié le plus proche DEVANT le temps t (strictement plus rapide : un ex æquo n'est pas devant) sur la clé k et la physique pv, dont le fantôme existe ;
-- en cas d'égalité entre plusieurs temps juste devant, celui qui est classé le plus près (le plus récent : le classement départage par ancienneté). Jamais l'appelant.
-- place = 1 + le nombre de temps plus rapides (même règle que le classement du jeu).
create or replace function public.rival_ahead(k text, pv int, t double precision)
returns table (place bigint, name text, "time" double precision, ghost text, ghost_veh jsonb)
language sql stable security definer set search_path = public as $$
  select (select count(*) from scores x where x.track_key = k and x.phys_ver = pv and x.time < s.time) + 1, p.name, s.time::double precision, s.ghost, s.ghost_veh
  from scores s join players p on p.id = s.player
  where k is not null and char_length(k) <= 80 and pv is not null and t > 0 and t < 3600
    and s.track_key = k and s.phys_ver = pv and s.time < t and s.ghost is not null and s.player is distinct from auth.uid()
  order by s.time desc, s.updated_at desc
  limit 1;
$$;
revoke all on function public.rival_ahead(text, int, double precision) from public;
grant execute on function public.rival_ahead(text, int, double precision) to anon, authenticated;

-- ---------------------------------------------------------------------------- 3. Boîte de réception
-- Ce qui concerne l'appelant depuis `depuis` (sa dernière visite, gardée par le jeu sur l'appareil), 20 éléments au plus, du plus récent au plus ancien.
--   kind         ce que c'est                                           colonnes utiles
--   beaten       X a battu ton temps sur Y (après ton record ; jamais sous la clé d'un duel en cours, dont les temps restent cachés jusqu'au règlement)
--                                                                       track_key, track_name, who, my_time, their_time, n (nombre de pilotes passés devant)
--   duel         X te défie (en attente de ta réponse)                   track_key, track_name, who, ref (duel), at (création)
--   duel_win / duel_loss / duel_draw    un duel réglé                   track_key, track_name, who, my_time, their_time, ref, n (Elo gagné ou perdu)
--   season       une nouvelle saison a commencé                          ref (numéro), at (début)
--   season_end   une saison où tu as couru est close                     ref (numéro), n (-1 montée, 0 maintien, 1 descente), m (ta division)
--   follow       un auteur que tu suis a publié un circuit               track_id, track_name, who, at
-- Les duels en attente de réponse sont montrés quelle que soit la date (ils attendent) ; le reste, seulement après `depuis` (au plus 30 jours en arrière).
create or replace function public.inbox_summary(depuis timestamptz)
returns table (kind text, at timestamptz, track_key text, track_name text, track_id uuid, who text, my_time double precision, their_time double precision, ref bigint, n int, m int)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() as id),
  since as (select greatest(coalesce(depuis, season_clock() - interval '7 days'), season_clock() - interval '30 days') as t),
  mine as (select s.track_key, s.time, s.phys_ver, s.updated_at, s.track_name from scores s where s.player = (select id from me)),
  beaten as (
    select distinct on (mi.track_key) 'beaten'::text as kind, o.updated_at as at, mi.track_key, coalesce(nullif(mi.track_name, ''), o.track_name) as track_name,
      null::uuid as track_id, p.name as who, mi.time::double precision as my_time, o.time::double precision as their_time, null::bigint as ref,
      (count(*) over (partition by mi.track_key))::int as n, null::int as m
    from mine mi
    join scores o on o.track_key = mi.track_key and o.phys_ver = mi.phys_ver and o.player <> (select id from me)
      and o.time < mi.time and o.updated_at > mi.updated_at and o.updated_at > (select t from since)
    join players p on p.id = o.player
    where mi.track_key not like '%~v1.duel-%'          -- un duel ne montre le temps de l'autre qu'à son règlement (my_duels, étape 12) : ici non plus
    order by mi.track_key, o.updated_at desc
  ),
  duel_wait as (
    select 'duel'::text, d.created_at, d.track_key, d.track_name, null::uuid, p.name, null::double precision, null::double precision, d.id, null::int, null::int
    from duels d join players p on p.id = d.challenger
    where d.opponent = (select id from me) and d.status = 'pending' and d.ends_at > season_clock()
    order by d.created_at desc limit 10
  ),
  duel_done as (
    select case when d.winner is null then 'duel_draw' when d.winner = (select id from me) then 'duel_win' else 'duel_loss' end, d.settled_at, d.track_key, d.track_name, null::uuid, p.name,
      case when d.challenger = (select id from me) then d.c_time else d.o_time end, case when d.challenger = (select id from me) then d.o_time else d.c_time end, d.id,
      case when d.challenger = (select id from me) then d.c_delta else d.o_delta end, null::int
    from duels d join players p on p.id = case when d.challenger = (select id from me) then d.opponent else d.challenger end
    where (select id from me) in (d.challenger, d.opponent) and d.status = 'settled' and d.settled_at > (select t from since)
    order by d.settled_at desc limit 10
  ),
  season_new as (
    select 'season'::text, b.starts, null::text, null::text, null::uuid, null::text, null::double precision, null::double precision, current_season()::bigint, null::int, null::int
    from season_bounds(current_season()) b where b.starts > (select t from since) and b.starts <= season_clock()
  ),
  season_end as (
    select 'season_end'::text, se.closed_at, null::text, null::text, null::uuid, null::text, null::double precision, null::double precision, h.season::bigint, h.moved, h.division + h.moved
    from division_history h join seasons se on se.id = h.season
    where h.player = (select id from me) and se.closed_at > (select t from since)
    order by se.closed_at desc limit 5
  ),
  followed as (
    select 'follow'::text, tr.created_at, null::text, tr.name, tr.id, p.name, null::double precision, null::double precision, null::bigint, null::int, null::int
    from follows f join tracks tr on tr.author = f.author and not tr.hidden join players p on p.id = tr.author
    where f.follower = (select id from me) and tr.created_at > (select t from since)
    order by tr.created_at desc limit 20
  )
  select x.* from (
    select * from beaten
    union all select * from duel_wait
    union all select * from duel_done
    union all select * from season_new
    union all select * from season_end
    union all select * from followed
  ) x
  where (select id from me) is not null
  order by x.at desc nulls last, x.kind
  limit 20;
$$;
revoke all on function public.inbox_summary(timestamptz) from public, anon;
grant execute on function public.inbox_summary(timestamptz) to authenticated;

notify pgrst, 'reload schema';
