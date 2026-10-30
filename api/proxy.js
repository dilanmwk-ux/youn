const dns = require('dns').promises;
const net = require('net');

const MAX_BYTES = 4 * 1024 * 1024;
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

function sniffImage(b, declared) {
  if (b.length < 4) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.slice(0, 3).toString() === 'GIF') return 'image/gif';
  if (b.slice(0, 4).toString() === 'RIFF' && b.slice(8, 12).toString() === 'WEBP') return 'image/webp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  if (b[0] === 0x42 && b[1] === 0x4d) return 'image/bmp';
  if (b.slice(4, 8).toString() === 'ftyp' && /avif|avis/.test(b.slice(8, 16).toString())) return 'image/avif';
  const head = b.slice(0, 512).toString('utf8').toLowerCase();
  if (head.includes('<svg') && (declared.includes('svg') || declared.includes('xml') || declared.startsWith('text/') || declared.includes('octet'))) {
    return 'image/svg+xml'; // aman: respons membawa CSP sandbox + nosniff, jadi script tidak jalan
  }
  return null;
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
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
        },
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

    const declared = Number(upstream.headers.get('content-length') || 0);
    if (declared > MAX_BYTES) return res.status(413).json({ error: 'Too large' });

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > MAX_BYTES) return res.status(413).json({ error: 'Too large' });

    // Tipe ditentukan dari isi file (banyak CDN salah kirim content-type)
    const contentType = sniffImage(buf, (upstream.headers.get('content-type') || '').toLowerCase());
    if (!contentType) return res.status(415).json({ error: 'Not a supported image' });

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
