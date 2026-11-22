// Lit la sortie de `psql --csv -t -f supabase/verify-prod.sql` (CSV sans en-tête, 4 colonnes : verification, attendu, constate, statut) sur l'entrée standard, affiche un bilan en Markdown
// (repris dans le résumé du travail GitHub) et choisit le code de sortie :
//   0  aucune ligne MANQUE / ÉCART, ou seulement des écarts ATTENDUS (variable ECARTS_ATTENDUS : fragments de libellé séparés par « ¦ ») : ils sont AFFICHÉS comme tels, jamais cachés ;
//   1  au moins un MANQUE / ÉCART qui n'est pas attendu ;
//   2  rien de lisible (entrée vide ou mal formée) : rien n'est prouvé.
// Utilisé par .github/workflows/verification-base.yml ; test : tools/test-verify-prod-report.mjs.
import { readFileSync } from 'node:fs';

// CSV (RFC 4180) : champs entre guillemets (guillemet doublé = guillemet), virgules et retours à la ligne permis dans un champ entre guillemets.
export function parseCsv(text) {
  const rows = []; let row = [], f = '', q = false, any = false;
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    const c = s[i]; any = true;
    if (q) { if (c === '"') { if (s[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; any = false; }
    else if (c !== '\r') f += c;
  }
  if (any || f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

export function analyse(text, expected = []) {
  const rows = parseCsv(text);
  if (!rows.length || rows.some((r) => r.length !== 4)) return { code: 2, md: '**verify-prod : sortie vide ou illisible : rien n\'est prouvé.**\n', counts: {} };
  const counts = {};
  for (const r of rows) counts[r[3]] = (counts[r[3]] || 0) + 1;
  const flagged = rows.filter((r) => r[3] === 'MANQUE' || r[3] === 'ÉCART').map(([verification, attendu, constate, statut]) => ({ verification, attendu, constate, statut, expected: expected.some((e) => e && verification.includes(e)) }));
  const unexpected = flagged.filter((f) => !f.expected);
  const md = [`**verify-prod : ${rows.length} ligne(s)** · ${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(' · ')}`, ''];
  if (flagged.length) {
    md.push('| statut | vérification | attendu | constaté |', '|---|---|---|---|');
    for (const f of flagged) md.push(`| ${f.statut}${f.expected ? ' (attendu : en attente d\'un correctif prévu)' : ''} | ${f.verification} | ${f.attendu} | ${f.constate} |`);
    md.push('');
  }
  md.push(unexpected.length ? `**${unexpected.length} écart(s) NON attendu(s)** : voir supabase/MIGRATIONS.md.` : flagged.length ? `Seuls des écarts attendus (${flagged.length}) : rien d'inattendu.` : 'Aucun MANQUE ni ÉCART.');
  return { code: unexpected.length ? 1 : 0, md: md.join('\n') + '\n', counts, flagged };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const r = analyse(readFileSync(0, 'utf8'), (process.env.ECARTS_ATTENDUS || '').split('¦').map((s) => s.trim()).filter(Boolean));
  process.stdout.write(r.md);
  process.exit(r.code);
}
