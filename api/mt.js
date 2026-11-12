const auth = require('./_auth');
const { shield } = require('./_shield');
const stats = require('./_stats');
const { mt, parseSid } = require('./_providers');
const { getIp } = require('./_shield');

// Endpoint web untuk penyedia mTempMail. Keluaran berbentuk sama dengan /api/gm.
const ACTIONS = new Set(['new', 'inbox', 'read', 'del']);
const okEmail = (e) => typeof e === 'string' && e.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await shield(req, res, { name: 'mt', limit: 240 }))) return;
  if (!auth.guard(req, res)) return;

  const a = String(req.query.a || '');
  if (!ACTIONS.has(a)) return res.status(400).json({ error: 'Bad action' });
  // sid = "alamat|token" (dari a=new). email saja tetap diterima untuk kompatibilitas.
  const sid = String(req.query.sid || req.query.email || '').slice(0, 400);
  const id = String(req.query.id || '').slice(0, 120);
  const ip = getIp(req);
  if (a !== 'new' && !okEmail(parseSid(sid).email)) return res.status(400).json({ error: 'Alamat email tidak valid' });
  if ((a === 'read' || a === 'del') && !id) return res.status(400).json({ error: 'id kosong' });

  await stats.add('mt:' + a);
  try {
    if (a === 'new') return res.status(200).json(await mt.create(ip));
    if (a === 'inbox') return res.status(200).json(await mt.inbox(sid, ip));
    if (a === 'read') return res.status(200).json(await mt.read(sid, id, ip));
    return res.status(200).json(await mt.del(sid, id, ip));
  } catch (e) {
    const code = e && Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 502;
    // 401 dari mTempMail dikirim sebagai 502 + reason, supaya tidak tertukar dengan captcha situs ini
    return res.status(code === 429 ? 429 : code === 404 ? 404 : 502).json({
      error: (e && e.message) || 'Upstream gagal',
      ...(e && e.auth ? { reason: 'mt_auth' } : {}),
    });
  }
};
