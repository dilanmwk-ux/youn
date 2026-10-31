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

// ---------- Verifikasi cadangan (proof-of-work) ----------
// Dipakai jika Cloudflare Turnstile gagal di perangkat tertentu. Matikan dengan CAPTCHA_FALLBACK=0
const fallbackOn = () => process.env.CAPTCHA_FALLBACK !== '0';
const POW_BITS = 16;
const POW_TTL = 2 * 60 * 1000;
const usedPow = new Map();

function powIssue() {
  const exp = Date.now() + POW_TTL;
  const rnd = crypto.randomBytes(8).toString('hex');
  const body = exp + '.' + rnd;
  const sig = crypto.createHmac('sha256', secret()).update('pow.' + body).digest('base64url');
  return { c: body + '.' + sig, bits: POW_BITS };
}

function powCheck(c, n) {
  if (typeof c !== 'string' || typeof n !== 'string' || c.length > 120 || n.length > 20) return false;
  const [e, rnd, sig] = c.split('.');
  const exp = Number(e);
  if (!exp || exp < Date.now() || !rnd || !sig) return false;
  const want = crypto.createHmac('sha256', secret()).update('pow.' + e + '.' + rnd).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (usedPow.has(rnd)) return false;
  const h = crypto.createHash('sha256').update(c + ':' + n).digest();
  let bits = POW_BITS;
  for (let i = 0; bits > 0; i++) {
    const m = bits >= 8 ? 0xff : (0xff << (8 - bits)) & 0xff;
    if (h[i] & m) return false;
    bits -= 8;
  }
  if (usedPow.size > 2000) for (const [k, v] of usedPow) if (v < Date.now()) usedPow.delete(k);
  usedPow.set(rnd, exp);
  return true;
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

module.exports = { enabled, issue, valid, guard, fallbackOn, powIssue, powCheck };
