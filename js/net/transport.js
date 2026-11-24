// Transport de jeu : WebRTC pair à pair en maillage complet (chaque joueur est relié directement à tous les autres).
//
// COMMENT ÇA MARCHE (la partie délicate, en clair)
// ------------------------------------------------
// 1. Annuaire. Les joueurs d'une salle se découvrent par la signalisation (signaling.js : Supabase Realtime). Quand le
//    joueur B apparaît, A et B doivent maintenant ouvrir un tuyau direct. Un navigateur ne connaît pas l'adresse de l'autre :
//    il faut un échange d'informations par un tiers. C'est le rôle de la signalisation, et seulement ça.
// 2. Qui commence ? Pour chaque PAIRE, le joueur dont l'identifiant est le plus petit (ordre alphabétique) est
//    l'« initiateur » : lui seul crée la connexion et les canaux, l'autre ne fait que répondre. Pas de double offre
//    simultanée (« glare ») : c'est la règle la plus simple pour l'éviter.
// 3. Offre / réponse (SDP). L'initiateur crée un RTCPeerConnection + deux canaux de données, fabrique une OFFRE (description
//    de ce qu'il sait faire), la garde (setLocalDescription) et l'envoie par la signalisation. L'autre la reçoit
//    (setRemoteDescription), fabrique une RÉPONSE, la garde et la renvoie. Chacun connaît alors les capacités de l'autre.
// 4. Candidats ICE. En parallèle, chaque navigateur découvre ses adresses possibles (locale, publique vue par un serveur STUN,
//    éventuellement un relais TURN) et les envoie au fur et à mesure (« trickle ICE »). Un candidat reçu AVANT la description
//    distante est mis en attente puis appliqué ensuite. Le navigateur essaie les paires d'adresses jusqu'à en trouver une qui
//    marche : le tuyau s'ouvre, la signalisation n'est plus utilisée pour cette paire.
// 5. Deux canaux par paire :
//      « state » : non fiable, non ordonné (maxRetransmits 0) = UDP pur. Un paquet de position perdu est déjà périmé 50 ms plus
//                  tard : le retransmettre ne ferait qu'ajouter du retard. On saute l'envoi si la file d'envoi dépasse 16 Ko.
//      « ctl »   : fiable et ordonné, pour les messages rares qui ne doivent pas se perdre (prêt, départ, arrivée, ping).
// 6. Réseaux fermés. STUN (gratuit) suffit pour la plupart des box. Environ 10 à 20 % des paires (réseaux d'entreprise, 4G à
//    NAT symétrique) échouent sans relais : il faut alors un serveur TURN (payant, ou à héberger) à ajouter dans ICE_SERVERS.
//    Une paire qui échoue est signalée (état « failed ») : le joueur reste dans la salle mais ne voit pas / n'est pas vu de cet autre.
// 7. Coût : N joueurs = N·(N−1)/2 connexions ; chacun envoie son état N−1 fois. À 8 joueurs : 7 liens, ~0,8 Ko/s chacun.
// 8. Une liaison ouverte ne dépend plus de la signalisation (TECH-046) : la signalisation peut tomber et revenir, la liaison continue. Une liaison est refaite
//    à neuf (RTCPeerConnection neuf : restartPeer) seulement quand elle tombe vraiment ; l'autre côté le voit et refait la sienne. Pour que les deux
//    côtés retombent d'accord quel que soit l'ordre des messages :
//      - les messages de signalisation d'une paire sont traités un par un, dans l'ordre (file par liaison) ; les rappels d'une connexion remplacée sont ignorés ;
//      - le non-initiateur qui reçoit une offre d'une AUTRE connexion de l'initiateur (autre empreinte DTLS) repart d'une connexion neuve ; une relance ICE
//        (même empreinte) reste sur la sienne ;
//      - l'initiateur dont l'offre reste sans réponse NEGOTIATION_MS renégocie avec une connexion neuve (MAX_NEGOTIATIONS fois au plus, puis « failed »).
// 9. Descriptions signées (TECH-040). La signalisation est un canal public : n'importe qui peut y envoyer une offre ou une réponse au nom d'un joueur.
//    Avec seal/vet (fournis par la salle), chaque offre et chaque réponse porte la signature de son auteur sur son empreinte DTLS (et, pour une réponse,
//    sur celle de l'offre) ; chaque candidat ICE, la signature de son texte et de l'empreinte DTLS de la connexion de son auteur (sealIce / vetIce). Ce qui ne
//    correspond pas à l'identité attendue est écarté AVANT d'ouvrir quoi que ce soit : un client modifié qui prend l'identifiant d'un autre ne lui vole pas sa
//    négociation et n'y glisse pas ses adresses (constaté en essai : ses candidats suffisaient à bloquer la liaison du vrai joueur). La liaison ouverte est
//    ensuite prouvée (room.js : hi / hello).
import { CONFIG } from '../config.js';

const ICE_SERVERS = CONFIG.iceServers;      // STUN par défaut ; un relais TURN s'ajoute dans js/config.js

const MAX_BUFFERED = 16 * 1024;
const MAX_LINKS = 7;
const NEGOTIATION_MS = 12000;               // offre sans réponse (ou connexion qui n'avance pas) : on renégocie avec une connexion neuve
const MAX_NEGOTIATIONS = 4;                 // au-delà : « failed » (la salle l'affiche ; la liaison est refaite si l'autre revient)
const MAX_PENDING = 64;                     // candidats ICE gardés en attente de la description distante
const ICE_WAIT_MS = 2500;                   // serveurs ICE : on n'attend jamais plus longtemps leur réponse (on garde alors les derniers connus)
// TECH-089 (f) : messages de signalisation d'un joueur qui n'est pas (ou pas encore) membre, gardés un instant sans rien ouvrir : la présence d'un joueur qui revient
// peut arriver APRÈS son offre (deux canaux de Realtime, sans ordre garanti). Rejoués, et vérifiés comme les autres, dès qu'il devient membre (addPeer).
const HOLD_MS = 5000, HOLD_IDS = 16, HOLD_PER_ID = 24;

const descJSON = (d) => (d && d.toJSON ? d.toJSON() : d);
// Empreinte DTLS d'une description : elle identifie la connexion qui l'a produite (une relance ICE la garde, une connexion neuve en a une autre).
export const fingerprintOf = (sdp) => { const m = /a=fingerprint:\S+ (\S+)/i.exec(String(sdp || '')); return m ? m[1].toUpperCase() : null; };

class PeerLink {
  constructor(id, initiator) {
    this.id = id; this.initiator = initiator;
    this.gen = 0;                  // numéro de la connexion en cours : les rappels d'une connexion remplacée sont ignorés
    this.pc = null; this.state = null; this.ctl = null;
    this.pending = [];             // candidats ICE reçus avant la description distante
    this.remoteSet = false; this.remoteFp = null;
    this.status = 'connecting';    // connecting | open | failed | closed
    this.opened = false;           // cette connexion a été ouverte (une fermeture n'a de sens qu'après)
    this.restarts = 0;             // relances ICE de cette connexion
    this.attempts = 0;             // renégociations sans succès
    this.timer = null;
    this.queue = Promise.resolve();
  }
}

export class PeerMesh {
  // signaling : voir signaling.js ; handlers : { onMessage(id, 'ctl'|'state', data), onLink(id, status) } (status : connecting | open | failed | closed ; aucun
  // appel quand la salle retire elle-même une liaison : removePeer est silencieux).
  // isMember(id) : ce joueur est-il un membre présent de la salle ? Seuls ses messages de signalisation peuvent ouvrir une liaison (TECH-045) ; par défaut,
  // présent dans l'annuaire de la signalisation.
  // getIce() : serveurs ICE à jour (ice.js : identifiants TURN à durée limitée, gardés jusqu'aux 3/4 de leur durée) ; redemandés à CHAQUE connexion neuve et
  // avant une relance ICE (TECH-050), pour qu'un arrivant tardif ou une reconnexion n'utilise pas des identifiants expirés.
  // seal(id, desc, peerDesc) → preuve (objet) à joindre à ma description ; vet(id, desc, preuve, myDesc) → vrai si la description vient bien de ce joueur
  // (point 9 ci-dessus). Sans eux (tests du transport seul), les descriptions ne sont ni signées ni vérifiées.
  // sealIce(id, candidat, empreinte DTLS locale) → preuve ; vetIce(id, candidat, preuve, empreinte DTLS distante) → vrai si le candidat vient bien de ce joueur.
  constructor({ selfId, signaling, handlers, iceServers = ICE_SERVERS, getIce = null, isMember = null, seal = null, vet = null, sealIce = null, vetIce = null, RTC = globalThis.RTCPeerConnection }) {
    this.selfId = selfId; this.signaling = signaling; this.h = handlers; this.ice = iceServers; this.getIce = getIce; this.RTC = RTC; this.seal = seal; this.vet = vet;
    this.sealIce = sealIce; this.vetIce = vetIce;
    this.isMember = isMember || ((id) => !!(this.signaling && this.signaling.peers && this.signaling.peers.has(id)));
    this.links = new Map();
    this._held = new Map();                    // id → [{ at, data }] (HOLD_MS)
    this.stats = { sent: 0, recv: 0, skipped: 0 };
    this._listen(signaling);
  }

  _listen(sig) { sig.on('signal', (from, data) => { if (sig === this.signaling) this._onSignal(from, data); }); }

  // Reconnexion (resume.js) : la nouvelle signalisation remplace l'ancienne. Les liaisons ouvertes n'en dépendent pas et continuent.
  setSignaling(sig) { this.signaling = sig; this._listen(sig); }

  // Un joueur est apparu dans la salle : on ouvre (ou on attend) la connexion.
  addPeer(id) {
    if (typeof id !== 'string' || this.links.has(id) || id === this.selfId) return null;
    if (this.links.size >= MAX_LINKS) return null;       // une salle compte 8 joueurs au plus
    const link = new PeerLink(id, this.selfId < id);
    this.links.set(id, link);
    this._enqueue(link, () => this._setup(link));
    const held = this._held.get(id), now = Date.now();
    this._held.delete(id);
    for (const e of held || []) if (now - e.at <= HOLD_MS) this._enqueue(link, () => this._handle(link, e.data));
    return link;
  }

  _hold(from, data) {
    if (from.length > 64) return;
    const now = Date.now();
    for (const [id, q] of this._held) if (!q.length || now - q[q.length - 1].at > HOLD_MS) this._held.delete(id);
    let q = this._held.get(from);
    if (!q) {
      if (this._held.size >= HOLD_IDS) this._held.delete(this._held.keys().next().value);
      q = []; this._held.set(from, q);
    }
    q.push({ at: now, data });
    if (q.length > HOLD_PER_ID) q.shift();
  }

  // Liaison refaite à neuf (connexion neuve, nouvelle négociation) : après une vraie panne, ou quand l'autre a refait la sienne.
  restartPeer(id) {
    const link = this.links.get(id);
    if (!link) return this.addPeer(id);
    link.attempts = 0;
    this._enqueue(link, () => this._setup(link));
    return link;
  }

  removePeer(id) {
    const l = this.links.get(id);
    if (!l) return;
    this.links.delete(id);
    this._teardown(l);
    l.status = 'closed';
  }

  closeAll() { for (const id of [...this.links.keys()]) this.removePeer(id); }

  statusOf(id) { const l = this.links.get(id); return l ? l.status : null; }
  // Empreintes DTLS de la liaison (la mienne, celle de l'autre) : la preuve d'identité les signe (TECH-040, identity.js) ; et son numéro de connexion.
  fingerprints(id) {
    const l = this.links.get(id), pc = l && l.pc;
    if (!pc) return { local: '', remote: '' };
    return { local: fingerprintOf(pc.localDescription && pc.localDescription.sdp) || '', remote: fingerprintOf(pc.remoteDescription && pc.remoteDescription.sdp) || l.remoteFp || '' };
  }
  linkGen(id) { const l = this.links.get(id); return l ? l.gen : -1; }

  // Les opérations d'une liaison (mise en place, messages de signalisation) se suivent une par une, dans l'ordre d'arrivée.
  _enqueue(link, fn) { const p = link.queue.then(fn).catch(() => { /* message invalide ou tardif : ignoré */ }); link.queue = p; return p; }

  _current(link, gen) { return this.links.get(link.id) === link && link.gen === gen; }

  // Ferme la connexion en cours de la liaison ; ses rappels (canaux, ICE, état) ne font plus rien.
  _teardown(link) {
    link.gen++;
    clearTimeout(link.timer); link.timer = null;
    const { pc, state, ctl } = link;
    link.pc = link.state = link.ctl = null;
    for (const ch of [state, ctl]) { try { if (ch) ch.close(); } catch { /* déjà fermé */ } }
    try { if (pc) pc.close(); } catch { /* déjà fermée */ }
  }

  async _ice() {
    if (!this.getIce) return this.ice;
    let timer = null;
    try {
      const s = await Promise.race([Promise.resolve(this.getIce()), new Promise((r) => { timer = setTimeout(() => r(null), ICE_WAIT_MS); })]);
      if (Array.isArray(s) && s.length) this.ice = s;
    } catch { /* on garde les derniers connus */ } finally { clearTimeout(timer); }
    return this.ice;
  }

  // Relance ICE : la connexion existante prend les serveurs (identifiants TURN) à jour, si le navigateur le permet.
  async _refreshConfig(link, gen) {
    const ice = await this._ice();
    const pc = link.pc;
    if (!this._current(link, gen) || !pc || typeof pc.setConfiguration !== 'function') return;
    try { pc.setConfiguration({ ...(typeof pc.getConfiguration === 'function' ? pc.getConfiguration() : {}), iceServers: ice }); } catch { /* refusé : on garde les anciens */ }
  }

  // Connexion neuve pour la liaison (la précédente, s'il y en a une, est fermée).
  async _setup(link) {
    if (this.links.get(link.id) !== link) return;
    this._teardown(link);
    const gen = link.gen;
    link.remoteSet = false; link.remoteFp = null; link.pending = []; link.opened = false; link.restarts = 0;
    this._status(link, 'connecting');
    const iceServers = await this._ice();
    if (!this._current(link, gen)) return;
    const pc = new this.RTC({ iceServers });
    link.pc = pc;
    pc.onicecandidate = async (e) => {
      if (link.gen !== gen || !e.candidate) return;
      const cand = descJSON(e.candidate);
      const p = this.sealIce ? await this.sealIce(link.id, cand, fingerprintOf(pc.localDescription && pc.localDescription.sdp)).catch(() => null) : null;
      if (link.gen === gen && (p || !this.sealIce)) this.signaling.send(link.id, { k: 'ice', c: cand, ...(p ? { p } : {}) });
    };
    pc.onconnectionstatechange = () => {
      if (link.gen !== gen) return;
      const s = pc.connectionState;
      if (s === 'failed') {
        // Une seule relance d'ICE (changement de réseau, Wi-Fi → 4G) avant d'abandonner.
        if (link.initiator && link.restarts < 1) { link.restarts++; this._status(link, 'connecting'); this._enqueue(link, () => this._offer(link, gen, true)); }
        else this._status(link, 'failed');
      } else if (s === 'connected') this._maybeOpen(link);            // (au retour d'une relance ICE : les canaux sont restés ouverts)
      else if (s === 'closed' && link.opened) this._status(link, 'closed');
    };
    if (link.initiator) {
      this._channels(link, gen, pc.createDataChannel('state', { ordered: false, maxRetransmits: 0 }), pc.createDataChannel('ctl', { ordered: true }));
      await this._offer(link, gen);
    } else {
      pc.ondatachannel = (e) => { if (link.gen === gen) this._channels(link, gen, e.channel); };
    }
  }

  _channels(link, gen, ...chans) {
    for (const ch of chans) {
      ch.binaryType = 'arraybuffer';
      if (ch.label === 'state') link.state = ch; else if (ch.label === 'ctl') link.ctl = ch; else continue;
      ch.onopen = () => { if (link.gen === gen) this._maybeOpen(link); };
      // Un canal qui se ferme après avoir été ouvert : la liaison est tombée (l'autre a fermé sa connexion, ou elle est morte).
      ch.onclose = () => { if (link.gen === gen && link.opened && link.status !== 'closed') this._status(link, 'closed'); };
      ch.onmessage = (e) => {
        if (link.gen !== gen) return;
        this.stats.recv += e.data.byteLength || e.data.length || 0;
        if (ch.label === 'ctl') { let m; try { m = JSON.parse(e.data); } catch { return; } if (m && typeof m === 'object') this.h.onMessage(link.id, 'ctl', m); }
        else this.h.onMessage(link.id, 'state', e.data);
      };
      if (ch.readyState === 'open') ch.onopen();
    }
  }

  _maybeOpen(link) {
    const { state, ctl, pc } = link;
    if (!state || !ctl || state.readyState !== 'open' || ctl.readyState !== 'open') return;
    if (pc && pc.connectionState && pc.connectionState !== 'connected' && pc.connectionState !== 'new' && pc.connectionState !== 'connecting') return;
    clearTimeout(link.timer); link.timer = null;
    link.opened = true; link.attempts = 0;
    this._status(link, 'open');
  }

  _status(link, s) {
    if (link.status === s) return;
    link.status = s;
    if (this.links.get(link.id) === link) this.h.onLink(link.id, s);
  }

  async _offer(link, gen, iceRestart = false) {
    try {
      if (!this._current(link, gen) || !link.pc) return;
      if (iceRestart) await this._refreshConfig(link, gen);
      if (!this._current(link, gen)) return;
      const offer = await link.pc.createOffer(iceRestart ? { iceRestart: true } : undefined);
      if (!this._current(link, gen)) return;
      await link.pc.setLocalDescription(offer);
      if (!this._current(link, gen)) return;
      const local = descJSON(link.pc.localDescription), p = this.seal ? await this.seal(link.id, local, null) : null;
      if (!this._current(link, gen)) return;
      const sent = this.signaling.send(link.id, { k: 'desc', d: local, ...(p ? { p } : {}) });
      this._arm(link, gen, sent !== false);
    } catch { if (this._current(link, gen)) this._status(link, 'failed'); }
  }

  // Offre partie (ou pas : signalisation coupée) : sans liaison ouverte au bout de NEGOTIATION_MS, on renégocie avec une connexion neuve. Une connexion dont
  // l'ICE travaille encore (« connecting ») a droit à un délai de plus. Une offre qui n'a pas pu partir ne coûte pas d'essai : la salle refait ses liaisons
  // non ouvertes quand sa signalisation revient.
  _arm(link, gen, sent) {
    clearTimeout(link.timer);
    link.timer = setTimeout(() => {
      link.timer = null;
      if (!this._current(link, gen) || link.status === 'open') return;
      if (!sent) { this._arm(link, gen, true); return; }          // (la prochaine fois, elle compte : on renégocie, ce qui renvoie une offre)
      if (++link.attempts >= MAX_NEGOTIATIONS) { this._status(link, 'failed'); return; }
      if (link.remoteSet && link.pc && link.pc.connectionState === 'connecting') { this._arm(link, gen, true); return; }
      this._enqueue(link, () => this._setup(link));
    }, NEGOTIATION_MS);
  }

  _onSignal(from, data) {
    if (!data || typeof data !== 'object' || typeof from !== 'string' || from === this.selfId) return;
    let link = this.links.get(from);
    // TECH-045 : un message d'un inconnu (identifiant inventé, joueur parti dont un candidat ICE arrive en retard) n'ouvre rien ; seul un membre présent le peut.
    // TECH-089 (f) : il est seulement gardé un instant (borné), au cas où sa présence arrive juste après.
    if (!link) { if (!this.isMember(from)) { this._hold(from, data); return; } link = this.addPeer(from); if (!link) return; }
    this._enqueue(link, () => this._handle(link, data));
  }

  async _handle(link, data) {
    if (this.links.get(link.id) !== link || !link.pc) return;
    if (data.k === 'desc' && data.d && typeof data.d === 'object') {
      const d = data.d, fp = fingerprintOf(d.sdp), gen = link.gen;
      // Seul le non-initiateur reçoit des offres ; seul l'initiateur reçoit des réponses. Une description qui ne vient pas de ce joueur est écartée (point 9).
      if ((d.type !== 'offer' && d.type !== 'answer') || (d.type === 'offer') === link.initiator) return;
      if (this.vet && !(await this.vet(link.id, d, data.p, d.type === 'answer' ? descJSON(link.pc.localDescription) : null))) return;
      if (!this._current(link, gen) || !link.pc) return;
      if (d.type === 'offer') {
        // Une offre d'une AUTRE connexion de l'initiateur (il a refait la sienne) : on repart d'une connexion neuve. Même empreinte : relance ICE, même connexion.
        const same = link.remoteSet && (fp && link.remoteFp ? fp === link.remoteFp : link.status === 'open');
        if (link.remoteSet && !same) await this._setup(link);
        try { await link.pc.setRemoteDescription(d); }
        catch (e) { if (!link.remoteSet) throw e; await this._setup(link); await link.pc.setRemoteDescription(d); }     // refusée par l'ancienne : connexion neuve
        link.remoteSet = true; link.remoteFp = fp;
        await this._flush(link);
        const answer = await link.pc.createAnswer();
        await link.pc.setLocalDescription(answer);
        const local = descJSON(link.pc.localDescription), p = this.seal ? await this.seal(link.id, local, d) : null;
        if (this.links.get(link.id) !== link || !link.pc) return;
        this.signaling.send(link.id, { k: 'desc', d: local, ...(p ? { p } : {}) });
      } else {
        if (link.pc.signalingState && link.pc.signalingState !== 'have-local-offer') return;      // réponse périmée (à une offre d'avant)
        await link.pc.setRemoteDescription(d);
        link.remoteSet = true; link.remoteFp = fp;
        await this._flush(link);
      }
    } else if (data.k === 'ice' && data.c && typeof data.c === 'object') {
      if (link.remoteSet) await this._addCandidate(link, data);
      else if (link.pending.length < MAX_PENDING) link.pending.push(data);       // (vérifié à l'application : la description distante donne l'empreinte à laquelle il se rattache)
    }
  }

  async _flush(link) {
    const q = link.pending.splice(0);
    for (const d of q) { try { await this._addCandidate(link, d); } catch { /* candidat périmé */ } }
  }

  // Un candidat reçu n'est appliqué que s'il vient de l'identité attendue, pour la connexion dont j'ai la description (point 9).
  async _addCandidate(link, data) {
    const gen = link.gen;
    if (this.vetIce && !(await this.vetIce(link.id, data.c, data.p, link.remoteFp))) return;
    if (link.gen !== gen || !link.pc) return;
    await link.pc.addIceCandidate(data.c);
  }

  // Un paquet d'état à tous (canal non fiable). Un lien dont la file d'envoi est pleine est sauté : mieux vaut perdre un
  // paquet que d'accumuler du retard.
  broadcastState(buf) {
    for (const l of this.links.values()) {
      const ch = l.state;
      if (!ch || ch.readyState !== 'open') continue;
      if (ch.bufferedAmount > MAX_BUFFERED) { this.stats.skipped++; continue; }
      try { ch.send(buf); this.stats.sent += buf.byteLength; } catch { /* canal en cours de fermeture */ }
    }
  }

  // Un message fiable : à un joueur (id) ou à tous. Renvoie les identifiants auxquels il est parti.
  sendCtl(msg, id = null) {
    const text = JSON.stringify(msg), sent = [];
    for (const l of this.links.values()) {
      if (id && l.id !== id) continue;
      if (l.ctl && l.ctl.readyState === 'open') { try { l.ctl.send(text); sent.push(l.id); } catch { /* fermeture en cours */ } }
    }
    return sent;
  }

  openIds() { return [...this.links.values()].filter((l) => l.status === 'open').map((l) => l.id); }
}
