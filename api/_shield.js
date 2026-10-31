const net = require('net');

/*
  Shield: anti-bot, anti-VPN/proxy, dan rate limit untuk semua endpoint API.

  Env (semua opsional, diatur di Vercel):
    SHIELD_ENABLED          "0" untuk mematikan seluruh shield (default aktif)
    BLOCK_VPN               "0" untuk mematikan blokir VPN/proxy saja
    PROXYCHECK_KEY          API key proxycheck.io (gratis 1.000 cek/hari; tanpa key hanya 100/hari)
    GETIPINTEL_EMAIL        alternatif TANPA daftar: cukup isi email aktif (gratis 500 cek/hari, 15/menit)
    SHIELD_MAX_RISK         proxycheck: blokir jika skor risiko >= nilai ini (default 85)
    SHIELD_MAX_SCORE        getipintel: blokir jika skor 0-1 >= nilai ini (default 0.99)
    SHIELD_FAIL_CLOSED      "1" = blokir jika layanan cek IP error (default: izinkan)
    SHIELD_ALLOW_IPS        IP yang selalu lolos, pisah koma (untuk Anda sendiri)
    SHIELD_ALLOW_COUNTRIES  hanya negara ini yang boleh, mis. "ID" atau "ID,MY" (default: semua)
*/

const on = () => process.env.SHIELD_ENABLED !== '0';
const vpnOn = () => process.env.BLOCK_VPN !== '0';
const failClosed = () => process.env.SHIELD_FAIL_CLOSED === '1';
const maxRisk = () => Number(process.env.SHIELD_MAX_RISK) || 85;
const list = (k) => new Set(String(process.env[k] || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean));

// ---------- IP klien ----------
function getIp(req) {
  const h = req.headers;
  const raw = h['x-vercel-forwarded-for'] || h['x-real-ip'] || String(h['x-forwarded-for'] || '').split(',')[0];
  const ip = String(raw || '').split(',')[0].trim();
  return net.isIP(ip) ? ip : '';
}

function isLocal(ip) {
  if (!ip) return true;
  if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
  return /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

// ---------- Deteksi bot ----------
const BOT_UA = new RegExp(
  [
    'headless', 'phantomjs', 'selenium', 'puppeteer', 'playwright', 'webdriver', 'electron/',
    'curl/', 'wget', 'libwww', 'python-requests', 'python-urllib', 'python/', 'aiohttp', 'httpx',
    'httpclient', 'go-http-client', 'java/', 'node-fetch', 'axios/', 'undici', 'scrapy', 'postman',
    'insomnia', 'httpie', 'powershell', 'restsharp', 'guzzle', 'okhttp-bot', 'lwp-', 'mechanize',
    'googlebot', 'bingbot', 'yandexbot', 'baiduspider', 'duckduckbot', 'ahrefsbot', 'semrushbot',
    'mj12bot', 'dotbot', 'petalbot', 'bytespider', 'gptbot', 'claudebot', 'ccbot', 'amazonbot',
    'applebot', 'facebookexternalhit', 'telegrambot', 'whatsapp/', 'discordbot', 'slackbot',
    '(^|[^a-z])(bot|crawler|spider|scraper)([^a-z]|$)',
  ].join('|'),
  'i'
);

// Header yang hanya muncul jika lewat proxy anonim / proxy kantor
const PROXY_HEADERS = ['proxy-connection', 'x-proxy-id', 'x-bluecoat-via', 'x-proxy-connection', 'x-tor-exit'];

function botReason(req) {
  const h = req.headers;
  const ua = String(h['user-agent'] || '');
  if (ua.length < 10) return 'ua-empty';
  if (BOT_UA.test(ua)) return 'ua-bot';
  if (h['sec-fetch-site'] === 'cross-site') return 'cross-site';
  if (h['x-tm-wd'] === '1') return 'webdriver';
  if (h.origin) {
    try {
      if (new URL(h.origin).host !== h.host) return 'bad-origin';
    } catch {
      return 'bad-origin';
    }
  }
  return '';
}

function proxyHeader(req) {
  const h = req.headers;
  // Header "Via" sengaja tidak dipakai: operator seluler & mode hemat data menambahkannya,
  // sehingga pengguna HP biasa salah terblokir sebagai VPN.
  return PROXY_HEADERS.some((k) => h[k]);
}

// ---------- Rate limit (per instance serverless) ----------
const hits = new Map();
function rate(key, limit, windowMs = 60000) {
  const now = Date.now();
  let e = hits.get(key);
  if (!e || e.reset < now) {
    e = { n: 0, reset: now + windowMs };
    hits.set(key, e);
    if (hits.size > 8000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
  }
  e.n += 1;
  return e.n <= limit;
}

// ---------- Cek reputasi IP (VPN / proxy / TOR / datacenter) ----------
const cache = new Map();
const inflight = new Map();
const OK_TTL = 6 * 3600 * 1000;
const ERR_TTL = 60 * 1000;

async function viaProxycheck(ip, signal) {
  const key = process.env.PROXYCHECK_KEY;
  const url = 'https://proxycheck.io/v2/' + encodeURIComponent(ip) + '?vpn=1&asn=1&risk=1' + (key ? '&key=' + encodeURIComponent(key) : '');
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const j = await r.json();
  if (!j || j.status === 'error' || j.status === 'denied') return null;
  const k = Object.keys(j).find((x) => j[x] && typeof j[x] === 'object');
  if (!k) return null;
  const d = j[k];
  const proxy = String(d.proxy || '').toLowerCase() === 'yes';
  const risk = Number(d.risk) || 0;
  // IP jaringan seluler (CGNAT) sering diberi skor tinggi padahal pengguna biasa
  const mobile = /wireless|mobile|cellular|residential/i.test(String(d.type || ''));
  return { bad: !mobile && (proxy || risk >= maxRisk()) };
}

// GetIPIntel: tanpa akun, cukup email kontak. Skor 0-1 = peluang IP adalah proxy/VPN.
async function viaGetIpIntel(ip, signal) {
  const mail = process.env.GETIPINTEL_EMAIL;
  // dokumentasi GetIPIntel: parameter tidak boleh di-URL-encode
  const url = 'https://check.getipintel.net/check.php?ip=' + ip + '&contact=' + mail + '&flags=m&format=json';
  const r = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const j = await r.json();
  const score = Number(j && j.result);
  if (!j || j.status === 'error' || !Number.isFinite(score) || score < 0) return null;
  return { bad: score >= (Number(process.env.SHIELD_MAX_SCORE) || 0.99) };
}

async function lookup(ip) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const useGipi = !process.env.PROXYCHECK_KEY && !!process.env.GETIPINTEL_EMAIL;
    const v = await (useGipi ? viaGetIpIntel(ip, ctrl.signal) : viaProxycheck(ip, ctrl.signal));
    return v ? { v, ttl: OK_TTL } : { v: null, ttl: ERR_TTL };
  } catch {
    return { v: null, ttl: ERR_TTL };
  } finally {
    clearTimeout(t);
  }
}

async function ipRisk(ip) {
  const c = cache.get(ip);
  if (c && c.exp > Date.now()) return c.v;
  if (inflight.has(ip)) return inflight.get(ip);
  const p = lookup(ip)
    .then(({ v, ttl }) => {
      if (cache.size > 5000) cache.clear();
      cache.set(ip, { v, exp: Date.now() + ttl });
      return v;
    })
    .finally(() => inflight.delete(ip));
  inflight.set(ip, p);
  return p;
}

// ---------- Gerbang utama ----------
// opts: { name: string, limit: number (req/menit/IP), vpn: boolean }
async function shield(req, res, opts) {
  if (!on()) return true;
  const { name, limit, vpn = true } = opts;
  const ip = getIp(req);
  if (ip && list('SHIELD_ALLOW_IPS').has(ip.toUpperCase())) return true;

  const deny = (status, reason) => {
    res.setHeader('Cache-Control', 'no-store');
    if (status === 429) res.setHeader('Retry-After', '60');
    res.status(status).json({ error: status === 429 ? 'rate' : 'blocked', reason });
    return false;
  };

  if (!rate(name + ':' + (ip || 'x'), limit)) return deny(429, 'rate');
  if (botReason(req)) return deny(403, 'bot');

  if (vpn && vpnOn()) {
    if (proxyHeader(req)) return deny(403, 'vpn');

    const allowC = list('SHIELD_ALLOW_COUNTRIES');
    const cc = String(req.headers['x-vercel-ip-country'] || '').toUpperCase();
    if (allowC.size && cc && !allowC.has(cc)) return deny(403, 'vpn');

    if (!isLocal(ip)) {
      const r = await ipRisk(ip);
      if (r ? r.bad : failClosed()) return deny(403, 'vpn');
    }
  }
  return true;
}

module.exports = { shield, getIp, botReason, proxyHeader, rate };
