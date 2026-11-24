-- =====================================================================================
-- Trackigami : étape 21 (code de secours : récupérer un compte sans courriel, COMPLETE-003, décision D-6) — à lancer À LA MAIN, une fois, dans
-- Supabase > SQL Editor, après les étapes 1 à 20. Peut être relancée sans danger. NE SUPPRIME AUCUNE DONNÉE en s'appliquant (aucun delete, drop de table
-- ou de colonne, truncate) ; elle ajoute trois tables et des fonctions.
-- Compatible avec le jeu et les fonctions serveur actuels : à lancer AVANT de déployer la fonction `account-recovery` et de publier le jeu 0.16.13.
-- Le jeu 0.16.13 fonctionne SANS elle (le code de secours est annoncé indisponible, rien d'autre ne change).
--
-- Modèle de menaces et défenses : supabase/COMPTES.md, « Changer et récupérer son mot de passe ». En bref :
--   - le code (16 signes, 80 bits tirés par gen_random_bytes) n'est JAMAIS stocké : seulement bcrypt(SHA-256(code)) (pgcrypto, sel aléatoire par code, coût 10) ;
--     la fonction serveur envoie l'empreinte SHA-256 du code saisi, jamais le code (il n'apparaît donc dans aucun paramètre SQL, aucun journal de la base) ;
--   - à usage unique, et un nouveau code invalide l'ancien ;
--   - limitation EN BASE par pseudo saisi (qu'il existe ou non), par adresse (empreinte SHA-256, jamais l'adresse) et globale ; essais simultanés sérialisés ;
--   - réponse identique pour un pseudo inconnu, sans code, verrouillé ou un mauvais code (et un bcrypt calculé dans tous ces cas) ;
--   - créer / régénérer un code exige une authentification par MOT DE PASSE de moins de 10 minutes (revendication `amr` du jeton de Supabase Auth).
--
-- Ce que ce script ajoute :
--   recovery_codes      un haché par compte (null = aucun code valable), date, réservation pendant la pose du nouveau mot de passe ;
--   recovery_throttle   compteurs d'échecs et verrous (clés : empreinte du pseudo, empreinte de l'adresse, « global ») ;
--   recovery_log        journal minimal (date, compte s'il existe, issue) : ni code, ni empreinte, ni adresse, ni pseudo inconnu ;
--   recovery_code_new() et recovery_status()             appelées par le jeu (sessions de COMPTE seulement) ;
--   recovery_begin / recovery_finish / recovery_abort    réservées à la fonction serveur account-recovery (clé de service) ;
--   recovery_purge()                                     nettoyage (appelé de temps en temps par recovery_begin ; réservé au serveur).
-- Les trois tables sont fermées à tous (RLS activée, aucune règle, aucun droit pour anon / authenticated).
-- =====================================================================================

-- ---------------------------------------------------------------------------- pgcrypto (déjà présent dans « extensions » sur Supabase)
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if to_regprocedure('extensions.crypt(text,text)') is null or to_regprocedure('extensions.gen_salt(text,integer)') is null
     or to_regprocedure('extensions.gen_random_bytes(integer)') is null or to_regprocedure('extensions.digest(text,text)') is null then
    raise exception 'Étape 21 : pgcrypto doit être installé dans le schéma « extensions » (Database > Extensions). Rien d''autre n''a été créé.';
  end if;
end $$;

-- ---------------------------------------------------------------------------- tables (fermées à tous)
create table if not exists public.recovery_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code_hash text,                                   -- bcrypt(SHA-256(code)) ; null : aucun code valable (servi, ou jamais créé)
  created_at timestamptz not null default now(),
  used_at timestamptz,                              -- dernière récupération réussie
  pending_nonce uuid,                               -- réservation : le bon code a été donné, le nouveau mot de passe est en cours de pose
  pending_until timestamptz,
  -- Seul un haché bcrypt peut entrer ici : jamais un code en clair, même par erreur.
  constraint recovery_codes_bcrypt check (code_hash is null or code_hash ~ '^\$2[abxy]\$[0-9]{2}\$[./A-Za-z0-9]{53}$')
);
create table if not exists public.recovery_throttle (
  k text primary key,                               -- 'u:' || sha256(pseudo en minuscules) ; 'ip:' || sha256(adresse) ; 'global'
  fails integer not null default 0,                 -- échecs dans la fenêtre (pour 'global' : essais)
  window_start timestamptz not null default now(),
  locked_until timestamptz,
  constraint recovery_throttle_key check (k = 'global' or k ~ '^(u|ip):[0-9a-f]{64}$')
);
create table if not exists public.recovery_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete set null,     -- null : pseudo inconnu (jamais gardé), ou compte supprimé depuis
  outcome text not null,
  constraint recovery_log_outcome check (outcome in ('new', 'verified', 'reset', 'fail', 'locked', 'abort', 'finish-missed'))
);
create index if not exists recovery_log_at on public.recovery_log (at);
create index if not exists recovery_log_user on public.recovery_log (user_id);     -- (étape 18 : chaque clé étrangère a son index)

alter table public.recovery_codes enable row level security;
alter table public.recovery_throttle enable row level security;
alter table public.recovery_log enable row level security;
revoke all on public.recovery_codes, public.recovery_throttle, public.recovery_log from public, anon, authenticated;

-- ---------------------------------------------------------------------------- outils internes
-- Ligne de limitation `p_key`, fenêtre remise à zéro si elle a plus de `win`. L'upsert VERROUILLE la ligne jusqu'à la fin de la transaction : deux essais
-- simultanés sur la même clé s'attendent (le compteur est exact, jamais « 5 essais en parallèle comptés comme 1 »).
create or replace function public.recovery_row(p_key text, win interval) returns public.recovery_throttle
language plpgsql security definer set search_path = public, pg_temp as $$
declare r public.recovery_throttle;
begin
  insert into recovery_throttle as t (k, fails, window_start) values (p_key, 0, now())
    on conflict (k) do update set
      fails = case when t.window_start < now() - win then 0 else t.fails end,
      window_start = case when t.window_start < now() - win then now() else t.window_start end
    returning * into r;
  return r;
end $$;
revoke all on function public.recovery_row(text, interval) from public, anon, authenticated, service_role;

-- Empreinte hexadécimale SHA-256 (pgcrypto).
create or replace function public.recovery_sha(t text) returns text
language sql immutable set search_path = public, pg_temp as $$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;
revoke all on function public.recovery_sha(text) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------- appelées par le jeu (compte connecté)
-- Nouveau code de secours : renvoie « XXXX-XXXX-XXXX-XXXX » UNE fois (la base n'en garde que le haché) ; l'ancien code ne vaut plus rien.
-- Exige une authentification par mot de passe de moins de 10 minutes (revendication `amr` du jeton) : une session volée ne suffit pas à prendre le compte
-- pour de bon. Le jeu redemande le mot de passe (js/account.js : regenerateRecoveryCode).
create or replace function public.recovery_code_new() returns text
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  uid uuid := auth.uid();
  claims jsonb;
  recent boolean;
  prev timestamptz;
  alpha constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';     -- 32 signes (base 32 de Crockford : ni I, L, O, U) : 256 / 32 tombe juste, chaque signe est uniforme
  bytes bytea;
  code text := '';
begin
  if uid is null then raise exception 'Non connecté'; end if;
  if not exists (select 1 from accounts where user_id = uid) then raise exception 'Ce n''est pas un compte'; end if;
  begin claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb; exception when others then claims := null; end;
  select exists (
    select 1 from jsonb_array_elements(case when jsonb_typeof(claims -> 'amr') = 'array' then claims -> 'amr' else '[]'::jsonb end) a
    where a ->> 'method' = 'password' and (a ->> 'timestamp') ~ '^[0-9]{1,12}$'
      and to_timestamp((a ->> 'timestamp')::bigint) > now() - interval '10 minutes'
  ) into recent;
  if not recent then raise exception 'Mot de passe à confirmer : reconnecte-toi pour créer un code de secours.'; end if;
  select c.created_at into prev from recovery_codes c where c.user_id = uid for update;
  if prev is not null and prev > now() - interval '20 seconds' then raise exception 'Trop de demandes : réessaie dans 20 s.'; end if;
  bytes := extensions.gen_random_bytes(16);
  for i in 0 .. 15 loop code := code || substr(alpha, (get_byte(bytes, i) % 32) + 1, 1); end loop;
  insert into recovery_codes (user_id, code_hash, created_at, used_at, pending_nonce, pending_until)
    values (uid, extensions.crypt(recovery_sha(code), extensions.gen_salt('bf', 10)), now(), null, null, null)
    on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now(), pending_nonce = null, pending_until = null;
  insert into recovery_log (user_id, outcome) values (uid, 'new');
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4) || '-' || substr(code, 13, 4);
end $$;
revoke all on function public.recovery_code_new() from public, anon;
grant execute on function public.recovery_code_new() to authenticated;

-- État du code de SON compte (jamais le haché) : { account, has_code, created_at, used_at }.
create or replace function public.recovery_status() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'account', exists (select 1 from accounts where user_id = auth.uid()),
    'has_code', coalesce((select c.code_hash is not null from recovery_codes c where c.user_id = auth.uid()), false),
    'created_at', (select c.created_at from recovery_codes c where c.user_id = auth.uid() and c.code_hash is not null),
    'used_at', (select c.used_at from recovery_codes c where c.user_id = auth.uid()));
$$;
revoke all on function public.recovery_status() from public, anon;
grant execute on function public.recovery_status() to authenticated;

-- ---------------------------------------------------------------------------- réservées à la fonction serveur account-recovery
-- Nettoyage : compteurs périmés (2 jours sans activité, pas de verrou en cours) et journal de plus de 30 jours.
create or replace function public.recovery_purge() returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare a int; b int;
begin
  delete from recovery_throttle where k <> 'global' and window_start < now() - interval '2 days' and (locked_until is null or locked_until < now());
  get diagnostics a = row_count;
  delete from recovery_log where at < now() - interval '30 days';
  get diagnostics b = row_count;
  return jsonb_build_object('throttle', a, 'log', b);
end $$;
revoke all on function public.recovery_purge() from public, anon, authenticated;
grant execute on function public.recovery_purge() to service_role;

-- Essai de récupération : uname = pseudo saisi ; code_sha = SHA-256 (hexadécimal) du code saisi, normalisé (js/accountRules.js : normalizeRecoveryCode) ;
-- ip_key = SHA-256 (hexadécimal) de l'adresse. Renvoie :
--   { status: 'ok', user_id, nonce }   le bon code : réservé 2 minutes, le temps de poser le mot de passe (puis recovery_finish, ou recovery_abort) ;
--   { status: 'fail' }                 mauvais code, pseudo inconnu, compte sans code, pseudo verrouillé, code déjà réservé : TOUJOURS cette même réponse ;
--   { status: 'rate', retry }          adresse verrouillée ou plafond global atteint (ne dit rien du pseudo).
-- Les compteurs sont écrits avant de répondre (la transaction se termine normalement : aucune exception sur un échec).
create or replace function public.recovery_begin(uname text, code_sha text, ip_key text) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  -- Limites (à changer ici seulement ; supabase/COMPTES.md les cite) :
  g_max constant int := 300;  g_win constant interval := '10 minutes';                       -- essais, tous pseudos confondus
  u_max constant int := 5;    u_win constant interval := '1 hour';  u_lock constant interval := '15 minutes';   -- échecs par pseudo saisi
  i_max constant int := 20;   i_win constant interval := '1 hour';  i_lock constant interval := '1 hour';       -- échecs par adresse
  lname text := lower(trim(coalesce(uname, '')));
  ukey text; ikey text;
  g recovery_throttle; i recovery_throttle; u recovery_throttle;
  uid uuid; h text; pend timestamptz;
  ok boolean := false;
  nonce uuid;
begin
  if char_length(lname) > 40 or code_sha is null or code_sha !~ '^[0-9a-f]{64}$' or ip_key is null or ip_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Paramètres invalides';
  end if;
  ukey := 'u:' || recovery_sha(lname);
  ikey := 'ip:' || ip_key;
  if random() < 0.02 then perform recovery_purge(); end if;
  -- 1. Plafond global (compte les ESSAIS) ; 2. adresse verrouillée : réponse « trop d'essais », qui ne dépend pas du pseudo.
  g := recovery_row('global', g_win);
  update recovery_throttle set fails = fails + 1 where k = 'global' returning * into g;
  if g.fails > g_max then return jsonb_build_object('status', 'rate', 'retry', greatest(1, ceil(extract(epoch from g.window_start + g_win - now())))::int); end if;
  i := recovery_row(ikey, i_win);
  if i.locked_until > now() then return jsonb_build_object('status', 'rate', 'retry', greatest(1, ceil(extract(epoch from i.locked_until - now())))::int); end if;
  -- 3. Le pseudo saisi (qu'il existe ou non : même ligne de limitation, même calcul).
  u := recovery_row(ukey, u_win);
  select a.user_id into uid from accounts a where a.username_lower = lname;
  if uid is not null then select c.code_hash, c.pending_until into h, pend from recovery_codes c where c.user_id = uid for update; end if;
  if u.locked_until > now() then
    perform extensions.crypt(code_sha, extensions.gen_salt('bf', 10));          -- même travail qu'une vérification : la durée ne dit rien
    insert into recovery_log (user_id, outcome) values (uid, 'locked');
    return jsonb_build_object('status', 'fail');
  end if;
  if h is not null and (pend is null or pend < now()) then
    ok := extensions.crypt(code_sha, h) = h;
  else
    perform extensions.crypt(code_sha, extensions.gen_salt('bf', 10));          -- pseudo inconnu, aucun code, ou code en cours d'usage : même travail
  end if;
  if ok then
    nonce := gen_random_uuid();
    update recovery_codes set pending_nonce = nonce, pending_until = now() + interval '2 minutes' where user_id = uid;
    update recovery_throttle set fails = 0, locked_until = null where k = ukey;
    insert into recovery_log (user_id, outcome) values (uid, 'verified');
    return jsonb_build_object('status', 'ok', 'user_id', uid, 'nonce', nonce);
  end if;
  update recovery_throttle set
      fails = case when fails + 1 >= u_max then 0 else fails + 1 end,
      window_start = case when fails + 1 >= u_max then now() else window_start end,
      locked_until = case when fails + 1 >= u_max then now() + u_lock else locked_until end
    where k = ukey;
  update recovery_throttle set
      fails = case when fails + 1 >= i_max then 0 else fails + 1 end,
      window_start = case when fails + 1 >= i_max then now() else window_start end,
      locked_until = case when fails + 1 >= i_max then now() + i_lock else locked_until end
    where k = ikey;
  insert into recovery_log (user_id, outcome) values (uid, 'fail');
  return jsonb_build_object('status', 'fail');
end $$;
revoke all on function public.recovery_begin(text, text, text) from public, anon, authenticated;
grant execute on function public.recovery_begin(text, text, text) to service_role;

-- Le nouveau mot de passe est posé : le code est CONSOMMÉ (usage unique) et les sessions du compte sont révoquées (jetons de renouvellement compris :
-- auth.refresh_tokens dépend de auth.sessions). Renvoie { consumed, sessions } (sessions = -1 si le schéma auth refuse : le mot de passe est changé
-- quand même, Supabase Auth révoque aussi les sessions quand un mot de passe change ; la fonction serveur le journalise).
create or replace function public.recovery_finish(p_uid uuid, p_nonce uuid) returns jsonb
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare n int := 0; m int := 0;
begin
  update recovery_codes set code_hash = null, used_at = now(), pending_nonce = null, pending_until = null
    where user_id = p_uid and pending_nonce = p_nonce;
  if not found then
    insert into recovery_log (user_id, outcome) values (p_uid, 'finish-missed');
    return jsonb_build_object('consumed', false);
  end if;
  begin
    delete from auth.sessions where user_id = p_uid;
    get diagnostics n = row_count;
  exception when others then n := -1;
  end;
  begin
    update auth.refresh_tokens set revoked = true where user_id = p_uid::text and revoked is not true;     -- (anciens jetons sans session)
    get diagnostics m = row_count;
  exception when others then m := 0;
  end;
  insert into recovery_log (user_id, outcome) values (p_uid, 'reset');
  return jsonb_build_object('consumed', true, 'sessions', n, 'tokens', m);
end $$;
revoke all on function public.recovery_finish(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recovery_finish(uuid, uuid) to service_role;

-- La pose du mot de passe a échoué (Auth l'a refusé, ou ne répond pas) : la réservation est levée, le code reste valable.
create or replace function public.recovery_abort(p_uid uuid, p_nonce uuid) returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  update recovery_codes set pending_nonce = null, pending_until = null where user_id = p_uid and pending_nonce = p_nonce;
  if found then insert into recovery_log (user_id, outcome) values (p_uid, 'abort'); end if;
  return found;
end $$;
revoke all on function public.recovery_abort(uuid, uuid) from public, anon, authenticated;
grant execute on function public.recovery_abort(uuid, uuid) to service_role;

notify pgrst, 'reload schema';
