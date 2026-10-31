const crypto = require('crypto');
const stats = require('./_stats');
const kv = require('./_kv');
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
    if (req.query.r === 'articles' && b && Array.isArray(b.list)) {
      const list = b.list.slice(0, 50).map((x) => ({
        s: String(x.s || '').toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 60),
        t: String(x.t || '').slice(0, 140), d: String(x.d || '').slice(0, 30), b: String(x.b || '').slice(0, 20000),
      })).filter((x) => x.s && x.t);
      await kv.set('articles', list);
      return res.status(200).json({ ok: true, n: list.length });
    }
    return res.status(400).json({ error: 'Permintaan tidak dikenal' });
  }

  const t0 = Date.now();
  let up = { ok: false, ms: 0 };
  try {
    const r = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address&ip=127.0.0.1&agent=health', { signal: AbortSignal.timeout(4000) });
    up = { ok: r.ok, ms: Date.now() - t0 };
  } catch { up.ms = Date.now() - t0; }

  const st = stats.get();
  return res.status(200).json({
    since: st.since, counters: { ...st.c, ...((await kv.counters()) || {}) }, persistent: kv.on(), kv: await kv.status(),
    keys: (await kv.get('keys')) || [], revoked: (await kv.get('revoked')) || [], articles: (await kv.get('articles')) || [], events: st.ev, upstream: up,
    config: {
      captcha: !!process.env.TURNSTILE_SECRET_KEY,
      shield: process.env.SHIELD_ENABLED !== '0',
      vpnBlock: process.env.BLOCK_VPN !== '0',
      apiKeys: !!process.env.API_SECRET,
    },
  });
};
