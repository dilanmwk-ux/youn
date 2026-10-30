const crypto = require('crypto');

const TTL_MS = 12 * 60 * 60 * 1000;

// Captcha aktif hanya jika TURNSTILE_SECRET_KEY diisi di Vercel
const enabled = () => !!process.env.TURNSTILE_SECRET_KEY;
const secret = () => process.env.SESSION_SECRET || process.env.TURNSTILE_SECRET_KEY || '';

function sign(exp) {
  return crypto.createHmac('sha256', secret()).update(String(exp)).digest('base64url');
}

function issue() {
  const exp = Date.now() + TTL_MS;
  return exp + '.' + sign(exp);
}

function valid(tok) {
  if (!enabled()) return true;
  if (typeof tok !== 'string' || tok.length > 200) return false;
  const [e, sig] = tok.split('.');
  const exp = Number(e);
  if (!exp || exp < Date.now() || !sig) return false;
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Dipakai di api/gm.js dan api/proxy.js
function guard(req, res) {
  if (!enabled()) return true;
  const tok = req.headers['x-tm-token'] || req.query.t;
  if (valid(tok)) return true;
  res.setHeader('Cache-Control', 'no-store');
  res.status(401).json({ error: 'captcha' });
  return false;
}

module.exports = { enabled, issue, valid, guard };
