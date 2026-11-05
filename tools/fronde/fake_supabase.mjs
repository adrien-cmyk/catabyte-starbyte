// Petit serveur d'essai qui répond comme Supabase pour la Grande Fronde, sur une base PostgreSQL locale (schéma v41) :
//   POST /rest/v1/rpc/<fonction>   → select public.<fonction>(args nommés), en rôle authenticated, jeton = id du joueur
//   POST /functions/v1/fronde-tick → le vrai code de la fonction serveur (server/fronde-tick/edition.js), clé de service
// Usage : PGHOST=… PGPORT=… PGDATABASE=… PG_MODULE=…/node_modules/pg node tools/fronde/fake_supabase.mjs [port]
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pg = require(process.env.PG_MODULE || 'pg');
const root = new URL('../../', import.meta.url).pathname;
const { prepareEdition } = await import(root + 'server/fronde-tick/edition.js');
const pool = new pg.Pool({ user: 'postgres', max: 4 });
const PORT = +(process.argv[2] || 8767);
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const send = (res, code, body) => { res.writeHead(code, { ...CORS, 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
const ident = /^[a-z_][a-z0-9_]*$/;
// horloge décalée pour les essais : POST /test/now { offsetHours } décale « maintenant » côté base (via les dates des éditions)

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 200, {});
  let body = ''; for await (const c of req) body += c;
  let args = {}; try { args = body ? JSON.parse(body) : {}; } catch (_) { return send(res, 400, { message: 'bad_json' }); }
  const uid = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const c = await pool.connect();
  try {
    if (req.url.startsWith('/rest/v1/rpc/')) {
      const fn = req.url.slice(13).split('?')[0];
      if (!ident.test(fn) || !Object.keys(args).every((k) => ident.test(k))) return send(res, 400, { message: 'bad_request' });
      await c.query('begin'); await c.query('set local role authenticated');
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const keys = Object.keys(args), vals = keys.map((k) => args[k]);
      const r = await c.query(`select public.${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as v`, vals);
      await c.query('commit');
      return send(res, 200, r.rows[0].v);
    }
    if (req.url.startsWith('/functions/v1/fronde-tick')) {
      if (!uid) return send(res, 401, { error: 'not_signed_in' });
      const open = await c.query("select id from public.fronde_editions where status = 'annoncee' limit 1");
      if (open.rows.length) return send(res, 200, { created: null, edition: open.rows[0].id });
      const { edition: e, secrets: s } = await prepareEdition(Date.now());
      await c.query('insert into public.fronde_editions (id, name, systems, racers, pilot, start_at, nominal_end_at, seed_hash, engine) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [e.id, e.name, JSON.stringify(e.systems), JSON.stringify(e.racers), JSON.stringify(e.pilot), e.start_at, e.nominal_end_at, e.seed_hash, e.engine]);
      await c.query('insert into public.fronde_secrets values ($1,$2,$3,$4)', [s.edition_id, s.seed, JSON.stringify(s.reveals), JSON.stringify(s.result)]);
      return send(res, 200, { created: e.id, edition: e.id, start_at: e.start_at });
    }
    send(res, 404, { message: 'not_found' });
  } catch (e) {
    try { await c.query('rollback'); } catch (_) {}
    send(res, 400, { message: e.message, code: e.code });
  } finally { c.release(); }
}).listen(PORT, () => console.log('faux Supabase sur', PORT));
