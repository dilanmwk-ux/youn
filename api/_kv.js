// Penyimpanan permanen via Upstash Redis / Vercel KV (REST). Tanpa env -> memori sementara.
const U = () => (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
const T = () => (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
const mem = global.__kv || (global.__kv = new Map());
const on = () => !!(U() && T());
let lastErr = '';
async function cmd(a) {
  const r = await fetch(U(), { method: 'POST', headers: { Authorization: 'Bearer ' + T(), 'Content-Type': 'application/json' }, body: JSON.stringify(a), signal: AbortSignal.timeout(5000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || 'HTTP ' + r.status);
  lastErr = '';
  return j.result;
}
const fail = (w, e) => { lastErr = w + ': ' + (e && e.message); console.error('kv', lastErr); };
async function get(k) {
  if (!on()) return mem.has(k) ? mem.get(k) : null;
  try { const v = await cmd(['GET', 'tm:' + k]); return v ? JSON.parse(v) : null; } catch (e) { fail('get', e); return null; }
}
// mengembalikan true jika benar-benar tersimpan
async function set(k, v) {
  if (!on()) { mem.set(k, v); return false; }
  try { await cmd(['SET', 'tm:' + k, JSON.stringify(v)]); return true; } catch (e) { fail('set', e); return false; }
}
async function incr(k) { if (on()) try { await cmd(['HINCRBY', 'tm:c', k, 1]); } catch (e) { fail('incr', e); } }
async function counters() {
  if (!on()) return null;
  try { const a = await cmd(['HGETALL', 'tm:c']); const o = {}; for (let i = 0; i < (a || []).length; i += 2) o[a[i]] = +a[i + 1]; return o; } catch (e) { fail('counters', e); return null; }
}
// Tes koneksi nyata untuk dashboard admin
async function status() {
  const env = { url: !!U(), token: !!T() };
  if (!on()) return { on: false, ok: false, env, err: 'Env Upstash/KV belum terbaca oleh server (perlu Redeploy setelah mengisi env)' };
  try { await cmd(['SET', 'tm:ping', String(Date.now())]); return { on: true, ok: true, env, err: '' }; }
  catch (e) { return { on: true, ok: false, env, err: String((e && e.message) || e) }; }
}
module.exports = { on, get, set, incr, counters, status };
