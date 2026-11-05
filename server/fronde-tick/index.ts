// STARBYTE — fonction serveur « fronde-tick » (Grande Fronde, Phase 3)
// Crée l'édition suivante quand il n'y en a plus à venir : appelée par le jeu quand mp_fronde_edition répond
// next_needed = true. N'importe quel appel d'un joueur connecté suffit ; personne ne choisit la graine ni le résultat.
// Tout le reste (plans publiés au fil de la course, règlement des paris) se fait en SQL (schema_mp_v41_grande_fronde.sql).
//   POST {}                    → { created: id | null, edition: id }
//   POST { action: 'selftest' } → le moteur de cette fonction calcule-t-il les mêmes courses que le jeu ? (5 graines)
// Fichiers à déployer ensemble : index.ts, edition.ts, engine.ts (copies générées par tools/fronde/sync_engine.mjs).

import { createClient } from 'npm:@supabase/supabase-js@2';
import { prepareEdition, sha256 } from './edition.ts';
import { runRace, digest, RACE_SYSTEMS, RACERS, PILOT, ENGINE_HASH, ENGINE_REF } from './engine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // seuls les joueurs connectés (même anonymes) peuvent déclencher la création
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'not_signed_in' }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: who, error: authErr } = await admin.auth.getUser(jwt);
  if (authErr || !who?.user) return json({ error: 'not_signed_in' }, 401);

  let body: any = {};
  try { body = await req.json(); } catch (_) { /* corps vide */ }

  if (body?.action === 'selftest') {
    const t0 = performance.now(), results: Record<string, boolean> = {};
    for (const [seed, want] of Object.entries(ENGINE_REF as Record<string, string>)) {
      const got = (await sha256(digest(runRace({ systems: RACE_SYSTEMS, racers: RACERS, pilot: { ...PILOT, seed } })))).slice(0, 16);
      results[seed] = got === want;
    }
    return json({ ok: Object.values(results).every(Boolean), engine: ENGINE_HASH, results, ms: Math.round(performance.now() - t0) });
  }

  // une édition est-elle déjà annoncée (ou en cours) ? alors rien à faire
  const { data: open, error: e0 } = await admin.from('fronde_editions').select('id').eq('status', 'annoncee').limit(1);
  if (e0) return json({ error: e0.message }, 500);
  if (open && open.length) return json({ created: null, edition: open[0].id });

  let prep;
  try { prep = await prepareEdition(Date.now()); } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
  const { edition, secrets } = prep;
  // deux joueurs en même temps : la clé primaire (mois) départage ; le second retrouve l'édition du premier
  const { error: e1 } = await admin.from('fronde_editions').insert(edition);
  if (e1) {
    if ((e1 as any).code === '23505') return json({ created: null, edition: edition.id });
    return json({ error: e1.message }, 500);
  }
  const { error: e2 } = await admin.from('fronde_secrets').insert(secrets);
  if (e2) {                                                     // pas d'édition sans ses secrets : on la retire
    await admin.from('fronde_editions').delete().eq('id', edition.id);
    return json({ error: e2.message }, 500);
  }
  return json({ created: edition.id, edition: edition.id, start_at: edition.start_at });
});
