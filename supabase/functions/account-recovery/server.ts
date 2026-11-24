// Trackigami : fonction serveur « account-recovery » (Supabase Edge Function, Deno) : récupérer un compte avec son code de secours (COMPLETE-003, décision D-6 : pas de courriel).
// La logique est dans handler.js (testable sous Node : tools/test-recovery-handler.mjs) ; ce fichier la branche sur Deno.serve.
//
// SOURCE de la fonction : ne pas coller ce fichier dans Supabase. `npm run build:function` génère index.ts (autonome, sans import) : c'est lui qu'on colle.
// Prérequis : supabase/etape21-recuperation.sql (sans elle : 503, jamais « ouvert »). Elle est appelée SANS session (le joueur a perdu son mot de passe) ; la clé de service
// (SUPABASE_SERVICE_ROLE_KEY, fournie automatiquement par Supabase) ne quitte jamais cette fonction. Réglage facultatif : ALLOWED_ORIGIN (adresse du jeu).
import { createRecoveryHandler } from './handler.js';

Deno.serve(createRecoveryHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  allowedOrigin: Deno.env.get('ALLOWED_ORIGIN') ?? '*',
}));
