const auth = require('./_auth');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    return res.status(200).json({
      enabled: auth.enabled(),
      siteKey: process.env.TURNSTILE_SITE_KEY || '',
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!auth.enabled()) return res.status(200).json({ ok: true, token: '' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
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
