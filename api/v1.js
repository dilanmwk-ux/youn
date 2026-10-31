const crypto = require('crypto');
const { rate, getIp } = require('./_shield');
const stats = require('./_stats');
const kv = require('./_kv');

// API publik berkunci. Kunci = HMAC yang ditandatangani API_SECRET (tanpa database).
const sec = () => process.env.API_SECRET || '';
const sig = (p) => crypto.createHmac('sha256', sec()).update(p).digest('base64url').slice(0, 22);
const mk = (name) => {
  const p = Buffer.from(JSON.stringify({ i: crypto.randomBytes(4).toString('hex'), n: name, t: Date.now() })).toString('base64url');
  return 'tm_' + p + '.' + sig(p);
};
function verify(k) {
  if (!sec() || typeof k !== 'string' || k.length > 300 || !k.startsWith('tm_')) return null;
  const [p, s] = k.slice(3).split('.');
  if (!p || !s) return null;
  const a = Buffer.from(s), b = Buffer.from(sig(p));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
}
const FN = { new: 'get_email_address', set: 'set_email_user', inbox: 'check_email', read: 'fetch_email', del: 'del_email' };

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'x-api-key, content-type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const ip = getIp(req) || 'x';
  const a = String(req.query.a || '');

  if (a === 'key') {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
    if (!sec()) return res.status(503).json({ error: 'API_SECRET belum diisi di server' });
    if (!rate('keygen:' + ip, 5, 3600000)) return res.status(429).json({ error: 'Maksimal 5 kunci per jam' });
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    const name = String((b && b.name) || 'app').replace(/[^\w .-]/g, '').slice(0, 24) || 'app';
    const key = mk(name), inf = verify(key);
    const list = (await kv.get('keys')) || [];
    list.unshift({ i: inf.i, n: name, t: inf.t });
    const saved = await kv.set('keys', list.slice(0, 200));
    await stats.add('apikey', name);
    return res.status(200).json({ key, name, saved });
  }

  const info = verify(req.headers['x-api-key']);
  if (!info) return res.status(401).json({ error: 'API key tidak valid' });
  if (info.i && ((await kv.get('revoked')) || []).includes(info.i)) return res.status(401).json({ error: 'API key sudah dicabut' });
  if (!rate('k:' + (info.i || info.n + info.t), 60)) return res.status(429).json({ error: 'Batas 60 permintaan/menit' });
  const f = FN[a];
  if (!f) return res.status(400).json({ error: 'a harus salah satu dari: ' + Object.keys(FN).join(', ') });

  const q = new URLSearchParams({ f, ip: '127.0.0.1', agent: 'TempMail-API/1.0' });
  const map = { sid: 'sid_token', user: 'email_user', seq: 'seq', id: a === 'del' ? 'email_ids[]' : 'email_id' };
  for (const [k, v] of Object.entries(map)) if (typeof req.query[k] === 'string') q.set(v, req.query[k].slice(0, 200));
  await stats.add('v1:' + a, info.n);
  try {
    const up = await fetch('https://api.guerrillamail.com/ajax.php?' + q, { signal: AbortSignal.timeout(10000) });
    return res.status(up.ok ? 200 : up.status).json(await up.json());
  } catch {
    return res.status(502).json({ error: 'Upstream gagal' });
  }
};
