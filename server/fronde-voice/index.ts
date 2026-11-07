// STARBYTE — fonction serveur « fronde-voice » (Grande Fronde, 07/11/2026) : les vraies voix des commentateurs.
// Le Télébyte écrit les phrases ; cette fonction les fait lire UNE fois par ElevenLabs (clé secrète ELEVENLABS_API_KEY,
// jamais envoyée au jeu), garde le fichier mp3 dans l'espace public « fronde-voix » et le ressert à tous les joueurs.
// Le nom du fichier est l'empreinte sha-256 de « modèle|voix|version de la voix|texte » : le Télébyte le trouve directement s'il existe.
//   POST { who: 'A' | 'B', text }  → { url, cached }        (joueur connecté ; A : Arno, B : Mila)
//   POST { action: 'selftest' }     → la clé et les deux voix répondent-elles ? (sans dépenser de caractères ; bouton
//                                     « Test » du tableau de bord, sans session de joueur)
//   POST { action: 'selftest', essai: true } → en plus, un court extrait par voix (≈ 150 caractères), à écouter : liens
//                                     dans la réponse (pour régler le ton avant de publier)
// Garde-fous (la facture ne peut pas déraper) : 400 caractères par phrase, plafond mensuel global de caractères lus
// (FRONDE_VOICE_MONTH_CAP, 90 000 par défaut) et plafond par joueur et par jour (FRONDE_VOICE_USER_DAY_CAP, 6 000) ;
// au-delà, le Télébyte garde les sous-titres. Les phrases déjà lues ne coûtent plus rien.
// Prérequis : schema_mp_v45_fronde_voix.sql exécuté ; secret ELEVENLABS_API_KEY posé.

import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// mêmes valeurs que le Télébyte (telebyte/voice.js : VOICES) — l'empreinte d'une phrase doit être identique
const MODEL = 'eleven_multilingual_v2';
// version des réglages, par voix (elle entre dans l'empreinte : changer un réglage fait relire seulement cette voix)
// A v2 (07/11) : plus d'élan, débit plus rapide ; B v3 (07/11) : Mila plus rapide et plus enthousiaste
const VV: Record<string, number> = { A: 2, B: 3 }, V = 3;
const VOICE: Record<string, string> = { A: 'RlynaiseqcfHE3bZpqe4', B: 'Fgf7ZfILlUOkErHkkl2Y' };
// réglages d'expression : peu de stabilité et beaucoup de style = de l'élan, de l'excitation (commentateurs de stade) ;
// débit accéléré (speed : 0,7 à 1,2, Mila au maximum)
const SETTINGS: Record<string, unknown> = {
  A: { stability: 0.22, similarity_boost: 0.75, style: 0.85, use_speaker_boost: true, speed: 1.15 },
  B: { stability: 0.2, similarity_boost: 0.75, style: 0.9, use_speaker_boost: true, speed: 1.2 },
};
const BUCKET = 'fronde-voix';
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
const sha256 = async (s: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const KEY = Deno.env.get('ELEVENLABS_API_KEY') || '';
  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corps vide */ }

  // autotest : la clé et les deux voix existent (lecture de leur fiche, aucun caractère dépensé)
  if (body?.action === 'selftest') {
    if (!KEY) return json({ ok: false, error: 'ELEVENLABS_API_KEY absente des secrets' });
    const out: Record<string, unknown> = {};
    for (const [who, id] of Object.entries(VOICE)) {
      const r = await fetch(`https://api.elevenlabs.io/v1/voices/${id}`, { headers: { 'xi-api-key': KEY } });
      const j = await r.json().catch(() => null);
      out[who === 'A' ? 'arno' : 'mila'] = r.ok ? { ok: true, name: j?.name } : { ok: false, status: r.status, detail: j?.detail?.message || j?.detail || null };
    }
    const okAll = Object.values(out).every((x: any) => x.ok);
    if (okAll && body?.essai) {
      const admin = createClient(url, service, { auth: { persistSession: false } });
      const SAMPLE: Record<string, string> = { A: 'Et c\'est parti pour la Grande Fronde ! Ohhh ! Le Fulgurant plonge au ras de la géante ! Incroyable !', B: 'Il a du courage. Ou pas de rétroviseur.' };
      for (const [w, text] of Object.entries(SAMPLE)) {
        const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[w]}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' }, body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS[w] }) });
        const key = w === 'A' ? 'arno' : 'mila';
        if (!r.ok) { (out[key] as any).essai = { ok: false, status: r.status, detail: (await r.text().catch(() => '')).slice(0, 200) }; continue; }
        const path = `essai-v${VV[w]}-${w}.mp3`;
        await admin.storage.from(BUCKET).upload(path, new Uint8Array(await r.arrayBuffer()), { contentType: 'audio/mpeg', upsert: true, cacheControl: '60' });
        (out[key] as any).essai = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
    }
    return json({ ok: okAll, model: MODEL, version: V, versions: VV, voices: out });
  }

  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'not_signed_in' }, 401);

  const sp = String(body?.who || ''), text = String(body?.text || '').trim();
  if (!VOICE[sp]) return json({ error: 'bad_voice' }, 400);
  if (!text || text.length > 400) return json({ error: 'bad_text' }, 400);
  const hash = await sha256(`${MODEL}|${VOICE[sp]}|v${VV[sp]}|${text}`), path = `${hash}.mp3`;
  const pub = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  // déjà lue : rien à payer
  const { data: have } = await admin.from('fronde_voice_lines').select('hash').eq('hash', hash).maybeSingle();
  if (have) return json({ url: pub, cached: true });
  if (!KEY) return json({ error: 'no_key' }, 503);

  // plafonds : ce mois-ci (tous joueurs) et aujourd'hui (ce joueur)
  const monthCap = +(Deno.env.get('FRONDE_VOICE_MONTH_CAP') || 90000), dayCap = +(Deno.env.get('FRONDE_VOICE_USER_DAY_CAP') || 6000);
  const now = new Date(), m0 = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(), d0 = new Date(now.getTime() - 86400e3).toISOString();
  const { data: used } = await admin.rpc('fronde_voice_usage', { p_user: who.user.id, p_month: m0, p_day: d0 });
  const u = (used && used[0]) || { month_chars: 0, user_chars: 0 };
  if (+u.month_chars + text.length > monthCap) return json({ error: 'quota_month' }, 429);
  if (+u.user_chars + text.length > dayCap) return json({ error: 'quota_user' }, 429);

  // lecture par ElevenLabs
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE[sp]}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS[sp] }),
  });
  if (!r.ok) { const d = await r.text().catch(() => ''); console.warn('[fronde-voice] ElevenLabs', r.status, d.slice(0, 300)); return json({ error: 'tts', status: r.status }, 502); }
  const audio = new Uint8Array(await r.arrayBuffer());
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mpeg', upsert: true, cacheControl: '31536000' });
  if (upErr) return json({ error: 'storage', detail: upErr.message }, 500);
  await admin.from('fronde_voice_lines').upsert({ hash, who: sp, chars: text.length, text, created_by: who.user.id }, { onConflict: 'hash', ignoreDuplicates: true });
  return json({ url: pub, cached: false });
});
