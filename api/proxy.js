const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;

function isPrivateV4(ip) {
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    return /^f[cd]/.test(l) || /^fe[89ab]/.test(l);
  }
  return true;
}

async function assertPublic(u) {
  if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Only http/https'), { code: 400 });
  if (u.username || u.password) throw Object.assign(new Error('Credentials not allowed'), { code: 400 });
  if (u.port && !['80', '443'].includes(u.port)) throw Object.assign(new Error('Port not allowed'), { code: 403 });
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw Object.assign(new Error('Blocked host'), { code: 403 });
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) {
    throw Object.assign(new Error('Blocked host'), { code: 403 });
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = req.query.url;
  if (!raw || typeof raw !== 'string' || raw.length > 2048) {
    return res.status(400).json({ error: 'Missing url' });
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    // redirect dikerjakan manual supaya tiap lompatan ikut dicek (anti-SSRF lewat redirect)
    let upstream;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      await assertPublic(target);
      upstream = await fetch(target.toString(), {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TempMailProxy/1.0)', Accept: 'image/*' },
        redirect: 'manual',
        signal: ctrl.signal,
      });
      if (upstream.status >= 300 && upstream.status < 400 && upstream.headers.get('location')) {
        if (i === MAX_REDIRECTS) return res.status(508).json({ error: 'Too many redirects' });
        target = new URL(upstream.headers.get('location'), target);
        continue;
      }
      break;
    }

    if (!upstream.ok) return res.status(502).json({ error: 'Upstream ' + upstream.status });

    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    // SVG sengaja diblok: kalau dibuka langsung di domain ini bisa menjalankan script (XSS)
    const okType = /^image\/(png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)/.test(contentType);
    if (!okType) return res.status(415).json({ error: 'Not a supported image' });

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return res.status(413).json({ error: 'Too large' });

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'Too large' });

    res.setHeader('Content-Type', contentType.split(';')[0]);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (e) {
    if (e && e.code && Number.isInteger(e.code)) return res.status(e.code).json({ error: e.message });
    return res.status(502).json({ error: 'Proxy failed' });
  } finally {
    clearTimeout(timer);
  }
};
