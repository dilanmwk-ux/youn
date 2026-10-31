const auth = require('./_auth');
const { shield, getIp } = require('./_shield');
const stats = require('./_stats');

// Live stream (SSE): server memeriksa Guerrilla Mail tiap ~2 dtk dan langsung mendorong email baru ke browser.
module.exports = async function handler(req, res) {
  if (!(await shield(req, res, { name: 'sse', limit: 30 }))) return;
  if (!auth.guard(req, res)) return;
  const sid = String(req.query.sid || '').slice(0, 120);
  let seq = Number(req.query.seq) || 0;
  if (!sid) return res.status(400).json({ error: 'sid' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 1500\n\n');
  stats.add('stream');
  let closed = false;
  req.on('close', () => { closed = true; });
  const ip = getIp(req) || '127.0.0.1';
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  const end = Date.now() + 50000;

  while (!closed && Date.now() < end) {
    try {
      const q = new URLSearchParams({ f: 'check_email', seq: String(seq), sid_token: sid, ip, agent: ua });
      const r = await fetch('https://api.guerrillamail.com/ajax.php?' + q, { signal: AbortSignal.timeout(6000) });
      const j = await r.json();
      const list = (j.list || []).filter((m) => String(m.mail_id) !== '0');
      if (j.seq) seq = Number(j.seq) || seq;
      if (list.length) res.write('event: mail\ndata: ' + JSON.stringify({ seq, list }) + '\n\n');
      else res.write('event: ping\ndata: ' + Date.now() + '\n\n');
    } catch {
      res.write('event: ping\ndata: err\n\n');
    }
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  res.write('event: bye\ndata: reconnect\n\n');
  res.end();
};
