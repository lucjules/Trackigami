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
-- =====================================================================================

-- ---------------------------------------------------------------------------- 1. TECH-021 : lecture de scores.ghost_veh
grant select (ghost_veh) on public.scores to anon, authenticated;

notify pgrst, 'reload schema';
