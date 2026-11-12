const MT_BASE = 'https://mtempmail.com/api';
const mtKey = () => (process.env.MTEMPMAIL_KEY || 'pub_nRn1hUwpdmZvxQNVWDfoXgKyF7dIm9nRIIIt1qDw').trim();
const UA = 'Mozilla/5.0 (compatible; TempMail/1.0)';

const LIST = [
  { id: 'gm', name: 'Guerrilla Mail', site: 'guerrillamail.com', custom: true, live: true },
  { id: 'mt', name: 'mTempMail', site: 'mtempmail.com', custom: false, live: false },
];
const ids = () => LIST.map((p) => p.id);
const has = (id) => LIST.some((p) => p.id === id);

/* ---------- util normalisasi ---------- */
const pickFirst = (o, keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k];
  return '';
};
const stripTags = (h) => String(h).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function fromText(v) {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return fromText(v[0]);
  const addr = v.address || v.email || '';
  const name = v.name || '';
  return name && addr ? name + ' <' + addr + '>' : addr || name || '';
}

function toEpoch(v) {
  if (v === '' || v === null || v === undefined) return Math.floor(Date.now() / 1000);
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    const n = Number(v);
    return n > 1e12 ? Math.floor(n / 1000) : n;
  }
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? Math.floor(t / 1000) : Math.floor(Date.now() / 1000);
}

function findArray(j) {
  if (Array.isArray(j)) return j;
  if (!j || typeof j !== 'object') return [];
  const d = j.data;
  if (Array.isArray(d)) return d;
  const cands = [d && d.messages, d && d.data, d && d.items, d && d.emails, d && d.list, j.messages, j.list, j.items];
  for (const c of cands) if (Array.isArray(c)) return c;
  return [];
}

function bodyOf(m) {
  return String(pickFirst(m, ['body_html', 'html', 'html_body', 'content', 'body', 'body_text', 'text', 'text_body', 'message']) || '');
}

function normMsg(m) {
  const body = bodyOf(m);
  const subject = String(pickFirst(m, ['subject', 'title']) || '');
  const id = pickFirst(m, ['id', 'message_id', 'uuid', 'mail_id', 'messageId', 'uid']);
  const ex = String(pickFirst(m, ['excerpt', 'preview', 'intro', 'snippet']) || '') || stripTags(body).slice(0, 140);
  return {
    mail_id: String(id),
    mail_from: fromText(pickFirst(m, ['from', 'from_email', 'sender', 'from_address', 'mail_from'])) || 'Unknown',
    mail_subject: subject,
    mail_excerpt: ex,
    mail_timestamp: String(toEpoch(pickFirst(m, ['created_at', 'received_at', 'date', 'timestamp', 'time', 'createdAt']))),
    mail_body: body,
  };
}

async function mtJson(path, opts = {}, ms = 10000) {
  const r = await fetch(MT_BASE + path, {
    ...opts,
    headers: { Accept: 'application/json', 'User-Agent': UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(ms),
  });
  const text = await r.text();
  let j = null;
  try { j = JSON.parse(text); } catch { /* bukan JSON */ }
  if (!r.ok) {
    const e = new Error((j && (j.message || j.error)) || 'mTempMail HTTP ' + r.status);
    e.code = r.status;
    throw e;
  }
  if (j === null) throw Object.assign(new Error('mTempMail membalas bukan JSON'), { code: 502 });
  if (j.status === false) throw Object.assign(new Error(j.message || j.error || 'mTempMail menolak permintaan'), { code: 502 });
  return j;
}

/* ---------- aksi mTempMail (bentuk keluaran = Guerrilla) ---------- */
const mt = {
  async create() {
    const j = await mtJson('/emails/' + encodeURIComponent(mtKey()), { method: 'POST' });
    const d = j.data || j;
    const email = d.email || d.address;
    if (!email || !String(email).includes('@')) throw Object.assign(new Error('mTempMail tidak memberi alamat'), { code: 502 });
    return { email_addr: String(email), sid_token: String(email), site: 'mtempmail.com', expire_at: d.expire_at || null };
  },
  async inbox(email) {
    const j = await mtJson('/messages/' + encodeURIComponent(mtKey()) + '/' + encodeURIComponent(email));
    const list = findArray(j).map(normMsg).filter((m) => m.mail_id && m.mail_id !== 'undefined');
    list.forEach((m) => { m.mail_body = ''; }); // daftar tidak perlu isi penuh
    return { list, count: String(list.length), email, seq: 0 };
  },
  async read(email, id) {
    const j = await mtJson('/messages/' + encodeURIComponent(mtKey()) + '/' + encodeURIComponent(email));
    const raw = findArray(j).find((m) => String(pickFirst(m, ['id', 'message_id', 'uuid', 'mail_id', 'messageId', 'uid'])) === String(id));
    if (!raw) throw Object.assign(new Error('Pesan tidak ditemukan (mungkin sudah kedaluwarsa)'), { code: 404 });
    let msg = normMsg(raw);
    if (!msg.mail_body) {
      // daftar tanpa isi: coba endpoint detail umum, abaikan kalau tidak ada
      const tries = [
        '/messages/' + encodeURIComponent(mtKey()) + '/' + encodeURIComponent(email) + '/' + encodeURIComponent(id),
        '/message/' + encodeURIComponent(mtKey()) + '/' + encodeURIComponent(id),
      ];
      for (const p of tries) {
        try {
          const d = await mtJson(p, {}, 6000);
          const one = Array.isArray(findArray(d)) && findArray(d).length ? findArray(d)[0] : d.data || d;
          const n = normMsg({ ...raw, ...one });
          if (n.mail_body) { msg = n; break; }
        } catch { /* lanjut */ }
      }
    }
    if (!msg.mail_body) msg.mail_body = msg.mail_excerpt;
    return msg;
  },
  async del(email, id) {
    const p = '/messages/' + encodeURIComponent(mtKey()) + '/' + encodeURIComponent(email) + '/' + encodeURIComponent(id);
    try { await mtJson(p, { method: 'DELETE' }, 6000); return { deleted_ids: [String(id)], remote: true }; }
    catch { return { deleted_ids: [String(id)], remote: false }; } // frontend menyembunyikan lokal
  },
  async domains() {
    const j = await mtJson('/domains/' + encodeURIComponent(mtKey()) + '/all');
    const arr = (j.data && j.data.domains) || findArray(j);
    return arr.map((x) => (typeof x === 'string' ? x : x.domain)).filter(Boolean);
  },
};

/* ---------- cek kesehatan untuk dashboard admin ---------- */
async function pingGm() {
  const r = await fetch('https://api.guerrillamail.com/ajax.php?f=get_email_address&ip=127.0.0.1&agent=health', { signal: AbortSignal.timeout(5000) });
  return { ok: r.ok };
}
async function pingMt() {
  const d = await mt.domains();
  return { ok: d.length > 0, domains: d };
}
async function health() {
  const fns = { gm: pingGm, mt: pingMt };
  return Promise.all(LIST.map(async (p) => {
    const t0 = Date.now();
    try {
      const r = await fns[p.id]();
      return { id: p.id, name: p.name, site: p.site, ok: !!r.ok, ms: Date.now() - t0, domains: r.domains || [] };
    } catch (e) {
      return { id: p.id, name: p.name, site: p.site, ok: false, ms: Date.now() - t0, domains: [], err: String((e && e.message) || e).slice(0, 120) };
    }
  }));
}

module.exports = { LIST, ids, has, mt, health, normMsg, findArray };
