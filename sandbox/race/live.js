// live — accès du jeu au serveur de la Grande Fronde (Phase 3, étape 5) : lecture de l'édition (mp_fronde_edition),
// création de la suivante au besoin (fonction fronde-tick), paris (mp_fronde_bet), horloge du serveur, et source de
// plans pour ServerFeed. Mêmes appels que le reste du jeu (Blackmarket) : adresse et clé publiques de Supabase, jeton
// de la session du joueur (localStorage « starbyte_auth », même origine que le jeu).
// Configurable pour les essais : window.FRONDE_SB = { url, key } (serveur local), window.FRONDE_TOKEN (jeton).
import { ServerFeed } from './DemoFeed.js';

const DEFAULT = { url: 'https://elupnpdcblztpfywnhjl.supabase.co', key: 'sb_publishable_tXGrQIROzH2DwBrny1GcHQ_iKJKoBOQ' };
// réglages d'essai : cette page, sinon la page du jeu qui l'a ouverte (même origine)
const top_ = () => { try { return typeof window !== 'undefined' ? window.top : null; } catch (e) { return null; } };
const opt = (k) => (typeof window !== 'undefined' && window[k]) || (top_() && top_()[k]) || null;
const cfg = () => opt('FRONDE_SB') || DEFAULT;
export function token() {
  if (opt('FRONDE_TOKEN')) return opt('FRONDE_TOKEN');
  try { const a = JSON.parse(localStorage.getItem('starbyte_auth') || 'null'); return a && (a.access_token || (a.currentSession && a.currentSession.access_token)); } catch (e) { return null; }
}
async function post(path, body) {
  const tok = token(); if (!tok) throw new Error('not_signed_in');
  const { url, key } = cfg();
  const r = await fetch(url + path, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + tok }, body: JSON.stringify(body || {}) });
  let j = null; try { j = await r.json(); } catch (e) {}
  if (!r.ok) { const er = new Error((j && (j.message || j.error)) || ('http_' + r.status)); er.data = j; er.status = r.status; throw er; }
  return j;
}
export const rpc = (fn, args = {}) => post('/rest/v1/rpc/' + fn, args);
export const tick = () => post('/functions/v1/fronde-tick', {});

// source de plans pour ServerFeed : le dernier instantané du serveur (il ne contient que des plans déjà publiés)
export class LiveSource {
  constructor(snap) { this.set(snap); }
  set(snap) {
    this.snap = snap;
    const start = Date.parse(snap.edition.start_at);
    this.startMs = start; this.skew = Date.parse(snap.server_now) - Date.now();   // horloge du serveur
  }
  // instant de course (s) selon l'horloge du serveur
  now() { return (Date.now() + this.skew - this.startMs) / 1000; }
  reveals(t, have) { return this.snap.reveals.filter((x) => x.t <= t && !have[`${x.racer}|${x.sys}`]); }
}

// l'édition à suivre : celle qui court, sinon la prochaine (créée au besoin), sinon la dernière réglée ; null hors ligne
export async function loadEdition() {
  let snap = await rpc('mp_fronde_edition', {});
  if (!snap.edition && snap.next_needed) { try { await tick(); } catch (e) { console.warn('[fronde] création', e); } snap = await rpc('mp_fronde_edition', {}); }
  return snap.edition ? snap : null;
}

// flux en direct : ServerFeed sur les données de l'édition, rafraîchi périodiquement (et plus souvent quand un pilote
// est attendu à l'entrée d'un système, son plan étant alors publié)
export function liveFeed(snap) {
  const src = new LiveSource(snap), E = snap.edition;
  const feed = new ServerFeed({ source: src, systems: E.systems, racers: E.racers, pilot: { ...E.pilot, id: E.id, name: E.name } });
  feed.live = { source: src, snap, edition: E, listeners: [] };
  feed.onSnap = (f) => { feed.live.listeners.push(f); return feed; };
  feed.setSnap = (s) => { src.set(s); feed.live.snap = s; for (const f of feed.live.listeners) f(s); feed.sync(Math.min(src.now(), feed.edition.t1)); };
  let timer = 0;
  feed.refresh = async () => {
    clearTimeout(timer);
    try { feed.setSnap(await rpc('mp_fronde_edition', { p_id: E.id })); } catch (e) { console.warn('[fronde] lecture', e); }
    const now = src.now(), waiting = Object.values(feed.tracks).some((tr) => tr.cps.some((c) => c.provisional && c.t <= now));
    timer = setTimeout(feed.refresh, waiting ? 10e3 : 60e3);
  };
  timer = setTimeout(feed.refresh, 60e3);
  return feed;
}
