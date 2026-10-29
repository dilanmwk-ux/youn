const ALLOWED = new Set([
  'get_email_address', 'set_email_user', 'check_email',
  'fetch_email', 'del_email', 'forget_me', 'get_older_list',
]);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const f = String(req.query.f || '');
  if (!ALLOWED.has(f)) return res.status(400).json({ error: 'Bad function' });

  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (typeof v === 'string') q.set(k, v);
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
