// Paris du Télébyte (Phase 3, étape 5) : feuille « Paris » en bas d'écran, en direct seulement.
// Marché « vainqueur », pari mutuel : la cote d'un racer = cagnotte × (1 − part de la maison) ÷ mises sur ce racer.
// Le pari est posé sur le serveur (mp_fronde_bet, avec un identifiant : un renvoi n'est pas compté deux fois), puis la
// passerelle du jeu met la partie en accord (retire la mise des CG, ajoute les gains). Sans le jeu (Télébyte ouvert
// seul), on regarde la cagnotte et ses paris, mais on ne parie pas : les CG vivent dans la partie.
const ERR = {
  bets_closed: 'Les paris sont fermés : la course est partie.',
  not_enough_credits: 'Pas assez de CG d\'après ta dernière sauvegarde. Joue un instant (la partie se sauvegarde) puis réessaie.',
  no_save: 'Aucune sauvegarde de ta partie sur le serveur : connecte-toi dans le jeu, puis réessaie.',
  too_fast: 'Un instant…', not_signed_in: 'Connecte-toi dans le jeu pour parier.', bad_stake: 'Mise invalide.', bad_racer: 'Racer inconnu.',
};
const fmt = (n) => Math.round(n).toLocaleString('fr-CH');
const dur = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} j ${String(h).padStart(2, '0')} h` : h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`; };
const odds = (pools, id, house) => { const p = (pools.by_racer || {})[id] || 0; return p > 0 ? (pools.total * (100 - house) / 100) / p : null; };

export function mountBets({ feed, LIVE, GAME, rpc, racer }) {
  if (!LIVE) return null;
  const $ = (id) => document.getElementById(id);
  const btn = $('bets-btn'), sheet = $('bets'), body = $('bets-body');
  btn.hidden = false;
  let pick = null, msg = '', sending = false, synced = false;
  const open = (on) => { sheet.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) render(); };
  btn.onclick = () => open(sheet.hidden);
  $('bets-close').onclick = () => open(false);

  function render() {
    const snap = LIVE.snap, Ed = snap.edition, pools = snap.pools || { total: 0, by_racer: {} }, house = +Ed.house_pct, cap = +Ed.stake_cap;
    const now = LIVE.source.now(), openBets = snap.state === 'annoncee' && now < 0;
    const mine = (snap.my_bets || []).reduce((a, b) => a + b.stake, 0), left = Math.max(0, cap - mine);
    btn.textContent = openBets ? 'Paris · ouverts' : 'Paris';
    if (sheet.hidden) return;
    const winner = Ed.result && Ed.result.winner;
    let h = '';
    if (openBets) h += `<p class="bt-h">Qui gagnera ? Paris ouverts jusqu'au départ, dans <b>${dur(-now)}</b>.</p>`;
    else if (snap.state === 'reglee') h += `<p class="bt-h">Arrivée : <b>${racer[winner] ? racer[winner].name : winner}</b> gagne.</p>`;
    else h += `<p class="bt-h">Paris fermés au départ. Cotes finales :</p>`;
    h += `<ol class="bt-rows">` + Ed.racers.map((r) => {
      const o = odds(pools, r.id, house), share = pools.total ? ((pools.by_racer || {})[r.id] || 0) / pools.total : 0;
      return `<li data-id="${r.id}" class="${pick === r.id ? 'on' : ''}${winner === r.id ? ' win' : ''}" style="--livery:${r.livery}">
        <i></i><span class="nm">${r.name}</span><span class="bar"><u style="width:${(share * 100).toFixed(1)}%"></u></span>
        <span class="od" title="${o ? 'gain pour 1 CG misé' : 'aucune mise sur ce racer'}">${o ? '×' + o.toFixed(2).replace('.', ',') : '—'}</span></li>`;
    }).join('') + `</ol>`;
    h += `<p class="bt-pool">Cote = gain pour 1 CG misé si ce racer gagne (« — » : personne n'a encore misé). Cagnotte ${fmt(pools.total)} CG · ${pools.bettors || 0} parieur${(pools.bettors || 0) > 1 ? 's' : ''} · maison ${house} %</p>`;
    if (openBets) {
      if (!GAME) h += `<p class="bt-note">Ouvre le Télébyte depuis le jeu pour parier avec tes CG.</p>`;
      else {
        const cg = GAME.credits();
        h += `<div class="bt-form"><label>Mise <input id="bt-stake" type="number" inputmode="numeric" min="1" step="1" max="${Math.min(left, cg)}" value="${Math.min(500, left, cg) || ''}"></label>
          <span class="bt-chips">${[100, 500, 1000].map((v) => `<button type="button" data-v="${v}">${fmt(v)}</button>`).join('')}<button type="button" data-v="max">max</button></span>
          <button id="bt-go" type="button" ${!pick || sending || !left || !cg ? 'disabled' : ''}>${pick ? 'Parier sur ' + racer[pick].name : 'Choisis un racer'}</button></div>
          <p class="bt-sub">Solde ${fmt(cg)} CG · déjà misé ${fmt(mine)} / ${fmt(cap)} CG</p>`;
      }
    }
    if ((snap.my_bets || []).length) h += `<p class="bt-mine">Tes paris : ` + snap.my_bets.map((b) => `${fmt(b.stake)} CG sur ${racer[b.racer] ? racer[b.racer].name : b.racer}`).join(' · ') + `</p>`;
    const pay = snap.my_payout;
    if (pay) h += `<p class="bt-pay">${pay.kind === 'remboursement' ? 'Remboursé' : 'Gain'} : <b>${fmt(pay.amount)} CG</b> · ${GAME ? (synced || pay.claimed ? 'versé dans ta partie' : 'versement…') : 'à encaisser depuis le jeu'}</p>`;
    else if (snap.state === 'reglee' && (snap.my_bets || []).length) h += `<p class="bt-pay">Pas de gain cette fois.</p>`;
    if (snap.state === 'reglee' && Ed.seed) h += `<p class="bt-fair">Course vérifiable : graine <code>${Ed.seed.slice(0, 12)}…</code>, empreinte publiée avant les paris <code>${Ed.seed_hash.slice(0, 12)}…</code></p>`;
    if (msg) h += `<p class="bt-msg" role="status">${msg}</p>`;
    body.innerHTML = h;
    for (const li of body.querySelectorAll('.bt-rows li')) li.onclick = () => { if (!openBets) return; pick = li.dataset.id; msg = ''; render(); };
    for (const c of body.querySelectorAll('.bt-chips button')) c.onclick = () => { const i = $('bt-stake'); i.value = c.dataset.v === 'max' ? i.max : Math.min(+c.dataset.v, +i.max); };
    const go = $('bt-go'); if (go) go.onclick = place;
  }
  async function place() {
    const Ed = LIVE.snap.edition, i = $('bt-stake'), stake = Math.floor(+i.value);
    if (!pick || !(stake >= 1)) { msg = 'Choisis un racer et une mise.'; return render(); }
    if (stake > GAME.credits()) { msg = 'Tu n\'as pas autant de CG.'; return render(); }
    sending = true; msg = 'Pari en cours…'; render();
    const nonce = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
    try {
      await rpc('mp_fronde_bet', { p_edition: Ed.id, p_racer: pick, p_stake: stake, p_nonce: nonce });
      msg = `Pari enregistré : ${fmt(stake)} CG sur ${racer[pick].name}.`;
      try { await GAME.sync(); } catch (e) { console.warn('[fronde] partie', e); }   // la mise quitte les CG de la partie
      await feed.refresh();
    } catch (e) {
      const k = Object.keys(ERR).find((x) => (e.message || '').includes(x));
      msg = k ? ERR[k] : (e.message || '').includes('over_cap') ? `Plafond de ${fmt(Ed.stake_cap)} CG par édition atteint.` : 'Le serveur n\'a pas pris le pari (réseau ?). Réessaie : il ne sera pas compté deux fois.';
    }
    sending = false; render();
  }
  // arrivée : la passerelle encaisse et verse les gains dans la partie (une fois)
  feed.onSnap((snap) => {
    if (snap.state === 'reglee' && GAME && !synced) GAME.sync().then(() => { synced = true; render(); }).catch(() => {});
    render();
  });
  if (LIVE.snap.state === 'reglee' && GAME) GAME.sync().then(() => { synced = true; render(); }).catch(() => {});
  setInterval(() => { if (!sheet.hidden && LIVE.snap.state === 'annoncee' && !document.activeElement?.closest?.('#bets')) render(); }, 1000);
  render();
  return { open, render };
}
