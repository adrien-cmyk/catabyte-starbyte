// Essai de bout en bout de la Phase 3, sans Deno : préparation d'une édition par le code serveur (server/fronde-tick/
// edition.js), écriture dans une base PostgreSQL locale qui imite Supabase (schéma v41), lecture par un joueur via
// mp_fronde_edition à plusieurs moments de la course, flux du jeu (ServerFeed) reconstruit à partir de ce que renvoie
// le SQL — et comparaison avec la course secrète. Vérifie aussi le calendrier et l'empreinte de la graine.
// Usage : PGHOST=… PGPORT=… node tools/fronde/e2e_test.mjs
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const { prepareEdition, nextStart, sha256 } = await import(root + 'server/fronde-tick/edition.js');
const { ServerFeed, RaceFeed } = await import(root + 'sandbox/race/DemoFeed.js');
const { runRace, digest } = await import(root + 'sandbox/race/engine.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok — ' : 'ÉCHEC — ') + m); if (!c) fail++; };
const psql = (sql, db = 'fronde_e2e') => execFileSync('psql', ['-U', 'postgres', '-d', db, '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8' }).trim();
const file = (f, db = 'fronde_e2e') => execFileSync('psql', ['-U', 'postgres', '-d', db, '-q', '-v', 'ON_ERROR_STOP=1', '-f', root + f], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// ── calendrier ──
const iso = (t) => new Date(t).toISOString().slice(0, 16);
ok(iso(nextStart(Date.UTC(2026, 10, 5, 21)).t) === '2026-11-08T19:00', 'première édition : dimanche 8 novembre 2026, 20 h à Zurich (19 h UTC)');
ok(iso(nextStart(Date.UTC(2026, 10, 8, 19, 30)).t) === '2026-11-29T19:00', 'puis tous les 21 jours : dimanche 29 novembre');
ok(iso(nextStart(Date.UTC(2027, 2, 20)).t) === '2027-04-04T18:00', 'heure d\'été : 4 avril 2027, 20 h à Zurich (18 h UTC)');

// ── préparation ──
const now = Date.UTC(2026, 10, 5, 12);   // jeudi 5 novembre, midi : les paris ouvrent le soir même (3 jours avant)
const { edition, secrets } = await prepareEdition(now);
ok(edition.id === '2026-11-08' && edition.start_at === '2026-11-08T19:00:00.000Z' && edition.opens_at === '2026-11-05T19:00:00.000Z', `édition ${edition.id}, paris dès ${edition.opens_at}, départ ${edition.start_at}`);
ok(await sha256(secrets.seed) === edition.seed_hash && secrets.seed.length === 64, 'graine de 256 bits, empreinte sha-256 publiée');
ok(!('seed' in edition.pilot), 'la graine n\'apparaît pas dans les données publiques');
const full = runRace({ systems: edition.systems, racers: edition.racers, pilot: { ...edition.pilot, seed: secrets.seed } });
ok(digest(full) === digest(runRace({ systems: edition.systems, racers: edition.racers, pilot: edition.pilot, plans: Object.fromEntries(secrets.reveals.map((x) => [`${x.racer}|${x.sys}`, x.plan])) })), 'les plans enregistrés rejouent la course secrète');
console.log(`   parcours ${edition.systems.map((s) => s.name).join(' → ')} · vainqueur ${secrets.result.winner} en ${(secrets.result.t1 / 3600).toFixed(2)} h (dernier)`);

// ── base locale : schéma v41, écriture comme le ferait fronde-tick (clé de service) ──
psql('drop database if exists fronde_e2e', 'postgres'); psql('create database fronde_e2e', 'postgres');
file('tools/fronde/sql/supabase_fake.sql'); file('server/schema_mp_v41_grande_fronde.sql'); file('server/schema_mp_v42_fronde_social.sql');
const q = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
psql(`insert into public.fronde_editions (id, name, systems, racers, pilot, start_at, opens_at, nominal_end_at, seed_hash, engine, rate) values ('${edition.id}', '${edition.name}', ${q(edition.systems)}, ${q(edition.racers)}, ${q(edition.pilot)}, '${edition.start_at}', '${edition.opens_at}', '${edition.nominal_end_at}', '${edition.seed_hash}', '${edition.engine}', ${edition.rate})`);
psql(`insert into public.fronde_secrets values ('${edition.id}', '${secrets.seed}', ${q(secrets.reveals)}, ${q(secrets.result)})`);
psql(`insert into auth.users values ('00000000-0000-0000-0000-0000000000a1')`);
const asPlayer = (sql) => psql(`set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', false); ${sql}`).split('\n').pop();

// ── un joueur suit la course : à chaque moment, le flux reconstruit doit valoir la course secrète ──
const fullFeed = new RaceFeed({ systems: edition.systems, racers: edition.racers, pilot: edition.pilot, result: full });
let leaks = 0, diffs = 0, samples = 0;
for (const h of [-2, 0.5, 6, 13, 30, 40, 55, 70, 71.5, 80]) {
  psql(`update public.fronde_editions set start_at = now() - make_interval(secs => ${h * 3600}) where id = '${edition.id}'`);
  const r = JSON.parse(asPlayer(`select public.mp_fronde_edition()`));
  const el = r.elapsed;
  for (const x of r.reveals) if (x.t > el + 1e-6 && r.state !== 'reglee') leaks++;
  const source = { reveals: (t, have) => r.reveals.filter((x) => x.t <= t && !have[`${x.racer}|${x.sys}`]) };
  const live = new ServerFeed({ source, systems: r.edition.systems, racers: r.edition.racers, pilot: r.edition.pilot });
  const t = Math.max(0, Math.min(el, full.t1)); live.sync(t);
  for (const rc of edition.racers) {
    const a = fullFeed.stateAt(rc.id, t), b = live.stateAt(rc.id, t); samples++;
    if (h < 0) { if (b.phase !== 'start') diffs++; continue; }
    if (a.phase !== b.phase || (a.p && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) > 1e-6)) diffs++;
  }
  if (fullFeed.standingsAt(t).map((x) => x.id).join() !== live.standingsAt(t).map((x) => x.id).join() && h >= 0) diffs++;
  console.log(`   ${String(h).padStart(5)} h : état ${r.state.padEnd(9)} plans publiés ${String(r.reveals.length).padStart(2)}/${secrets.reveals.length}${r.edition.seed ? ' · graine révélée' : ''}`);
  if (h === 80) {
    ok(r.state === 'reglee' && r.edition.seed === secrets.seed && r.edition.result.winner === secrets.result.winner, 'à l\'arrivée : réglée, graine et vainqueur publiés');
    ok(await sha256(r.edition.seed) === r.edition.seed_hash, 'vérifiable par tous : sha-256(graine révélée) = empreinte d\'avant les paris');
  }
}
ok(leaks === 0, 'aucun plan publié avant l\'entrée du pilote dans son système');
ok(diffs === 0, `le jeu reconstruit exactement la course secrète à partir du SQL (${samples} états comparés)`);
psql('drop database if exists fronde_e2e', 'postgres');
console.log(fail ? `${fail} échec(s)` : 'ESSAI DE BOUT EN BOUT RÉUSSI');
process.exit(fail ? 1 : 0);
