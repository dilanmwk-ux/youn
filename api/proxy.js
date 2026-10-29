module.exports = async function handler(req, res) {
  // CORS for same-origin is fine; allow GET only
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const raw = req.query.url;
  if (!raw || typeof raw !== 'string') {
    return res.status(400).json({ error: 'Missing url' });
  }

  let target;
  try {
    target = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid url' });
  }

  if (!['http:', 'https:'].includes(target.protocol)) {
    return res.status(400).json({ error: 'Only http/https' });
  }

  // Basic SSRF guard: block localhost / private ranges
  const host = target.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.startsWith('10.') ||
    host.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
    host.startsWith('169.254.')
  ) {
    return res.status(403).json({ error: 'Blocked host' });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TempMailProxy/1.0)',
        Accept: 'image/*,*/*',
        // no Referer → many CDNs allow
      },
      redirect: 'follow',
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: 'Upstream ' + upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    // only proxy image-ish or small binary
    if (
      !contentType.startsWith('image/') &&
      !contentType.includes('octet-stream') &&
      !contentType.includes('svg')
    ) {
      return res.status(415).json({ error: 'Not an image' });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'Too large' });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(buf);
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: 'Proxy failed' });
  }
};
