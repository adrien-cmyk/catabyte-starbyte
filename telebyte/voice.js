// Voix des commentateurs (07/11/2026) : de vraies voix ElevenLabs à la place de la synthèse du téléphone.
// Chaque phrase n'est lue qu'une fois par ElevenLabs, par la fonction serveur fronde-voice (la clé reste sur Supabase) ;
// le fichier est gardé dans l'espace public « fronde-voix » de Supabase et resservi à tous les joueurs. Le nom du
// fichier est l'empreinte de la phrase (modèle, voix, texte) : le Télébyte peut le trouver directement, sans appel.
//   const vo = createVoice({ host, generate })   host : la page qui joue le son (celle du jeu quand le Télébyte est dans
//   un cadre) ; generate : seulement pour une vraie course en direct (la démo et la répétition n'usent pas le quota)
//   vo.prepare(who, text)  → lance la recherche ou la création du fichier (A : Arno, B : Mila)
//   vo.status(who, text)   → { state: 'ready' | 'pending' | 'none', url }
//   vo.play(url, onEnd)    → joue le fichier (onEnd à la fin, ou en cas d'échec) ; vo.stop()
//   vo.unlock()            → dans un geste : autorise le son (iPhone)
import { token, sbConfig } from '../sandbox/race/live.js';

// mêmes valeurs que la fonction serveur (server/fronde-voice/index.ts) : l'empreinte d'une phrase doit être identique
export const VOICES = { model: 'eleven_multilingual_v2', v: 1, A: 'RlynaiseqcfHE3bZpqe4', B: 'Fgf7ZfILlUOkErHkkl2Y' };
const BUCKET = 'fronde-voix';
const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
export async function voiceKey(who, text) {
  const s = `${VOICES.model}|${VOICES[who]}|v${VOICES.v}|${text}`;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}
// piste muette (autorise la lecture sur iPhone quand elle est lancée dans un geste)
const SILENT = (() => {
  const n = 800, b = new Uint8Array(44 + n), d = new DataView(b.buffer), w = (o, t) => { for (let i = 0; i < t.length; i++) b[o + i] = t.charCodeAt(i); };
  w(0, 'RIFF'); d.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); d.setUint32(16, 16, true); d.setUint16(20, 1, true); d.setUint16(22, 1, true);
  d.setUint32(24, 8000, true); d.setUint32(28, 8000, true); d.setUint16(32, 1, true); d.setUint16(34, 8, true); w(36, 'data'); d.setUint32(40, n, true);
  b.fill(128, 44); let bin = ''; for (const x of b) bin += String.fromCharCode(x); return 'data:audio/wav;base64,' + btoa(bin);
})();

export function createVoice({ host = window, generate = false } = {}) {   // generate : faire lire les phrases manquantes (vraie course en direct seulement)
  const known = new Map();                                        // 'who|texte' → { state, url, p }
  const tries = { gen: 0 };
  // l'élément audio : celui que la page du jeu a préparé dans le geste du drapeau (même origine), sinon le nôtre
  let own = null;
  const el = () => { try { if (host !== window && host.SBFronde && host.SBFronde.voiceAudio) return host.SBFronde.voiceAudio; } catch (e) {} return own || (own = new Audio()); };
  let unlocked = false;
  const vo = {
    get unlocked() { try { return unlocked || (host !== window && !!host.SBFronde.voiceReady); } catch (e) { return unlocked; } },
    unlock() {
      if (vo.unlocked) return;
      try { const a = el(); a.setAttribute('playsinline', ''); a.src = SILENT; const p = a.play(); unlocked = true; if (p && p.catch) p.catch(() => { unlocked = false; }); } catch (e) {}
    },
    status(who, text) { const k = known.get(who + '|' + text); return k ? { state: k.state, url: k.url } : { state: 'none' }; },
    prepare(who, text) {
      const id = who + '|' + text; if (known.has(id) || !VOICES[who] || !text) return;
      const k = { state: 'pending', url: null }; known.set(id, k);
      k.p = (async () => {
        const { url, key } = sbConfig(), h = await voiceKey(who, text);
        const pub = `${url}/storage/v1/object/public/${BUCKET}/${h}.mp3`;
        try { const r = await fetch(pub, { method: 'HEAD' }); if (r.ok) { k.state = 'ready'; k.url = pub; return; } } catch (e) {}
        // pas encore lue : la fonction serveur la fait lire (joueur connecté seulement ; plafonds côté serveur)
        const tok = token(); if (!generate || !tok || tries.gen > 400) { k.state = 'none'; return; }
        tries.gen++;
        try {
          const r = await fetch(`${url}/functions/v1/fronde-voice`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + tok }, body: JSON.stringify({ who, text }) });
          const j = await r.json().catch(() => null);
          if (r.ok && j && j.url) { k.state = 'ready'; k.url = j.url; } else k.state = 'none';
        } catch (e) { k.state = 'none'; }
      })();
    },
    play(src, onEnd) {
      const a = el(); let done = false; const end = () => { if (done) return; done = true; a.onended = a.onerror = null; onEnd && onEnd(); };
      try { a.onended = end; a.onerror = end; a.src = src; const p = a.play(); if (p && p.catch) p.catch(end); } catch (e) { end(); }
      return { started: () => !a.paused && a.currentTime > 0 };
    },
    stop() { try { const a = el(); a.pause(); a.onended = a.onerror = null; } catch (e) {} },
  };
  return vo;
}
