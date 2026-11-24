-- =====================================================================================
-- Trackigami : étape 20 (droits de lecture suivis, règles du jeu et de la base alignées) — à lancer À LA MAIN, une fois, dans Supabase > SQL Editor,
-- après les étapes 1 à 19. Peut être relancée sans danger. NE SUPPRIME AUCUNE DONNÉE (aucun delete, drop de table ou de colonne, truncate).
-- Compatible avec le jeu et la fonction serveur actuels : à lancer AVANT de redéployer `submit-score` et de publier le jeu 0.16.12.
--
--  1. TECH-021  scores.ghost_veh devient lisible (droit de COLONNE). Le classement mondial demande cette colonne (js/online.js, leaderboard) ; aucune étape ne l'accordait
--               depuis l'étape 5 (qui retire la lecture de la table puis accorde une LISTE de colonnes) : PostgreSQL refusait la requête, le jeu retombait sur une lecture sans
--               boutons de fantôme, sans titres ni véhicule. Le client sait désormais travailler AVEC ou SANS ce droit ; ce droit rend l'affichage complet.
--               Moindre privilège : UNE colonne, en lecture seule. scores.inputs (les commandes, avec lesquelles on rejouerait une course sous un autre nom) et scores.ghost
--               (volumineux) restent illisibles pour anon et authenticated. Rien de nouveau n'est exposé : get_ghost (étape 7, ouverte à anon) renvoie déjà ghost_veh d'un
--               classement public ; la colonne ne contient que la liste des changements de véhicule de la course (aucun nom, aucune commande).
--  2. TECH-076  close_season clôt APRÈS la fin de la saison + la grâce (10 minutes). Le jeu (js/seasons.js, SEASON_GRACE_MS) et la fonction serveur acceptent encore une course
--               pendant 10 minutes après la fin d'une saison ; la base la clôturait à l'heure : les courses de la grâce entraient après les montées et descentes (points affichés et
--               divisions enregistrées se contredisaient). Les deux valeurs sont liées par un test (tools/test-seasons.mjs, tools/test-etape20-sql.sh). Aucune donnée n'est modifiée :
--               une saison DÉJÀ close reste close (la fonction renvoie 0) ; seules les clôtures à venir attendent la grâce.
--  3. TECH-081  submit_best lie l'empreinte forte d'un circuit de joueur à la clé de BASE (avant « ~ »), pas à chaque variante séparément : les variantes d'une clé déjà liée sont
--               liées en même temps que sa base. Aucune ligne de track_binds n'est supprimée (les anciennes lignes de variantes restent, sans effet : elles ne sont plus consultées).
--               Nouvelle signature : aucune (même fonction, mêmes droits : réservée au serveur).
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. TECH-021 : lecture de scores.ghost_veh
grant select (ghost_veh) on public.scores to anon, authenticated;

-- ---------------------------------------------------------------------------- 2. TECH-076 : clôture d'une saison après sa fin + la grâce
-- Identique à close_season de l'étape 11, sauf la borne. 600 s = SEASON_GRACE_MS (js/seasons.js) / 1000 : ne changer qu'ENSEMBLE (un test compare les deux).
create or replace function public.close_season(n int) returns int
language plpgsql security definer set search_path = public as $$
declare e timestamptz; cnt int := 0; d int;
begin
  select ends + make_interval(secs => 600) into e from season_bounds(n);          -- fin de la saison + grâce (SEASON_GRACE_MS)
  if n < 1 or season_clock() < e then return -1; end if;
  perform pg_advisory_xact_lock(4242, n);                        -- deux clôtures en même temps : une seule travaille
  if exists (select 1 from seasons where id = n and closed_at is not null) then return 0; end if;
  for d in 1 .. 5 loop
    insert into division_history (season, player, division, points, rank, moved)
    select n, r.player, d, r.points, r.rk,
      case when d > 1 and r.k >= 3 and r.rk <= greatest(1, floor(r.k * 0.2)) then -1
           when d < 5 and r.k >= 5 and r.rk > r.k - greatest(1, floor(r.k * 0.2)) then 1 else 0 end
    from (
      select sp.player, sp.points, row_number() over (order by sp.points desc, sp.player) as rk, count(*) over () as k
      from season_points(n) sp left join season_divisions sd on sd.player = sp.player
      where coalesce(sd.division, 5) = d
    ) r
    on conflict (season, player) do nothing;
  end loop;
  insert into season_divisions (player, division, updated_at)
    select h.player, h.division + h.moved, now() from division_history h where h.season = n
    on conflict (player) do update set division = excluded.division, updated_at = now();
  select count(*) into cnt from division_history where season = n;
  insert into seasons (id, closed_at, participants) values (n, now(), cnt)
    on conflict (id) do update set closed_at = now(), participants = excluded.participants;
  return cnt;
end $$;
revoke execute on function public.close_season(int) from public, anon, authenticated;     -- seulement par close_due_seasons (ou la clé de service) : inchangé depuis l'étape 11

-- ---------------------------------------------------------------------------- 3. TECH-081 : submit_best lie les variantes à la clé de base
-- Identique à submit_best de l'étape 17 (budget de fantômes compris), sauf la liaison de l'empreinte forte : clé de base.
create or replace function public.submit_best(p uuid, tk text, t double precision, inp text, pv int, tname text,
  sp jsonb default null, gh text default null, gveh jsonb default null, strong text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare cur record; sarr int[]; bound text; bkey text; imp boolean := false; best double precision; before_n bigint; total_n bigint; used bigint;
begin
  if p is null or tk is null or char_length(tk) > 80 or t is null or t <= 0 or t >= 3600 or pv is null then raise exception 'Paramètres invalides'; end if;
  perform pg_advisory_xact_lock(hashtextextended('scores:' || p::text, 0));        -- une soumission à la fois par pilote (verrou partagé avec scores_limit)
  if strong is not null then
    -- TECH-081 : l'empreinte forte se lie à la clé de BASE (ce qui précède « ~ ») : une variante (u-…~v1.veh-moto) est le MÊME circuit, donc la même empreinte. Liée une variante à la
    -- fois, un joueur disposant d'une collision de la signature de 32 bits pouvait s'approprier les clés de variantes d'un circuit populaire, même après la liaison de sa clé de base.
    bkey := split_part(tk, '~', 1);
    insert into track_binds (track_key, strong, first_player) values (bkey, strong, p) on conflict (track_key) do nothing;
    select b.strong into bound from track_binds b where b.track_key = bkey;
    if bound is distinct from strong then return jsonb_build_object('status', 'collision'); end if;
  end if;
  if sp is not null and jsonb_typeof(sp) = 'array' and jsonb_array_length(sp) <= 400 then
    select coalesce(array_agg(x::int order by ord), '{}') into sarr from jsonb_array_elements_text(sp) with ordinality as e(x, ord);
  end if;
  if gh is not null then
    select coalesce(sum(char_length(s.ghost)), 0) into used from scores s where s.player = p and s.track_key <> tk;
    if used + char_length(gh) > 40000000 then gh := null; gveh := null; end if;
  end if;
  select s.time, s.phys_ver into cur from scores s where s.track_key = tk and s.player = p;
  if not found then
    insert into scores (track_key, player, time, inputs, phys_ver, track_name, updated_at, splits, ghost, ghost_veh)
      values (tk, p, t, inp, pv, left(coalesce(tname, ''), 60), now(), sarr, gh, gveh);
    imp := true; best := t;
  elsif pv > cur.phys_ver or (pv = cur.phys_ver and t < cur.time) then
    update scores set time = t, inputs = inp, phys_ver = pv, track_name = left(coalesce(tname, ''), 60), updated_at = now(),
      splits = sarr, ghost = gh, ghost_veh = gveh
      where track_key = tk and player = p;
    imp := true; best := t;
  else
    best := cur.time;
    if pv = cur.phys_ver and abs(t - cur.time) < 1e-6 then
      update scores set ghost = coalesce(ghost, gh), ghost_veh = case when ghost is null then gveh else ghost_veh end, splits = coalesce(splits, sarr)
        where track_key = tk and player = p and (ghost is null or splits is null);
    end if;
  end if;
  select count(*) filter (where time < best), count(*) into before_n, total_n from scores where track_key = tk and phys_ver = pv;
  return jsonb_build_object('status', 'ok', 'improved', imp, 'best', best, 'rank', before_n + 1, 'total', total_n);
end $$;
revoke all on function public.submit_best(uuid, text, double precision, text, int, text, jsonb, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.submit_best(uuid, text, double precision, text, int, text, jsonb, text, jsonb, text) to service_role;

notify pgrst, 'reload schema';
