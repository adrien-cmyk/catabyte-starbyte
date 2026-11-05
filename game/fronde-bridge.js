/* ═══════════════════════════════════════════════════════════════════════
   STARBYTE — passerelle Grande Fronde (jeu ↔ Télébyte ↔ serveur), Phase 3 étape 5
   Seule pièce de la Grande Fronde dans le jeu : le Télébyte et la vue de course vivent à part
   (/fronde/), dans un cadre en superposition. Cette passerelle :
     · ouvre / ferme le Télébyte (SBFronde.open / close) ;
     · donne les CG disponibles au Télébyte (SBFronde.credits) ;
     · met la partie en accord avec le serveur (SBFronde.sync) : chaque pari enregistré par le serveur
       est retiré des CG UNE fois ; chaque gain ou remboursement est encaissé (mp_fronde_claim) et
       ajouté UNE fois. Le serveur fait foi ; la partie garde la trace de ce qu'elle a appliqué
       (G.fronde.applied / G.fronde.paid, sauvegardés avec la partie). Si la page se ferme au mauvais
       moment, la synchronisation suivante rattrape : ni pari gratuit, ni gain perdu.
   Intégration (index.html) : <script src="assets/fronde-bridge.js"></script> AVANT le chargement de
   la partie, ajouter 'fronde' à EXTRA_SAVE_KEYS (ou laisser ce fichier l'ajouter), et un bouton qui
   appelle SBFronde.open().
   Dépend des globals du jeu : G, saveGame. Supabase : mêmes adresse, clé et session que le Blackmarket.
   ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const SB = 'https://elupnpdcblztpfywnhjl.supabase.co';
  const KEY = 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ';
  const PAGE = 'fronde/telebyte/index.html?feed=live';
  const cfg = () => window.FRONDE_SB || { url: SB, key: KEY };
  if (window.EXTRA_SAVE_KEYS && EXTRA_SAVE_KEYS.indexOf('fronde') < 0) EXTRA_SAVE_KEYS.push('fronde');

  function token() {
    if (window.FRONDE_TOKEN) return window.FRONDE_TOKEN;
    try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) { return null; }
  }
  async function rpc(fn, args) {
    if (window.FRONDE_FAKE) return window.FRONDE_FAKE.post('/rest/v1/rpc/' + fn, args || {});   // répétition hors ligne
    const tok = token(); if (!tok) throw new Error('not_signed_in');
    const c = cfg();
    const r = await fetch(c.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + tok }, body: JSON.stringify(args || {}) });
    let j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && (j.message || j.error)) || ('http_' + r.status));
    return j;
  }
  const state = () => (G.fronde = G.fronde || { applied: {}, paid: {} });

  // mise en accord de la partie avec le serveur (idempotente ; un seul appel à la fois)
  let busy = null;
  function sync() {
    if (busy) return busy;
    busy = (async () => {
      if ((!token() && !window.FRONDE_FAKE) || typeof G === 'undefined') return { credits: credits(), delta: 0, offline: true };
      const mine = await rpc('mp_fronde_mine');
      const F = state(); let delta = 0;
      for (const b of mine.bets || []) {
        if (F.applied[b.id] != null) continue;
        F.applied[b.id] = b.stake; G.credits = Math.max(0, (G.credits || 0) - b.stake); delta -= b.stake;
      }
      for (const p of mine.payouts || []) {
        if (!p.claimed) { try { const c = await rpc('mp_fronde_claim', { p_edition: p.edition }); if (c && (c.claimed_now || c.already)) p.claimed = true; } catch (e) { continue; } }
        if (p.claimed && F.paid[p.edition] == null) { F.paid[p.edition] = p.amount; G.credits = (G.credits || 0) + p.amount; delta += p.amount; }
      }
      if (delta !== 0) {
        try { saveGame(); } catch (e) { console.warn('[fronde] sauvegarde', e); }
        try { if (typeof renderCommerceScreen === 'function' && document.getElementById('commerce-credits-value')) renderCommerceScreen(); } catch (e) {}
      }
      return { credits: credits(), delta };
    })().finally(() => { busy = null; });
    return busy;
  }
  const credits = () => Math.floor((typeof G !== 'undefined' && G.credits) || 0);

  // Télébyte en superposition, plein écran ; fermé : on resynchronise
  let overlay = null;
  function open() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000';
    overlay.innerHTML = '<iframe title="Télébyte — La Grande Fronde" allow="fullscreen" style="position:absolute;inset:0;width:100%;height:100%;border:0"></iframe>' +
      '<button type="button" aria-label="Fermer le Télébyte" style="position:absolute;top:calc(env(safe-area-inset-top,0px) + 8px);right:10px;z-index:2;width:38px;height:38px;border-radius:50%;border:1px solid rgba(160,210,255,.35);background:rgba(4,8,14,.75);color:#dfefff;font-size:20px;line-height:1">×</button>';
    overlay.querySelector('iframe').src = window.FRONDE_PAGE || PAGE;
    overlay.querySelector('button').onclick = close;
    document.body.appendChild(overlay);
  }
  function close() { if (!overlay) return; overlay.remove(); overlay = null; sync().catch(() => {}); }

  window.SBFronde = { credits, sync, open, close };
  // au lancement (après la connexion) puis toutes les 10 minutes : gains versés, paris appliqués
  setTimeout(() => sync().catch(() => {}), 8000);
  setInterval(() => sync().catch(() => {}), 10 * 60e3);
})();
