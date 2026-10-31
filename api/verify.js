const auth = require('./_auth');
const { shield } = require('./_shield');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    if (!(await shield(req, res, { name: 'vcfg', limit: 120 }))) return;
    if (req.query && req.query.pow) {
      if (!auth.enabled() || !auth.fallbackOn()) return res.status(404).json({ error: 'off' });
      return res.status(200).json(auth.powIssue());
    }
    return res.status(200).json({
      enabled: auth.enabled(),
      siteKey: process.env.TURNSTILE_SITE_KEY || '',
      fallback: auth.enabled() && auth.fallbackOn(),
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
    if (!auth.fallbackOn()) return res.status(403).json({ ok: false, error: 'Verifikasi alternatif dimatikan' });
    if (!auth.powCheck(body.pow.c, String(body.pow.n))) return res.status(403).json({ ok: false, error: 'Verifikasi alternatif gagal, coba lagi' });
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
    if (!j.success) {
      const codes = Array.isArray(j['error-codes']) ? j['error-codes'].slice(0, 4) : [];
      console.error('turnstile siteverify gagal:', codes.join(','));
      return res.status(403).json({ ok: false, error: 'Verifikasi gagal' + (codes.length ? ' (' + codes[0] + ')' : '') + ', coba lagi', codes });
    }
    return res.status(200).json({ ok: true, token: auth.issue() });
  } catch {
    return res.status(502).json({ ok: false, error: 'Server captcha tidak merespons' });
  } finally {
    clearTimeout(t);
  }
};
