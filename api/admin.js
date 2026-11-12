const crypto = require('crypto');
const stats = require('./_stats');
const kv = require('./_kv');
const prov = require('./_providers');
const { rate, getIp } = require('./_shield');

const sec = () => (process.env.API_SECRET || process.env.ADMIN_PASSWORD || '') + '|adm';
const sg = (e) => crypto.createHmac('sha256', sec()).update(String(e)).digest('base64url');
const h = (s) => crypto.createHash('sha256').update(String(s)).digest();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'ADMIN_PASSWORD belum diisi di Vercel' });

  if (req.method === 'POST' && !req.query.r) {
    if (!rate('adm:' + getIp(req), 8, 600000)) return res.status(429).json({ error: 'Terlalu banyak percobaan' });
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    if (!crypto.timingSafeEqual(h(b && b.password), h(process.env.ADMIN_PASSWORD))) return res.status(401).json({ error: 'Password salah' });
    const exp = Date.now() + 8 * 3600 * 1000;
    return res.status(200).json({ token: exp + '.' + sg(exp) });
  }

  const [e, s] = String(req.headers.authorization || '').replace(/^Bearer /, '').split('.');
  if (!e || !s || Number(e) < Date.now() || s !== sg(e)) return res.status(401).json({ error: 'Sesi habis' });

  if (req.method === 'POST') {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    if (req.query.r === 'revoke' && b && typeof b.i === 'string') {
      const rv = (await kv.get('revoked')) || [];
      if (!rv.includes(b.i)) rv.push(b.i);
      await kv.set('revoked', rv.slice(-500));
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Permintaan tidak dikenal' });
  }

  const hp = await prov.health();
  const gmp = hp.find((x) => x.id === 'gm') || { ok: false, ms: 0 };
  const up = { ok: gmp.ok, ms: gmp.ms };

  const st = stats.get();
  return res.status(200).json({
    since: st.since, counters: { ...st.c, ...((await kv.counters()) || {}) }, persistent: kv.on(), kv: await kv.status(),
    providers: hp, providerCount: hp.length, providerOk: hp.filter((x) => x.ok).length,
    keys: (await kv.get('keys')) || [], revoked: (await kv.get('revoked')) || [], events: st.ev, upstream: up,
    config: {
      captcha: !!process.env.TURNSTILE_SECRET_KEY,
      shield: process.env.SHIELD_ENABLED !== '0',
      vpnBlock: process.env.BLOCK_VPN !== '0',
      apiKeys: !!process.env.API_SECRET,
    },
  });
};
