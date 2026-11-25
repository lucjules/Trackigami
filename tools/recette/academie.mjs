// Recette : Académie — les 6 leçons et tous les exercices évalués jusqu'à leur bilan (menu → consignes → « Commencer » → course menée au pilote automatique → bilan → retour).
//   node tools/recette/academie.mjs <fr|en> <kb|land>      Constate seulement ; ne corrige rien.
// Un profil neuf ; les leçons ne sont pas verrouillées. Pour chacune : la course démarre-t-elle, arrive-t-elle, que dit le bilan, y a-t-il une erreur console, un texte brut ou (en anglais) français.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Recette, launchBrowser, startServer, sleep, OUT } from './lib.mjs';

const lang = process.argv[2] || 'fr', input = process.argv[3] || 'kb';
const port = 9400 + Math.floor(Math.random() * 90);
const server = startServer(port);
const browser = await launchBrowser();
const R = new Recette(browser, port, lang, input, '-acad');
const modalTitle = () => R.$(() => (window.copytrack.ui.modalOpen ? (document.getElementById('modal-title') || {}).textContent : null));
const out = { lang, input, lessons: [], drills: [] };
async function openMenu() {
  await sleep(500);
  if (await R.$(() => window.copytrack.ui.modalOpen && /cadémie|cademy/.test((document.getElementById('modal-title') || {}).textContent))) return;      // quitter une leçon rouvre l'Académie
  await R.$(() => { const A = window.copytrack; if (A.mode !== 'menu') A.showMenu('menu'); });
  await R.until(() => window.copytrack.mode === 'menu' && !window.copytrack.ui.modalOpen, null, 20000).catch(() => {});
  await R.press('#menu [data-action="sub-play"]'); await sleep(300); await R.press('#menu-sub-play [data-action="academy"]');
  await R.until(() => window.copytrack.ui.modalOpen, null, 10000);
}
async function play(kind, i) {
  const rec = { i, kind };
  await openMenu();
  await R.press(`#modal-body [data-${kind}="${i}"]`); await sleep(600);
  rec.intro = await modalTitle();
  await R.press('#modal-actions button:first-child');
  await R.until(() => window.copytrack.session && window.copytrack.session.state === 'racing', null, 90000);
  await sleep(600);
  rec.race = await R.$(() => ({ track: window.copytrack.session.track.name, banner: (document.getElementById('hud-goal') || document.getElementById('academy-goal') || {}).textContent || null }));
  await R.step(`académie ${kind} ${i + 1} : en course`, null, { shot: false });
  const f = await R.finishWithBot(6000); rec.finish = f;
  await R.until(() => window.copytrack.ui.modalOpen, null, 20000).catch(() => {});
  rec.result = await modalTitle();
  rec.buttons = await R.$(() => [...document.querySelectorAll('#modal-actions button')].map((b) => b.textContent.trim()));
  rec.body = await R.$(() => (document.getElementById('modal-body') || {}).textContent.trim().replace(/\s+/g, ' ').slice(0, 220));
  await R.step(`académie ${kind} ${i + 1} : bilan`, null, { shot: i === 0 });
  await R.$(() => { window.copytrack.ui.closeModal(); window.copytrack.quitRace(); });
  await R.until(() => window.copytrack.mode === 'menu', null, 30000);
  return rec;
}
try {
  await R.init(); await R.load('Acad'); await R.enter('Acad');
  if (input !== 'kb') await R.$(() => window.copytrack.quality.apply('ultrapotato'));
  for (let k = 0; k < 2; k++) { await R.until(() => window.copytrack.ui.modalOpen, null, k ? 3000 : 12000).catch(() => {}); if (await R.$(() => window.copytrack.ui.modalOpen)) { await R.page.locator('#modal-actions button').last().evaluate((b) => b.click()); await sleep(400); } }
  const nDrills = await R.$(async () => (await import('/js/skills.js')).DRILLS.length);
  out.nDrills = nDrills;
  if (input === 'land' || input === 'kb') { /* paysage : la course peut démarrer */ }
  for (let i = 0; i < 6; i++) { try { out.lessons.push(await play('lesson', i)); } catch (e) { out.lessons.push({ i, error: String(e.message).split('\n')[0].slice(0, 200) }); await R.$(() => { try { window.copytrack.ui.closeModal(); window.copytrack.quitRace(); } catch { /* sans importance */ } }); await sleep(800); } }
  for (let i = 0; i < nDrills; i++) { try { out.drills.push(await play('drill', i)); } catch (e) { out.drills.push({ i, error: String(e.message).split('\n')[0].slice(0, 200) }); await R.$(() => { try { window.copytrack.ui.closeModal(); window.copytrack.quitRace(); } catch { /* sans importance */ } }); await sleep(800); } }
  out.errors = R.errors;
  console.log(JSON.stringify(out, null, 1).slice(0, 6000));
} catch (e) { out.error = String(e.message).split('\n')[0]; console.log('ERREUR', out.error); } finally {
  writeFileSync(join(OUT, `academie-${lang}-${input}.json`), JSON.stringify({ ...out, steps: R.steps.map((s) => ({ label: s.label, status: s.status, issues: s.issues, errors: s.errors })) }, null, 1));
  await browser.close(); server.kill(); process.exit(0);
}
