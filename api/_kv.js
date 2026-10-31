// Penyimpanan permanen via Upstash Redis / Vercel KV (REST). Tanpa env -> memori sementara.
const U = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const T = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const mem = global.__kv || (global.__kv = new Map());
const on = () => !!(U() && T());
async function cmd(a) {
  const r = await fetch(U(), { method: 'POST', headers: { Authorization: 'Bearer ' + T(), 'Content-Type': 'application/json' }, body: JSON.stringify(a), signal: AbortSignal.timeout(5000) });
  return (await r.json()).result;
}
async function get(k) {
  if (!on()) return mem.has(k) ? mem.get(k) : null;
  try { const v = await cmd(['GET', 'tm:' + k]); return v ? JSON.parse(v) : null; } catch { return null; }
}
async function set(k, v) {
  if (!on()) return void mem.set(k, v);
  try { await cmd(['SET', 'tm:' + k, JSON.stringify(v)]); } catch (e) { console.error('kv set', e && e.message); }
}
async function incr(k) { if (on()) try { await cmd(['HINCRBY', 'tm:c', k, 1]); } catch (e) { console.error('kv incr', e && e.message); } }
async function counters() {
  if (!on()) return null;
  try { const a = await cmd(['HGETALL', 'tm:c']); const o = {}; for (let i = 0; i < a.length; i += 2) o[a[i]] = +a[i + 1]; return o; } catch { return null; }
}
module.exports = { on, get, set, incr, counters };
