// Harnais de test commun à tous les scripts de tools/ (il remplace le test() qui était recopié dans chaque fichier).
//
//   import { test, finish } from './harness.mjs';
//   test('ce que le test vérifie', () => { assert.equal(…) });         // synchrone ou asynchrone
//   finish('Tous les tests de … passent.');                           // en dernier : code de sortie 1 s'il y a eu un échec
//   bugConnu('TECH-001', () => { assert.equal(…) }, 'ce que le test vérifie');   // un DÉFAUT CONNU (voir plus bas)
//
// Un test asynchrone dont on oublie le await est quand même attendu par finish() : ses assertions ne se perdent pas.
let failures = 0;
const pending = new Set();

const ok = (name) => console.log('  ok   ' + name);
const fail = (name, e) => {
  failures++;
  console.log('  FAIL ' + name + '\n       ' + String((e && (e.stack || e.message)) || e).split('\n').slice(0, 6).join('\n       '));
};

export function test(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') {
      const p = r.then(() => ok(name), (e) => fail(name, e)).finally(() => pending.delete(p));
      pending.add(p);
      return p;
    }
    ok(name);
  } catch (e) { fail(name, e); }
  return undefined;
}

export const failureCount = () => failures;

// ---- Défauts connus (phase « filet de sécurité ») ----------------------------------------------------------------------------------------------------
// bugConnu(id, fn) : `fn` écrit CE QUE LE JEU DEVRAIT FAIRE (des assert.* ordinaires, synchrones ou asynchrones). Tant que le défaut existe, fn échoue sur une assertion
// et le test RÉUSSIT (« ok », la suite reste verte : le défaut est connu, documenté dans docs/audit/AUDIT_COMPLET.md, et sa correction est une autre phase). Dès que fn passe, le
// test ÉCHOUE avec « le défaut <id> est corrigé : retire bugConnu et garde ce test comme test de régression » : le correctif oblige à transformer ce test en test ordinaire.
// Deux garde-fous pour qu'un test cassé ne passe pas pour un « défaut présent » :
//   - seule une AssertionError (assert.*) compte comme « le défaut est là » ; toute autre exception (TypeError, délai dépassé, erreur de la page…) fait ÉCHOUER le test ;
//   - les préconditions de la mise en scène (le circuit est bien chargé, le point de retour est bien pris…) s'écrivent avec precondition(), qui lève une erreur ordinaire :
//     une mise en scène ratée est un échec, jamais un défaut « connu ».
export const precondition = (cond, message) => { if (!cond) throw new Error('précondition du test non remplie : ' + message); };

const isAssertion = (e) => !!e && (e.name === 'AssertionError' || e.code === 'ERR_ASSERTION');
const fixedError = (id) => new Error(`le défaut ${id} est corrigé : retire bugConnu et garde ce test comme test de régression`);
function present(id, e) {
  if (isAssertion(e)) {                             // le défaut est toujours là : c'est ce qu'on attend
    if (process.env.BUG_VERBOSE) console.log(`       (défaut ${id} présent : ${String(e.message).split('\n')[0].slice(0, 400)})`);      // BUG_VERBOSE=1 : montre COMMENT le défaut se manifeste
    return;
  }
  const err = new Error(`erreur inattendue dans le test du défaut ${id} (ce n'est pas une assertion : le test lui-même est cassé) : ${String((e && e.message) || e)}`);
  err.cause = e;
  throw err;
}

// Le jugement seul (sans affichage), pour pouvoir le tester : se résout si le défaut est présent, se rejette sinon.
export async function jugeBugConnu(id, fn) {
  try { await fn(); } catch (e) { present(id, e); return; }
  throw fixedError(id);
}

export function bugConnu(id, fn, titre = '') {
  const name = `défaut connu ${id}${titre ? ' : ' + titre : ''} [réussit tant que le défaut est présent]`;
  return test(name, () => {
    let r;
    try { r = fn(); } catch (e) { present(id, e); return undefined; }          // (synchrone : un test de Node sans attente reste synchrone)
    if (r && typeof r.then === 'function') return r.then(() => { throw fixedError(id); }, (e) => present(id, e));
    throw fixedError(id);
  });
}

export async function finish(successMessage = 'Tous les tests passent.') {
  while (pending.size) await Promise.all([...pending]);
  if (failures) { console.log(`\n${failures} test(s) en échec`); process.exit(1); }
  console.log('\n' + successMessage);
}
