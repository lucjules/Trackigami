-- =====================================================================================
-- Trackigami : étape 22 (outils de modération dans le jeu, COMPLETE-004) — à lancer À LA MAIN, une fois, dans Supabase > SQL Editor, après les étapes 1 à 21.
-- Peut être relancée sans danger (idempotente). NE SUPPRIME AUCUNE DONNÉE : elle ajoute deux tables, une colonne, des index, des fonctions et des déclencheurs ;
-- aucune des fonctions ci-dessous ne supprime quoi que ce soit (masquer ≠ supprimer : un contenu masqué reste en base et se rétablit).
-- Compatible avec le jeu actuel : le jeu d'avant cette étape continue de marcher (il ne connaît simplement pas l'écran de modération). Le jeu 0.22.0 fonctionne SANS elle :
-- l'écran de modération n'apparaît alors pour personne (la base ne confirme le statut de modérateur à personne).
--
-- PRINCIPE : la sécurité est ICI, dans la base. L'écran du jeu n'est qu'une commodité : même si on le contournait, chaque fonction `mod_*` commence par
--   if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.'
-- avant toute lecture ou écriture. Qui est modérateur : la table `moderators` (étape 13), remplie À LA MAIN (supabase/COMPTES.md, « Ajouter un modérateur »).
--
-- Ce que ce script ajoute :
--   mod_status()                     le jeu demande « suis-je modérateur ? » (vrai / faux, pour MOI seulement : jamais pour un autre identifiant) ;
--   mod_queue(k, st, lim, off)       la file des contenus signalés (circuits et commentaires), compteurs inclus, 100 lignes au plus par appel ;
--   mod_detail(k, tid)               la fiche d'un contenu : texte public, compteurs, auteur, suspension en cours, historique des décisions ;
--   mod_reports(k, tid)              les signalements d'un contenu : date et « compté » ou non, JAMAIS qui a signalé ;
--   mod_set_track_hidden(t, hide, why)    masquer / rétablir un circuit, avec un motif obligatoire ;
--   mod_set_comment_hidden(c, hide, why)  masquer / rétablir un commentaire, avec un motif obligatoire ;
--   mod_suspend(u, why, until_at)    suspendre un compte (motif obligatoire, date de fin facultative : sans date, jusqu'à réactivation) ;
--   mod_unsuspend(u, why)            réactiver un compte suspendu (motif obligatoire) ;
--   mod_suspensions(active_only, lim, off)  les suspensions (en cours ou toutes) ;
--   mod_log(k, tid, lim, off)        le journal des décisions (qui, quoi, quand, pourquoi) ;
--   mod_hide(kind, target, hide)     (étape 13, conservée) : même effet que ci-dessus pour circuits, commentaires et modes, désormais JOURNALISÉ.
--   account_suspensions              les suspensions (illisible du jeu) ; moderation_log : le journal (illisible du jeu) ;
--   moderation_suspension_guard()    déclencheur : un compte suspendu ne peut ni PUBLIER (circuit, mode, playlist, nom ou description d'un circuit) ni COMMENTER.
--
-- La suspension ne touche QUE ces actions de contenu : ses temps, ses classements, ses fantômes, sa sauvegarde, ses amis, ses duels et sa connexion ne changent pas
-- (les temps vérifiés restent). Elle ne masque pas non plus ses contenus déjà publiés : c'est une autre décision (mod_set_*_hidden).
--
-- Moindre privilège : fonctions `security definer` à search_path fixé, droits retirés à public et à anon, accordés à `authenticated` seulement (la fonction refuse ensuite
-- tout non-modérateur) ; fonctions internes fermées à tous les rôles de l'API ; tables fermées (RLS active, aucun droit, aucune règle).
-- Vérification : supabase/verify-prod.sql, « étape 22 ». Test : tools/test-etape22-sql.sh (npm run test:sql).
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. Tables et index
-- Le journal : une ligne par décision, jamais modifiée ni supprimée par une fonction. Aucun texte de contenu n'y est copié (seulement des identifiants de CONTENUS et le motif du modérateur) :
-- les personnes ne sont référencées que par actor et target_user, qui passent à NULL à la suppression du compte (la trace reste, anonyme ; le motif est un texte libre du modérateur).
create table if not exists public.moderation_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid references auth.users (id) on delete set null,
  action text not null check (action in ('hide', 'restore', 'suspend', 'unsuspend')),
  kind text not null check (kind in ('track', 'comment', 'mode', 'account')),
  target text not null check (char_length(target) between 1 and 64),
  target_user uuid references auth.users (id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 300),
  reports_seen int
);
create index if not exists moderation_log_target on public.moderation_log (kind, target, id desc);
create index if not exists moderation_log_actor_fk on public.moderation_log (actor);
create index if not exists moderation_log_target_user_fk on public.moderation_log (target_user);

-- Les suspensions : une ligne par suspension (l'historique reste). Active = ni levée, ni échue.
create table if not exists public.account_suspensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (char_length(reason) between 3 and 300),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  until timestamptz check (until is null or until > created_at),
  lifted_at timestamptz,
  lifted_by uuid references auth.users (id) on delete set null,
  lift_reason text check (lift_reason is null or char_length(lift_reason) between 3 and 300)
);
create index if not exists account_suspensions_user on public.account_suspensions (user_id, id desc);
create index if not exists account_suspensions_created_by_fk on public.account_suspensions (created_by);
create index if not exists account_suspensions_lifted_by_fk on public.account_suspensions (lifted_by);

alter table public.moderation_log enable row level security;
alter table public.account_suspensions enable row level security;
revoke all on public.moderation_log, public.account_suspensions from public, anon, authenticated;

-- La date d'un signalement de commentaire (jusqu'ici absente) : NULL pour les signalements d'avant cette étape (date inconnue), la date du jour pour les suivants.
alter table public.comment_reports add column if not exists created_at timestamptz;
alter table public.comment_reports alter column created_at set default now();

-- La file lit les contenus signalés ou masqués : un index partiel évite de parcourir tous les circuits et commentaires.
create index if not exists tracks_flagged on public.tracks (reports desc) where reports > 0 or hidden;
create index if not exists track_comments_flagged on public.track_comments (reports desc) where reports > 0 or hidden;

-- ---------------------------------------------------------------------------- 2. Fonctions internes (fermées à l'API)
-- Suspension EN COURS d'un compte (null si aucune) : { id, reason, until }.
create or replace function public.moderation_active_suspension(u uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare s record;
begin
  select x.id, x.reason, x.until, x.created_at into s from account_suspensions x
    where x.user_id = u and x.lifted_at is null and (x.until is null or x.until > now()) order by x.id desc limit 1;
  if not found then return null; end if;
  return jsonb_build_object('id', s.id, 'reason', s.reason, 'until', s.until, 'since', s.created_at);
end $$;

-- Masque (hide = true) ou rétablit (hide = false) un circuit ('track'), un commentaire ('comment') ou un mode ('mode'), et journalise. Renvoie vrai si l'état a changé.
-- strict : refuser (erreur) un contenu inconnu ou déjà dans l'état demandé ; sinon, sans effet ni trace. Même verrou que les fonctions de signalement : un signalement simultané
-- attend la décision, et la décision voit le compteur exact. SEULE entrée en écriture de `hidden` pour la modération, comme de la journalisation.
create or replace function public.moderation_apply_hide(k text, tid text, hide boolean, why text, strict boolean) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); r text := btrim(coalesce(why, '')); cur boolean; au uuid; n int; ident text := btrim(coalesce(tid, ''));
begin
  if not is_moderator(uid) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if char_length(r) < 3 or char_length(r) > 300 then raise exception 'Un motif de 3 à 300 caractères est obligatoire.'; end if;
  if hide is null then raise exception 'Masquer ou rétablir ?'; end if;
  if k = 'track' then
    if ident !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identifiant de circuit invalide.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('treport:' || ident, 0));
    select t.hidden, t.author, t.reports into cur, au, n from tracks t where t.id = ident::uuid;
    if not found then if strict then raise exception 'Circuit introuvable.'; end if; return false; end if;
    if cur = hide then if strict then raise exception using message = case when hide then 'Ce circuit est déjà masqué.' else 'Ce circuit est déjà visible.' end; end if; return false; end if;
    update tracks set hidden = hide where id = ident::uuid;
  elsif k = 'comment' then
    if ident !~ '^[0-9]{1,18}$' then raise exception 'Identifiant de commentaire invalide.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('creport:' || ident, 0));
    select c.hidden, c.author, c.reports into cur, au, n from track_comments c where c.id = ident::bigint;
    if not found then if strict then raise exception 'Commentaire introuvable.'; end if; return false; end if;
    if cur = hide then if strict then raise exception using message = case when hide then 'Ce commentaire est déjà masqué.' else 'Ce commentaire est déjà visible.' end; end if; return false; end if;
    update track_comments set hidden = hide where id = ident::bigint;
  elsif k = 'mode' then
    if ident !~ '^[0-9]{1,18}$' then raise exception 'Identifiant de mode invalide.'; end if;
    perform pg_advisory_xact_lock(hashtextextended('mreport:' || ident, 0));
    select m.hidden, m.owner, m.reports into cur, au, n from community_modes m where m.id = ident::bigint;
    if not found then if strict then raise exception 'Mode introuvable.'; end if; return false; end if;
    if cur = hide then if strict then raise exception using message = case when hide then 'Ce mode est déjà masqué.' else 'Ce mode est déjà visible.' end; end if; return false; end if;
    update community_modes set hidden = hide where id = ident::bigint;
  else
    raise exception 'Type inconnu.';
  end if;
  insert into moderation_log (actor, action, kind, target, target_user, reason, reports_seen)
    values (uid, case when hide then 'hide' else 'restore' end, k, ident, au, r, n);
  return true;
end $$;

-- Déclencheur : un compte suspendu ne publie ni ne commente. L'auteur est lu dans la ligne écrite (author ou owner), donc TOUTES les voies d'écriture sont couvertes :
-- la fonction serveur de publication (publish_track), update_track_meta, comment_add, mode_publish, playlist_save, et une écriture directe éventuelle.
create or replace function public.moderation_suspension_guard() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare s jsonb := moderation_active_suspension(coalesce(to_jsonb(new) ->> 'author', to_jsonb(new) ->> 'owner')::uuid);
begin
  if s is not null then
    raise exception 'Compte suspendu : publier et commenter est impossible %.',
      case when s ->> 'until' is null then 'jusqu’à sa réactivation' else 'jusqu’au ' || to_char(((s ->> 'until')::timestamptz) at time zone 'UTC', 'DD/MM/YYYY HH24:MI') || ' (UTC)' end;          -- (code d'erreur par défaut : HTTP 400, le message du serveur arrive tel quel au joueur ; 42501 deviendrait un « accès refusé » sans explication)
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------- 3. Fonctions appelées par le jeu (TOUTES commencent par le contrôle du statut de modérateur)
-- « Suis-je modérateur ? » : répond pour l'appelant, jamais pour un autre identifiant (on ne peut pas lister les modérateurs). Faux pour tout autre joueur.
create or replace function public.mod_status() returns boolean
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return is_moderator(auth.uid());
end $$;

-- La file : circuits et commentaires signalés ou masqués. st : 'pending' (signalés depuis la dernière décision d'un modérateur, ou jamais examinés), 'hidden' (actuellement
-- masqués), 'all'. k : 'all', 'track' ou 'comment'. « counted » : signalements qui comptent pour le masquage automatique (comptes de plus de 24 h ; les commentaires n'ont pas cette distinction).
-- Pas de motif de signalement : le jeu n'en demande pas (le joueur signale sans choisir de raison).
drop function if exists public.mod_queue(text, text, int, int);
create or replace function public.mod_queue(k text default 'all', st text default 'pending', lim int default 30, off int default 0)
returns table (kind text, id text, label text, author uuid, author_name text, reports int, counted int, hidden boolean, created_at timestamptz, last_report_at timestamptz, pending boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if k is null or k not in ('all', 'track', 'comment') then raise exception 'Type inconnu.'; end if;
  if st is null or st not in ('pending', 'hidden', 'all') then raise exception 'État inconnu.'; end if;
  return query
  select q.kind, q.id, q.label, q.author, q.author_name, q.reports, q.counted, q.hidden, q.created_at, q.last_report_at, q.pending
  from (
    select 'track'::text as kind, t.id::text as id, t.name as label, t.author as author, p.name as author_name, t.reports as reports,
           (select count(*)::int from track_reports r where r.track_id = t.id and r.counts) as counted, t.hidden as hidden, t.created_at as created_at,
           (select max(r.created_at) from track_reports r where r.track_id = t.id) as last_report_at,
           t.reports > coalesce((select l.reports_seen from moderation_log l where l.kind = 'track' and l.target = t.id::text and l.action in ('hide', 'restore') order by l.id desc limit 1), 0) as pending
    from tracks t join players p on p.id = t.author
    where k in ('all', 'track') and (t.reports > 0 or t.hidden)
    union all
    select 'comment'::text, c.id::text, c.body, c.author, p.name, c.reports, c.reports, c.hidden, c.created_at,
           (select max(r.created_at) from comment_reports r where r.comment_id = c.id),
           c.reports > coalesce((select l.reports_seen from moderation_log l where l.kind = 'comment' and l.target = c.id::text and l.action in ('hide', 'restore') order by l.id desc limit 1), 0)
    from track_comments c join players p on p.id = c.author
    where k in ('all', 'comment') and (c.reports > 0 or c.hidden)
  ) q
  where case st when 'pending' then q.pending when 'hidden' then q.hidden else true end
  order by q.pending desc, q.reports desc, q.last_report_at desc nulls last, q.created_at desc, q.id desc
  limit least(greatest(coalesce(lim, 30), 1), 100) offset greatest(coalesce(off, 0), 0);
end $$;

-- La fiche d'un contenu ('track' ou 'comment') : son texte PUBLIC, les compteurs, l'auteur (pseudo, identifiant : tous deux publics), sa suspension en cours et les décisions déjà prises.
create or replace function public.mod_detail(k text, tid text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare ident text := btrim(coalesce(tid, '')); res jsonb; au uuid; hist jsonb;
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if k = 'track' then
    if ident !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identifiant de circuit invalide.'; end if;
    select jsonb_build_object('kind', 'track', 'id', t.id, 'name', t.name, 'description', coalesce(t.description, ''), 'decor', t.decor, 'pieces', t.pieces, 'laps', t.laps,
             'plays', t.plays, 'likes', t.likes, 'reports', t.reports, 'counted', (select count(*) from track_reports r where r.track_id = t.id and r.counts),
             'hidden', t.hidden, 'picked', t.picked_at is not null, 'created_at', t.created_at), t.author
      into res, au from tracks t where t.id = ident::uuid;
  elsif k = 'comment' then
    if ident !~ '^[0-9]{1,18}$' then raise exception 'Identifiant de commentaire invalide.'; end if;
    select jsonb_build_object('kind', 'comment', 'id', c.id, 'body', c.body, 'reports', c.reports, 'counted', c.reports, 'hidden', c.hidden, 'created_at', c.created_at,
             'track', jsonb_build_object('id', t.id, 'name', t.name, 'hidden', t.hidden)), c.author
      into res, au from track_comments c join tracks t on t.id = c.track_id where c.id = ident::bigint;
  else
    raise exception 'Type inconnu.';
  end if;
  if res is null then raise exception 'Contenu introuvable.'; end if;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.id desc), '[]'::jsonb) into hist from (
    select l.id, l.at, l.action, l.reason, a.name as actor_name
    from moderation_log l left join players a on a.id = l.actor where l.kind = k and l.target = ident order by l.id desc limit 20) h;
  return res || jsonb_build_object(
    'author', (select jsonb_build_object('id', p.id, 'name', p.name,
        'tracks', (select count(*) from tracks x where x.author = p.id), 'hidden_tracks', (select count(*) from tracks x where x.author = p.id and x.hidden),
        'hidden_comments', (select count(*) from track_comments x where x.author = p.id and x.hidden),
        'moderator', is_moderator(p.id), 'suspension', moderation_active_suspension(p.id)) from players p where p.id = au),
    'history', hist);
end $$;

-- Les signalements d'un contenu : leur date (null : signalement d'avant l'étape 22) et s'ils comptent pour le masquage automatique. JAMAIS le joueur qui a signalé.
create or replace function public.mod_reports(k text, tid text) returns table (reported_at timestamptz, counted boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare ident text := btrim(coalesce(tid, ''));
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if k = 'track' then
    if ident !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Identifiant de circuit invalide.'; end if;
    return query select r.created_at, r.counts from track_reports r where r.track_id = ident::uuid order by r.created_at desc nulls last limit 100;
  elsif k = 'comment' then
    if ident !~ '^[0-9]{1,18}$' then raise exception 'Identifiant de commentaire invalide.'; end if;
    return query select r.created_at, true from comment_reports r where r.comment_id = ident::bigint order by r.created_at desc nulls last limit 100;
  else
    raise exception 'Type inconnu.';
  end if;
end $$;

-- Masquer / rétablir un circuit : motif obligatoire, journalisé. Un circuit masqué n'est plus listé (RLS « Circuits visibles ») ; ses données restent.
create or replace function public.mod_set_track_hidden(t uuid, hide boolean, why text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  perform moderation_apply_hide('track', t::text, hide, why, true);
end $$;

create or replace function public.mod_set_comment_hidden(c bigint, hide boolean, why text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  perform moderation_apply_hide('comment', c::text, hide, why, true);
end $$;

-- L'ancienne fonction de l'étape 13, même signature, mêmes droits : elle passe maintenant par la même voie que les deux ci-dessus, donc JOURNALISÉE (motif générique : elle n'en
-- reçoit pas). Sans effet, sans erreur, sur un contenu inconnu ou déjà dans l'état demandé (comme avant). Le jeu ne l'appelle pas ; la console de la base, si.
create or replace function public.mod_hide(kind text, target text, hide boolean) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  perform moderation_apply_hide(kind, target, hide, 'Décision prise par mod_hide, sans motif saisi', false);
end $$;

-- Suspendre un compte. until_at : fin de la suspension (null : jusqu'à réactivation) ; au plus 10 ans. Un modérateur ne se suspend pas lui-même et ne suspend pas un autre
-- modérateur (retirer d'abord son statut dans `moderators`). Une suspension en cours se réactive (mod_unsuspend) avant d'en prononcer une autre.
create or replace function public.mod_suspend(u uuid, why text, until_at timestamptz default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); r text := btrim(coalesce(why, '')); sid bigint;
begin
  if not is_moderator(uid) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if char_length(r) < 3 or char_length(r) > 300 then raise exception 'Un motif de 3 à 300 caractères est obligatoire.'; end if;
  if u is null or not exists (select 1 from players where id = u) then raise exception 'Compte introuvable.'; end if;
  if u = uid then raise exception 'On ne se suspend pas soi-même.'; end if;
  if is_moderator(u) then raise exception 'Un modérateur ne se suspend pas : retire d’abord son statut.'; end if;
  if until_at is not null and (until_at <= now() or until_at > now() + interval '3650 days') then raise exception 'La date de fin doit être dans le futur, et dans moins de 10 ans.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('suspend:' || u::text, 0));
  if moderation_active_suspension(u) is not null then raise exception 'Ce compte est déjà suspendu : réactive-le d’abord pour changer la suspension.'; end if;
  insert into account_suspensions (user_id, reason, created_by, until) values (u, r, uid, until_at) returning id into sid;
  insert into moderation_log (actor, action, kind, target, target_user, reason) values (uid, 'suspend', 'account', 'account', u, r);          -- (le compte n'est référencé QUE par target_user : supprimé avec le compte, il ne laisse aucun identifiant dans le journal)
  return sid;
end $$;

create or replace function public.mod_unsuspend(u uuid, why text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare uid uuid := auth.uid(); r text := btrim(coalesce(why, '')); sid bigint;
begin
  if not is_moderator(uid) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  if char_length(r) < 3 or char_length(r) > 300 then raise exception 'Un motif de 3 à 300 caractères est obligatoire.'; end if;
  if u is null then raise exception 'Compte introuvable.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('suspend:' || u::text, 0));
  select (moderation_active_suspension(u) ->> 'id')::bigint into sid;
  if sid is null then raise exception 'Ce compte n’est pas suspendu.'; end if;
  update account_suspensions set lifted_at = now(), lifted_by = uid, lift_reason = r where id = sid;
  insert into moderation_log (actor, action, kind, target, target_user, reason) values (uid, 'unsuspend', 'account', 'account', u, r);
end $$;

-- Les suspensions, la plus récente d'abord (active_only : seulement celles en cours). Le motif est celui du modérateur ; jamais d'identité d'un signalant.
create or replace function public.mod_suspensions(active_only boolean default true, lim int default 30, off int default 0)
returns table (id bigint, user_id uuid, name text, reason text, created_at timestamptz, created_by_name text, until timestamptz, lifted_at timestamptz, lift_reason text, active boolean)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  return query
  select s.id, s.user_id, p.name, s.reason, s.created_at, m.name, s.until, s.lifted_at, s.lift_reason,
         (s.lifted_at is null and (s.until is null or s.until > now())) as active
  from account_suspensions s left join players p on p.id = s.user_id left join players m on m.id = s.created_by
  where not coalesce(active_only, true) or (s.lifted_at is null and (s.until is null or s.until > now()))
  order by s.id desc
  limit least(greatest(coalesce(lim, 30), 1), 100) offset greatest(coalesce(off, 0), 0);
end $$;

-- Le journal : tout, ou les décisions sur un contenu (k + tid). La plus récente d'abord.
create or replace function public.mod_log(k text default null, tid text default null, lim int default 50, off int default 0)
returns table (id bigint, at timestamptz, actor_name text, action text, kind text, target text, target_name text, reason text, reports_seen int)
language plpgsql stable security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
begin
  if not is_moderator(auth.uid()) then raise exception 'Réservé aux modérateurs.' using errcode = '42501'; end if;
  return query
  select l.id, l.at, a.name, l.action, l.kind, l.target, t.name, l.reason, l.reports_seen
  from moderation_log l left join players a on a.id = l.actor left join players t on t.id = l.target_user
  where (k is null or l.kind = k) and (tid is null or l.target = btrim(tid))
  order by l.id desc
  limit least(greatest(coalesce(lim, 50), 1), 100) offset greatest(coalesce(off, 0), 0);
end $$;

-- ---------------------------------------------------------------------------- 4. Déclencheurs de suspension
-- Insertion : circuit, commentaire, mode, playlist. Modification : nom ou description d'un circuit (update_track_meta, republication), nom ou visibilité d'une playlist.
-- Les autres écritures (compteurs, masquage par la modération, j'aime) ne passent pas par là.
drop trigger if exists moderation_suspension_guard on public.tracks;
create trigger moderation_suspension_guard before insert on public.tracks for each row execute function public.moderation_suspension_guard();
drop trigger if exists moderation_suspension_guard_upd on public.tracks;
create trigger moderation_suspension_guard_upd before update of name, description, code on public.tracks for each row
  when (old.name is distinct from new.name or old.description is distinct from new.description or old.code is distinct from new.code) execute function public.moderation_suspension_guard();
drop trigger if exists moderation_suspension_guard on public.track_comments;
create trigger moderation_suspension_guard before insert on public.track_comments for each row execute function public.moderation_suspension_guard();
drop trigger if exists moderation_suspension_guard on public.community_modes;
create trigger moderation_suspension_guard before insert on public.community_modes for each row execute function public.moderation_suspension_guard();
drop trigger if exists moderation_suspension_guard on public.playlists;
create trigger moderation_suspension_guard before insert on public.playlists for each row execute function public.moderation_suspension_guard();
drop trigger if exists moderation_suspension_guard_upd on public.playlists;
create trigger moderation_suspension_guard_upd before update of name, public on public.playlists for each row
  when (old.name is distinct from new.name or old.public is distinct from new.public) execute function public.moderation_suspension_guard();

-- ---------------------------------------------------------------------------- 5. Droits : le jeu appelle les fonctions `mod_*` avec sa session (jamais anon) ; les internes ne s'appellent pas par l'API
revoke all on function public.moderation_active_suspension(uuid), public.moderation_apply_hide(text, text, boolean, text, boolean), public.moderation_suspension_guard()
  from public, anon, authenticated;
revoke all on function public.mod_status(), public.mod_queue(text, text, int, int), public.mod_detail(text, text), public.mod_reports(text, text),
  public.mod_set_track_hidden(uuid, boolean, text), public.mod_set_comment_hidden(bigint, boolean, text), public.mod_hide(text, text, boolean),
  public.mod_suspend(uuid, text, timestamptz), public.mod_unsuspend(uuid, text), public.mod_suspensions(boolean, int, int), public.mod_log(text, text, int, int)
  from public, anon, authenticated;
grant execute on function public.mod_status(), public.mod_queue(text, text, int, int), public.mod_detail(text, text), public.mod_reports(text, text),
  public.mod_set_track_hidden(uuid, boolean, text), public.mod_set_comment_hidden(bigint, boolean, text), public.mod_hide(text, text, boolean),
  public.mod_suspend(uuid, text, timestamptz), public.mod_unsuspend(uuid, text), public.mod_suspensions(boolean, int, int), public.mod_log(text, text, int, int)
  to authenticated;

notify pgrst, 'reload schema';

-- =====================================================================================
-- Retour arrière (aucune donnée n'est touchée par cette étape ; le journal et les suspensions déjà écrits restent dans leurs tables) :
--   1. lever le blocage des suspensions : drop trigger moderation_suspension_guard (et _upd) sur tracks, track_comments, community_modes, playlists ;
--   2. retrouver l'ancien mod_hide (sans journal) : relancer supabase/etape13-communaute.sql (ATTENTION : il redéfinit aussi d'autres fonctions de l'étape 13, puis relancer
--      etape17-securite.sql, qui en corrige certaines) ; les fonctions mod_* peuvent rester (elles ne servent qu'aux modérateurs) ou être supprimées par « drop function ».
-- =====================================================================================
