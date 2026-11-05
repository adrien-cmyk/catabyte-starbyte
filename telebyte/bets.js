// Paris du Télébyte (Phase 3) : feuille en bas d'écran, en direct seulement, en quatre onglets.
//   Paris      — marché « vainqueur », pari mutuel (cote = cagnotte × (1 − maison) ÷ mises sur ce racer), fenêtre de
//                3 jours avant le départ, pari anonyme au choix ; gain possible avant de valider et pour chaque pari.
//   Fil        — les derniers paris de tous (nom du commandant, ou « un commandant » s'il a parié anonymement).
//   Tribune    — la discussion des commandants pour cette édition.
//   Classement — meilleurs gains de l'édition (après l'arrivée) et de la saison.
// Le pari est posé sur le serveur (mp_fronde_bet, avec un identifiant : un renvoi n'est pas compté deux fois), puis la
// passerelle du jeu met la partie en accord (retire la mise des CG, ajoute les gains). Sans le jeu, on regarde, on lit
// la tribune, mais on ne parie pas : les CG vivent dans la partie.
const ERR = {
  bets_closed: 'Les paris sont fermés : la course est partie.', bets_not_open: 'Les paris ne sont pas encore ouverts.',
  not_enough_credits: 'Pas assez de CG d\'après ta dernière sauvegarde. Joue un instant (la partie se sauvegarde) puis réessaie.',
  no_save: 'Aucune sauvegarde de ta partie sur le serveur : connecte-toi dans le jeu, puis réessaie.',
  too_fast: 'Un instant…', too_many: 'Beaucoup de messages : pause d\'un moment.', not_signed_in: 'Connecte-toi dans le jeu.',
  bad_stake: 'Mise invalide.', bad_racer: 'Racer inconnu.', no_world: 'Il faut un commandant (une partie) pour écrire dans la tribune.', empty: 'Message vide.',
};
const fmt = (n) => Math.round(n).toLocaleString('fr-CH');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const dur = (s) => { s = Math.max(0, s); const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d} j ${String(h).padStart(2, '0')} h` : h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`; };
const ago = (iso) => { const s = (Date.now() - Date.parse(iso)) / 1000; return s < 60 ? 'à l\'instant' : s < 3600 ? `il y a ${Math.floor(s / 60)} min` : s < 86400 ? `il y a ${Math.floor(s / 3600)} h` : `il y a ${Math.floor(s / 86400)} j`; };
// gain si ce racer gagne, mise comprise dans la cagnotte (la cote bouge jusqu'au départ)
const potential = (pools, id, house, stake, extra = 0) => { const tot = pools.total + extra, p = ((pools.by_racer || {})[id] || 0) + extra; return p > 0 ? Math.floor(tot * (100 - house) / 100 * stake / p) : 0; };
const odds = (pools, id, house) => { const p = (pools.by_racer || {})[id] || 0; return p > 0 ? (pools.total * (100 - house) / 100) / p : null; };
const errMsg = (e, fallback) => { const k = Object.keys(ERR).find((x) => (e.message || '').includes(x)); return k ? ERR[k] : fallback; };

export function mountBets({ feed, LIVE, GAME, rpc, tick, racer }) {
  if (!LIVE) return null;
  const $ = (id) => document.getElementById(id);
  const btn = $('bets-btn'), sheet = $('bets'), body = $('bets-body');
  btn.hidden = false;
  let tab = 'paris', pick = null, stakeV = null, anon = false, msg = '', sending = false, synced = false, lastState = null;
  let feedRows = null, chatRows = null, rank = null, chatDraft = '', poll = 0;
  const edId = () => LIVE.snap.edition.id;
  const open = (on) => { sheet.hidden = !on; btn.setAttribute('aria-expanded', String(on)); if (on) { render(); load(); } else clearTimeout(poll); };
  btn.onclick = () => open(sheet.hidden);
  $('bets-close').onclick = () => open(false);

  // chargement de l'onglet ouvert (fil, tribune : rafraîchis tant que la feuille est ouverte)
  async function load() {
    clearTimeout(poll);
    if (sheet.hidden) return;
    const fast = (LIVE.snap.rate || 1) > 1;
    try {
      if (tab === 'fil') { feedRows = await rpc('mp_fronde_feed', { p_edition: edId() }); if (!typing()) render(); poll = setTimeout(load, 10e3); }
      else if (tab === 'tribune') { chatRows = await rpc('mp_fronde_chat', { p_edition: edId() }); if (!typing()) render(); poll = setTimeout(load, fast ? 4e3 : 7e3); }
      else if (tab === 'classement') { rank = await rpc('mp_fronde_ranking', { p_edition: edId() }); render(); }
    } catch (e) { console.warn('[fronde]', tab, e); poll = setTimeout(load, 15e3); }
  }

  // texte du bouton et compte à rebours : mis à jour chaque seconde sans tout redessiner
  function phase() {
    const snap = LIVE.snap, now = LIVE.source.now();
    const opensIn = (Date.parse(snap.edition.opens_at || snap.edition.start_at) - Date.now() - (LIVE.source.skew || 0)) / 1000;
    const before = snap.state === 'annoncee' && now < 0;
    return { snap, now, before, openBets: before && opensIn <= 0, opensIn };
  }
  function btnText() {
    const { snap, now, before, openBets, opensIn } = phase();
    const mm = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`;
    btn.textContent = openBets ? (-now < 3600 ? `Paris · ${mm(-now)}` : 'Paris · ouverts') : before ? 'Paris · bientôt' : snap.state === 'reglee' && snap.my_payout ? 'Paris · résultat' : 'Paris';
    const cd = $('bt-cd'); if (cd) cd.textContent = dur(openBets ? -now : opensIn);
    return snap.state + openBets + before;
  }
  const typing = () => document.activeElement && (document.activeElement.id === 'bt-stake' || document.activeElement.id === 'bt-chat');

  function render() {
    if (lastState && btnText() !== lastState) msg = '';             // changement d'état (ouverture, départ, arrivée)
    lastState = btnText();
    if (sheet.hidden) return;
    const tabs = [['paris', 'Paris'], ['fil', 'Fil'], ['tribune', 'Tribune'], ['classement', 'Classement']];
    let h = `<nav class="bt-tabs" role="tablist">` + tabs.map(([k, l]) => `<button type="button" role="tab" data-t="${k}" aria-selected="${tab === k}">${l}</button>`).join('') + `</nav>`;
    h += tab === 'paris' ? paris() : tab === 'fil' ? fil() : tab === 'tribune' ? tribune() : classement();
    if (msg) h += `<p class="bt-msg" role="status">${msg}</p>`;
    body.innerHTML = h;
    for (const b of body.querySelectorAll('.bt-tabs button')) b.onclick = () => { tab = b.dataset.t; msg = ''; render(); load(); };
    wire();
  }

  function paris() {
    const { snap, now, before, openBets, opensIn } = phase(), Ed = snap.edition, pools = snap.pools || { total: 0, by_racer: {} };
    const house = +Ed.house_pct, cap = +Ed.stake_cap, winner = Ed.result && Ed.result.winner;
    const mine = (snap.my_bets || []).reduce((a, b) => a + b.stake, 0), left = Math.max(0, cap - mine);
    let h = '';
    if (Ed.test) h += `<p class="bt-test">Course d'essai — visible par toi seul, en CG fictifs (10 000) : ta vraie partie n'est pas touchée.</p>`;
    if (openBets) h += `<p class="bt-h">Qui gagnera ? Paris ouverts jusqu'au départ, dans <b id="bt-cd">${dur(-now)}</b>.</p>`;
    else if (before) h += `<p class="bt-h">Les paris ouvrent 3 jours avant le départ, dans <b id="bt-cd">${dur(opensIn)}</b>.</p>`;
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
      // budget : CG de la partie ; en course d'essai, 10 000 CG fictifs moins les mises déjà posées
      const cg = Ed.test ? Math.max(0, 10000 - mine) : GAME ? GAME.credits() : 0;
      if (!Ed.test && !GAME) h += `<p class="bt-note">Ouvre le Télébyte depuis le jeu pour parier avec tes CG.</p>`;
      else if (cg < 1) h += `<p class="bt-note">Ta partie a 0 CG : il en faut pour parier (Comptoir, commerce entre commandants…).</p>`;
      else if (!left) h += `<p class="bt-note">Tu as atteint le plafond de ${fmt(cap)} CG pour cette course.</p>`;
      else {
        h += `<div class="bt-form"><label>Mise <input id="bt-stake" type="number" inputmode="numeric" min="1" step="1" max="${Math.min(left, cg)}" value="${stakeV != null ? stakeV : Math.min(500, left, cg) || ''}"></label>
          <span class="bt-chips">${[100, 500, 1000].map((v) => `<button type="button" data-v="${v}">${fmt(v)}</button>`).join('')}<button type="button" data-v="max">max</button></span>
          <label class="bt-anon"><input id="bt-anon" type="checkbox" ${anon ? 'checked' : ''}><span>Parier anonymement<small>Dans le fil et le classement, tu apparais comme « un commandant ».</small></span></label>
          <button id="bt-go" type="button" ${!pick || sending || !left || !cg ? 'disabled' : ''}>${pick ? 'Parier sur ' + racer[pick].name : 'Choisis un racer'}</button></div>
          <p class="bt-gain" id="bt-gain"></p>
          <p class="bt-sub">Solde ${fmt(cg)} CG${Ed.test ? ' fictifs' : ''} · déjà misé ${fmt(mine)} / ${fmt(cap)} CG</p>`;
      }
    }
    if ((snap.my_bets || []).length) {
      const by = {}; for (const b of snap.my_bets) by[b.racer] = (by[b.racer] || 0) + b.stake;
      h += `<ul class="bt-mine"><li class="t">Tes paris</li>` + Object.entries(by).map(([id, st]) => {
        const nm = racer[id] ? racer[id].name : id, g = potential(pools, id, house, st);
        const tail = snap.state === 'reglee' ? (id === winner ? ' · gagnant' : ' · perdu') : g ? ` · ≈ ${fmt(g)} CG s'il gagne` : '';
        return `<li style="--livery:${racer[id] ? racer[id].livery : '#9fd4ec'}"><i></i>${fmt(st)} CG sur ${nm}${tail}</li>`;
      }).join('') + `</ul>`;
    }
    const pay = snap.my_payout;
    if (pay) h += `<p class="bt-pay">${pay.kind === 'remboursement' ? 'Remboursé' : 'Gain'} : <b>${fmt(pay.amount)} CG</b> · ${Ed.test ? 'fictifs (course d\'essai)' : GAME ? (synced || pay.claimed ? 'versé dans ta partie' : 'versement…') : 'à encaisser depuis le jeu'}</p>`;
    else if (snap.state === 'reglee' && (snap.my_bets || []).length) h += `<p class="bt-pay">Pas de gain cette fois.</p>`;
    if (snap.state === 'reglee' && Ed.seed) h += `<p class="bt-fair">Course vérifiable : graine <code>${Ed.seed.slice(0, 12)}…</code>, empreinte publiée avant les paris <code>${Ed.seed_hash.slice(0, 12)}…</code></p>`;
    if (snap.is_admin && tick) h += `<p class="bt-admin"><button id="bt-test" type="button">Lancer une course d'essai (30 min, visible par toi seul)</button></p>`;
    return h;
  }
  function fil() {
    if (!feedRows) return `<p class="bt-sub">Chargement du fil…</p>`;
    if (!feedRows.length) return `<p class="bt-h">Aucun pari pour l'instant. Le premier donnera le ton.</p>`;
    return `<ul class="bt-feed">` + feedRows.map((x) => { const r = racer[x.racer]; return `<li style="--livery:${r ? r.livery : '#9fd4ec'}"><i></i><span><b>${x.mine ? 'Toi' : x.who ? esc(x.who) : 'Un commandant'}</b> a misé <b>${fmt(x.stake)} CG</b> sur ${r ? r.name : esc(x.racer)}</span><small>${ago(x.at)}</small></li>`; }).join('') + `</ul>`;
  }
  function tribune() {
    let h = `<div class="bt-chat" id="bt-chatlog">`;
    if (!chatRows) h += `<p class="bt-sub">Chargement de la tribune…</p>`;
    else if (!chatRows.length) h += `<p class="bt-h">La tribune est calme. Pronostics, chambrages, analyses de trajectoires : à toi.</p>`;
    else h += chatRows.map((c) => `<p class="${c.mine ? 'me' : ''}"><b>${esc(c.pseudo)}</b> <small>${ago(c.at)}</small><br>${esc(c.body)}</p>`).join('');
    h += `</div><div class="bt-say"><input id="bt-chat" type="text" maxlength="280" placeholder="Écrire aux commandants…" value="${esc(chatDraft)}" enterkeyhint="send"><button id="bt-send" type="button">Envoyer</button></div>`;
    return h;
  }
  function classement() {
    const { snap } = phase();
    if (!rank) return `<p class="bt-sub">Chargement du classement…</p>`;
    const row = (x, v) => `<li class="${x.mine ? 'me' : ''}"><span>${x.mine ? 'Toi' : x.who ? esc(x.who) : 'Un commandant'}</span><b class="${v >= 0 ? 'up' : 'down'}">${v >= 0 ? '+' : ''}${fmt(v)} CG</b></li>`;
    let h = `<p class="bt-h">Cette édition</p>`;
    h += snap.state !== 'reglee' ? `<p class="bt-sub">Le classement de l'édition paraît à l'arrivée.</p>` : rank.edition.length ? `<ol class="bt-rank">` + rank.edition.map((x) => row(x, x.net)).join('') + `</ol>` : `<p class="bt-sub">Personne n'a misé sur le vainqueur.</p>`;
    h += `<p class="bt-h">La saison <small>(6 dernières courses)</small></p>`;
    h += rank.season.length ? `<ol class="bt-rank">` + rank.season.map((x) => row(x, x.net)).join('') + `</ol>` : `<p class="bt-sub">La saison commence avec la première arrivée.</p>`;
    return h;
  }

  function wire() {
    for (const li of body.querySelectorAll('.bt-rows li')) li.onclick = () => { if (!phase().openBets) return; pick = li.dataset.id; msg = ''; render(); };
    const { snap } = phase(), pools = snap.pools || { total: 0 }, house = +snap.edition.house_pct;
    const gainLine = () => { const i = $('bt-stake'), g = $('bt-gain'); if (!i || !g) return; const v = Math.floor(+i.value); g.textContent = pick && v >= 1 ? `Si ${racer[pick].name} gagne : ≈ ${fmt(potential(pools, pick, house, v, v))} CG (cote actuelle ; elle bouge jusqu'au départ)` : ''; };
    for (const c of body.querySelectorAll('.bt-chips button')) c.onclick = () => { const i = $('bt-stake'); i.value = c.dataset.v === 'max' ? i.max : Math.min(+c.dataset.v, +i.max); stakeV = i.value; gainLine(); };
    if ($('bt-stake')) $('bt-stake').oninput = () => { stakeV = $('bt-stake').value; gainLine(); };
    if ($('bt-anon')) $('bt-anon').onchange = () => { anon = $('bt-anon').checked; };
    gainLine();
    const go = $('bt-go'); if (go) go.onclick = place;
    const test = $('bt-test'); if (test) test.onclick = startTest;
    const log = $('bt-chatlog'); if (log) log.scrollTop = log.scrollHeight;
    const ci = $('bt-chat');
    if (ci) { ci.oninput = () => { chatDraft = ci.value; }; ci.onkeydown = (e) => { if (e.key === 'Enter') say(); }; $('bt-send').onclick = say; }
  }
  async function place() {
    const Ed = LIVE.snap.edition, i = $('bt-stake'), stake = Math.floor(+i.value); stakeV = null;
    if (!pick || !(stake >= 1)) { msg = 'Choisis un racer et une mise.'; return render(); }
    const budget = Ed.test ? 10000 - (LIVE.snap.my_bets || []).reduce((a, b) => a + b.stake, 0) : GAME ? GAME.credits() : 0;
    if (stake > budget) { msg = 'Tu n\'as pas autant de CG.'; return render(); }
    sending = true; msg = 'Pari en cours…'; render();
    const nonce = crypto.randomUUID ? crypto.randomUUID() : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
    try {
      await rpc('mp_fronde_bet', { p_edition: Ed.id, p_racer: pick, p_stake: stake, p_nonce: nonce, p_anonymous: anon });
      msg = `Pari enregistré : ${fmt(stake)} CG sur ${racer[pick].name}${anon ? ' (anonyme)' : ''}.`;
      if (!Ed.test && GAME) { try { await GAME.sync(); } catch (e) { console.warn('[fronde] partie', e); } }   // la mise quitte les CG de la partie (pas en essai)
      await feed.refresh();
    } catch (e) {
      msg = (e.message || '').includes('over_cap') ? `Plafond de ${fmt(Ed.stake_cap)} CG par édition atteint.` : errMsg(e, 'Le serveur n\'a pas pris le pari (réseau ?). Réessaie : il ne sera pas compté deux fois.');
    }
    sending = false; render();
  }
  async function say() {
    const ci = $('bt-chat'), txt = (ci.value || '').trim(); if (!txt) return;
    try { await rpc('mp_fronde_chat_post', { p_edition: edId(), p_body: txt }); chatDraft = ''; msg = ''; chatRows = await rpc('mp_fronde_chat', { p_edition: edId() }); }
    catch (e) { msg = errMsg(e, 'Message non envoyé (réseau ?).'); }
    render(); const c2 = $('bt-chat'); if (c2) c2.focus();
  }
  async function startTest() {
    msg = 'Création de la course d\'essai…'; render();
    try { await tick({ action: 'test' }); location.reload(); }
    catch (e) { msg = (e.message || '').includes('not_admin') ? 'Réservé à l\'administrateur.' : 'Course d\'essai non créée : ' + (e.message || 'erreur'); render(); }
  }
  // arrivée : la passerelle encaisse et verse les gains dans la partie (une fois) ; on montre le résultat
  let shownResult = false;
  feed.onSnap((snap) => {
    if (snap.state === 'reglee' && !shownResult && (snap.my_bets || []).length) { shownResult = true; tab = 'paris'; open(true); }
    if (snap.state === 'reglee' && GAME && !synced) GAME.sync().then(() => { synced = true; render(); }).catch(() => {});
    if (!typing() && tab === 'paris') render(); else btnText();
  });
  if (LIVE.snap.state === 'reglee' && GAME) GAME.sync().then(() => { synced = true; render(); }).catch(() => {});
  setInterval(() => { if (btnText() !== lastState && !typing()) render(); }, 1000);   // redessin complet seulement au changement d'état
  render();
  return { open, render };
}
