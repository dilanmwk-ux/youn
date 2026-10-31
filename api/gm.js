const auth = require('./_auth');
const { shield } = require('./_shield');
const stats = require('./_stats');

const ALLOWED_FN = new Set([
  'get_email_address', 'set_email_user', 'check_email',
  'fetch_email', 'del_email', 'forget_me', 'get_older_list',
]);

// Hanya parameter ini yang diteruskan ke Guerrilla Mail
const ALLOWED_PARAMS = new Set([
  'f', 'lang', 'sid_token', 'email_user', 'seq', 'email_id', 'email_ids[]',
  'email_addr', 'offset', 'site',
]);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await shield(req, res, { name: 'gm', limit: 240 }))) return;
  if (!auth.guard(req, res)) return;

  const f = String(req.query.f || '');
  if (!ALLOWED_FN.has(f)) return res.status(400).json({ error: 'Bad function' });

  await stats.add('gm:' + f);
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (!ALLOWED_PARAMS.has(k)) continue;
    const vals = Array.isArray(v) ? v : [v];
    for (const one of vals) {
      if (typeof one === 'string' && one.length <= 200) q.append(k, one);
    }
  }
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  q.set('ip', fwd || '127.0.0.1');
  q.set('agent', String(req.headers['user-agent'] || 'Mozilla/5.0').slice(0, 200));

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const up = await fetch('https://api.guerrillamail.com/ajax.php?' + q, {
      headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 (compatible; TempMail/1.0)' },
      signal: ctrl.signal,
    });
    const text = await up.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(up.ok ? 200 : up.status).send(text);
  } catch (e) {
    return res.status(502).json({ error: 'Upstream failed' });
  } finally {
    clearTimeout(t);
  }
};
