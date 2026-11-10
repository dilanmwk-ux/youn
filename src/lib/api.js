import { store, TOKEN_KEY } from './storage.js';

/* ===== Layar "akses ditolak" (store kecil supaya komponen React bisa berlangganan) ===== */
const BLOCK_TEXT = {
  vpn: ['VPN / proxy terdeteksi', 'Matikan VPN, proxy, atau DNS pribadi Anda lalu muat ulang halaman ini.'],
  bot: ['Trafik otomatis terdeteksi', 'Permintaan Anda terlihat seperti bot. Buka lewat browser atau aplikasi biasa.'],
};

function makeStore(initial) {
  let snap = initial;
  const subs = new Set();
  return {
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    getSnapshot() { return snap; },
    set(patch) { snap = { ...snap, ...patch }; subs.forEach((fn) => fn()); },
  };
}

export const blockStore = makeStore({ visible: false, title: 'Akses ditolak', msg: '' });
export function showBlock(reason) {
  const [title, msg] = BLOCK_TEXT[reason] || BLOCK_TEXT.bot;
  blockStore.set({ visible: true, title, msg });
}

/* ===== Fetch JSON dengan penanganan blokir / rate limit / captcha ===== */
export async function fetchJson(url, ms = 12000, headers = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  headers = { ...headers, 'x-tm-wd': navigator.webdriver ? '1' : '0' };
  try {
    const res = await fetch(url, { method: 'GET', credentials: 'omit', signal: ctrl.signal, cache: 'no-store', headers });
    if (res.status === 403) {
      const j = await res.json().catch(() => ({}));
      if (j.error === 'blocked') {
        showBlock(j.reason);
        const err = new Error('Akses ditolak');
        err.blocked = true;
        throw err;
      }
    }
    if (res.status === 429) {
      const err = new Error('Terlalu banyak permintaan, tunggu sebentar');
      err.rate = true;
      throw err;
    }
    if (res.status === 401) {
      const err = new Error('Verifikasi diperlukan');
      err.captcha = true;
      throw err;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('Koneksi lambat, coba lagi');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/* ===== Token captcha ===== */
let memTok = null; // cadangan jika localStorage diblokir (mode privat / browser dalam aplikasi)
export function getTok() {
  if (memTok && memTok.exp > Date.now()) return memTok.t;
  try {
    const o = JSON.parse(store.get(TOKEN_KEY) || 'null');
    if (o && o.exp > Date.now()) return o.t;
  } catch { /* abaikan */ }
  return '';
}

function setTok(t) {
  memTok = { t, exp: Date.now() + 11 * 3600 * 1000 };
  store.set(TOKEN_KEY, JSON.stringify({ t, exp: Date.now() + 11 * 3600 * 1000 }));
}

export function proxyUrl(u) {
  const t = getTok();
  return '/api/proxy?url=' + encodeURIComponent(u) + (t ? '&t=' + encodeURIComponent(t) : '');
}

/* ===== Captcha (Cloudflare Turnstile) ===== */
export const gateStore = makeStore({ visible: false, err: '', showRetry: false, showPow: false });
let cfBoxEl = null;
export const setCfBox = (el) => { cfBoxEl = el; };
let powAction = null;
export const runPowFromUi = () => { if (powAction) powAction(); };

function loadTurnstile() {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    let tries = 0;
    const add = () => {
      const sc = document.createElement('script');
      sc.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      sc.async = true;
      sc.defer = true;
      let to = setTimeout(() => { sc.remove(); retry(); }, 10000);
      const retry = () => {
        if (++tries < 3) return setTimeout(add, 1200 * tries);
        reject(new Error('Gagal memuat captcha'));
      };
      sc.onload = () => { clearTimeout(to); window.turnstile ? resolve() : retry(); };
      sc.onerror = () => { clearTimeout(to); sc.remove(); retry(); };
      document.head.appendChild(sc);
    };
    add();
  });
}

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|TikTok|musical_ly|Snapchat|MicroMessenger|; wv\)/i.test(navigator.userAgent);
function captchaHint(code) {
  code = String(code || '');
  let h = 'Coba buka lewat Chrome/Safari, matikan VPN, Private DNS, AdBlock, atau mode hemat data.';
  if (/^110[1-3]/.test(code)) h = 'Pengaturan captcha di server belum cocok (domain/site key). Hubungi pemilik web.';
  else if (/^1106/.test(code)) h = 'Jam HP belum akurat. Aktifkan "Tanggal & waktu otomatis" lalu muat ulang.';
  if (IN_APP) h = 'Kamu membuka lewat browser dalam aplikasi. Buka link ini di Chrome/Safari. ' + h;
  return h;
}

async function solvePow(c, bits, onProg) {
  if (!(window.crypto && crypto.subtle)) throw new Error('Browser tidak mendukung verifikasi alternatif');
  const enc = new TextEncoder();
  const BATCH = 256;
  let n = 0;
  for (;;) {
    const jobs = [];
    for (let i = 0; i < BATCH; i++) jobs.push(crypto.subtle.digest('SHA-256', enc.encode(c + ':' + (n + i))));
    const out = await Promise.all(jobs);
    for (let i = 0; i < BATCH; i++) {
      const h = new Uint8Array(out[i]);
      let left = bits, ok = true;
      for (let k = 0; left > 0; k++) {
        const m = left >= 8 ? 0xff : (0xff << (8 - left)) & 0xff;
        if (h[k] & m) { ok = false; break; }
        left -= 8;
      }
      if (ok) return String(n + i);
    }
    n += BATCH;
    if (onProg) onProg(n);
    await new Promise((r) => setTimeout(r, 0));
  }
}

function showGate(siteKey, fallback) {
  return new Promise((resolve) => {
    gateStore.set({ visible: true, err: '', showRetry: false, showPow: false });
    let wid = null, errs = 0, powBusy = false, finished = false;

    const clearBox = () => { if (cfBoxEl) cfBoxEl.replaceChildren(); };

    const finish = (tok) => {
      if (finished) return;
      finished = true;
      setTok(tok);
      gateStore.set({ visible: false });
      resolve();
    };
    const fail = (msg) => {
      gateStore.set({ err: msg, showRetry: true, showPow: !!fallback });
    };

    const runPow = async () => {
      if (powBusy || finished) return;
      powBusy = true;
      gateStore.set({ showPow: false, showRetry: false });
      try { if (wid !== null) window.turnstile.remove(wid); } catch { /* abaikan */ }
      clearBox();
      gateStore.set({ err: 'Memverifikasi perangkat…' });
      try {
        const cr = await fetch('/api/verify?pow=1', { cache: 'no-store', credentials: 'omit' });
        if (cr.status === 403) {
          const j = await cr.json().catch(() => ({}));
          if (j.error === 'blocked') { gateStore.set({ visible: false }); return showBlock(j.reason); }
        }
        if (!cr.ok) throw new Error('Verifikasi alternatif tidak tersedia');
        const ch = await cr.json();
        const n = await solvePow(ch.c, ch.bits, () => {});
        const r = await fetch('/api/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pow: { c: ch.c, n } }),
          credentials: 'omit',
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 403 && j.error === 'blocked') { gateStore.set({ visible: false }); return showBlock(j.reason); }
        if (r.status === 429) throw new Error('Terlalu banyak percobaan, tunggu sebentar');
        if (!r.ok || !j.ok) throw new Error(j.error || 'Verifikasi alternatif gagal');
        finish(j.token);
      } catch (e) {
        powBusy = false;
        fail(e.message || 'Verifikasi gagal');
      }
    };
    powAction = runPow;

    if (!siteKey) {
      if (fallback) return runPow();
      return fail('Captcha belum dikonfigurasi (TURNSTILE_SITE_KEY kosong).');
    }

    loadTurnstile().then(() => {
      clearBox();
      wid = window.turnstile.render(cfBoxEl || '#cfBox', {
        sitekey: siteKey,
        retry: 'auto',
        'retry-interval': 3000,
        'refresh-expired': 'auto',
        'refresh-timeout': 'auto',
        language: 'auto',
        theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
        callback: async (tk) => {
          try {
            const r = await fetch('/api/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: tk }),
              credentials: 'omit',
            });
            const j = await r.json().catch(() => ({}));
            if (r.status === 403 && j.error === 'blocked') { gateStore.set({ visible: false }); return showBlock(j.reason); }
            if (r.status === 429) throw new Error('Terlalu banyak percobaan, tunggu sebentar');
            if (!r.ok || !j.ok) throw new Error(j.error || 'Verifikasi gagal, coba lagi');
            finish(j.token);
          } catch (e) {
            gateStore.set({ err: e.message });
            try { window.turnstile.reset(wid); } catch { /* abaikan */ }
          }
        },
        'error-callback': (code) => {
          errs++;
          gateStore.set({
            err: 'Captcha error' + (code ? ' (' + code + ')' : '') + '. ' + captchaHint(code),
            showRetry: true,
          });
          if (fallback) {
            gateStore.set({ showPow: true });
            if (errs >= 2) runPow(); // otomatis pindah ke verifikasi alternatif
          }
          return true; // true = biarkan Turnstile mengulang otomatis
        },
        'timeout-callback': () => { try { window.turnstile.reset(wid); } catch { /* abaikan */ } },
        'expired-callback': () => { try { window.turnstile.reset(wid); } catch { /* abaikan */ } },
      });
    }).catch((e) => {
      if (fallback) return runPow();
      fail(e.message);
    });
  });
}

let gatePromise = null;
export function ensureCaptcha(force = false) {
  if (!force && getTok()) return Promise.resolve();
  if (gatePromise) return gatePromise;
  gatePromise = (async () => {
    const cfg = await fetchJson('/api/verify');
    if (!cfg.enabled) return; // captcha dimatikan di server
    store.del(TOKEN_KEY); memTok = null;
    await showGate(cfg.siteKey, !!cfg.fallback);
  })().finally(() => { gatePromise = null; });
  return gatePromise;
}

/* ===== Panggilan ke /api/gm ===== */
export async function gmFetch(params, sid) {
  const q = new URLSearchParams(params);
  if (sid) q.set('sid_token', sid);
  const call = () => fetchJson(`/api/gm?${q}`, 12000, { 'x-tm-token': getTok() });
  try {
    return await call();
  } catch (e) {
    if (!e.captcha) throw e;
    await ensureCaptcha(true);
    return await call();
  }
}
