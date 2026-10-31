const crypto = require('crypto');
const auth = require('./_auth');
const { shield, getIp } = require('./_shield');

// Jalur cadangan jika Turnstile gagal di HP pengunjung (proof-of-work, tanpa Cloudflare)
const POW_BITS = 17;
const POW_TTL = 3 * 60 * 1000;
const fp = (req) => crypto.createHash('sha256')
  .update(getIp(req) + '|' + String(req.headers['user-agent'] || '')).digest('base64url').slice(0, 16);

function leadingZeroBits(buf) {
  let n = 0;
  for (const b of buf) {
    if (b === 0) { n += 8; continue; }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    if (!(await shield(req, res, { name: 'vcfg', limit: 120 }))) return;
    if (req.query && req.query.pow && auth.enabled()) {
      const ch = Date.now() + '.' + crypto.randomBytes(8).toString('hex') + '.' + fp(req);
      return res.status(200).json({ ch, sig: auth.mac('pow.' + ch), bits: POW_BITS });
    }
    return res.status(200).json({
      enabled: auth.enabled(),
      siteKey: process.env.TURNSTILE_SITE_KEY || '',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!(await shield(req, res, { name: 'vpost', limit: 40 }))) return;
  if (!auth.enabled()) return res.status(200).json({ ok: true, token: '' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (body && body.pow) {
    const { ch, sig, n } = body.pow;
    if (typeof ch !== 'string' || typeof sig !== 'string' || ch.length > 120 || !/^\d{1,10}$/.test(String(n))) {
      return res.status(400).json({ ok: false, error: 'Verifikasi tidak valid' });
    }
    const a = Buffer.from(sig), b = Buffer.from(auth.mac('pow.' + ch));
    const parts = ch.split('.');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || parts[2] !== fp(req) || Date.now() - Number(parts[0]) > POW_TTL) {
      return res.status(403).json({ ok: false, error: 'Verifikasi kedaluwarsa, coba lagi' });
    }
    const h = crypto.createHash('sha256').update(ch + ':' + n).digest();
    if (leadingZeroBits(h) < POW_BITS) return res.status(403).json({ ok: false, error: 'Verifikasi gagal, coba lagi' });
    return res.status(200).json({ ok: true, token: auth.issue() });
  }

  const token = body && body.token;
  if (typeof token !== 'string' || !token || token.length > 4096) {
    return res.status(400).json({ ok: false, error: 'Token captcha kosong' });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    // IP pengguna sengaja tidak dikirim ke Cloudflare (remoteip bersifat opsional)
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: token }),
      signal: ctrl.signal,
    });
    const j = await r.json();
    if (!j.success) return res.status(403).json({ ok: false, error: 'Verifikasi gagal, coba lagi' });
    return res.status(200).json({ ok: true, token: auth.issue() });
  } catch {
    return res.status(502).json({ ok: false, error: 'Server captcha tidak merespons' });
  } finally {
    clearTimeout(t);
  }
};
