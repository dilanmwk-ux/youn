import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import { Gate, BlockScreen } from '../components/Gate.jsx';
import Toast from '../components/Toast.jsx';
import EmailFrame from '../components/EmailFrame.jsx';
import {
  LogoMark, IconCopy, IconCheck, IconRefresh, IconPlus, IconInbox, IconTrash, IconClose,
} from '../components/icons.jsx';
import { useDrawer } from '../lib/DrawerContext.jsx';
import { useLang } from '../lib/LangContext.jsx';
import { getLang, t } from '../lib/i18n.js';
import { KEY, store } from '../lib/storage.js';
import { ensureCaptcha, fetchJson, getTok, gmFetch, proxyUrl, showBlock } from '../lib/api.js';
import { brandDomain } from '../lib/brand.js';
import { reduceMotion, restart } from '../lib/dom.js';

/* ---------- helper kecil ---------- */
function fmtTime(ts) {
  const d = typeof ts === 'number' ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d)) return '';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t('justNow');
  if (diff < 3600) return Math.floor(diff / 60) + t('minAgo');
  if (diff < 86400) return Math.floor(diff / 3600) + t('hourAgo');
  const loc = getLang() === 'en' ? 'en-US' : 'id-ID';
  return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function initial(name) {
  if (!name) return '?';
  const p = name.trim().split(/[\s<@]+/);
  return (p[0][0] || '?').toUpperCase();
}

const byNewest = (a, b) => Number(b.mail_timestamp || 0) - Number(a.mail_timestamp || 0);

/* ---------- satu baris pesan ---------- */
function MsgAvatar({ from }) {
  const [src, setSrc] = useState(null);

  // ikon pengirim diambil lewat proxy server: IP kamu tidak terlihat oleh penyedia ikon
  useEffect(() => {
    const dom = brandDomain(from);
    if (!dom) return undefined;
    let dead = false;
    const im = new Image();
    im.decoding = 'async';
    im.referrerPolicy = 'no-referrer';
    im.onload = () => {
      if (dead || im.naturalWidth < 2) return;
      setSrc(im.src);
    };
    im.src = proxyUrl('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(dom) + '&sz=128');
    return () => { dead = true; im.onload = null; };
  }, [from]);

  return (
    <div className={'msg-av' + (src ? ' has-logo' : '')}>
      {src ? <img src={src} alt="" decoding="async" referrerPolicy="no-referrer" /> : initial(from)}
    </div>
  );
}

function MsgRow({ m, index, isNew, enter, onOpen }) {
  const from = m.mail_from || 'Unknown';
  return (
    <div
      className={'msg' + (isNew ? ' new' : '') + (enter ? ' enter' : '')}
      data-id={m.mail_id}
      style={enter ? { '--i': Math.min(index, 8) } : undefined}
      onClick={() => onOpen(m.mail_id)}
    >
      <MsgAvatar from={from} />
      <div className="msg-body">
        <div className="msg-row">
          <span className="msg-from">{from}</span>
          <span className="msg-time">{fmtTime(m.mail_timestamp)}</span>
        </div>
        <div className="msg-sub">{m.mail_subject || t('noSubject')}</div>
        <div className="msg-ex">{m.mail_excerpt || ''}</div>
      </div>
    </div>
  );
}

/* ---------- halaman ---------- */
export default function Home() {
  const { lang } = useLang(); // render ulang saat bahasa berganti
  const { openD } = useDrawer();

  /* status yang tidak perlu memicu render ulang: dipegang di ref */
  const S = useRef({
    sid: null, email: null, seq: 0, messages: [],
    auto: true, timer: null, fail: 0, healing: false, pollGen: 0,
  }).current;

  /* status yang tampil di layar */
  const [emailView, setEmailView] = useState({ kind: 'preparing', addr: '' });
  const [list, setList] = useState({ items: [], sig: '', seen: null, fresh: new Set(), first: false });
  const [sid, setSid] = useState(null);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [customVal, setCustomVal] = useState('');
  const [customBusy, setCustomBusy] = useState(false);
  const [toastState, setToastState] = useState({ id: 0, msg: '', type: '', show: false });
  const [sheet, setSheet] = useState({ hidden: true, open: false, from: '', subject: '', date: '', body: null });
  const [current, setCurrent] = useState('top');
  const [, setMinuteTick] = useState(0);

  const addrRef = useRef(null);
  const boxRef = useRef(null);
  const newBtnRef = useRef(null);
  const countRef = useRef(null);
  const customRef = useRef(null);
  const toastTimer = useRef(0);
  const toastSeq = useRef(0);
  const copyTimer = useRef(0);
  const currentIdRef = useRef(null);
  const booted = useRef(false);

  /* ---------- toast ---------- */
  const toast = (msg, type = '') => {
    toastSeq.current += 1;
    setToastState({ id: toastSeq.current, msg, type, show: true });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState((s) => ({ ...s, show: false })), 2400);
  };

  /* ---------- sesi ---------- */
  const assignSid = (v) => { S.sid = v; setSid(v); };
  const gm = (params) => gmFetch(params, S.sid);

  const save = () => {
    store.set(KEY, JSON.stringify({ sid: S.sid, email: S.email, seq: S.seq }));
  };

  const loadSession = () => {
    try {
      const raw = store.get(KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (!d.sid || !d.email) return false;
      S.sid = d.sid;
      S.email = d.email;
      S.seq = d.seq || 0;
      setSid(d.sid);
      return true;
    } catch {
      return false;
    }
  };

  const setEmailUI = (addr) => {
    S.email = addr;
    setEmailView({ kind: 'ready', addr });
  };

  /* Daftar pesan: ganti isinya, tandai pesan baru & animasi masuk pertama kali */
  const commitMessages = (items) => {
    S.messages = items;
    setList((cur) => {
      const sig = items.map((m) => m.mail_id).join(',');
      if (sig === cur.sig) return cur;
      const ids = items.map((m) => String(m.mail_id));
      const fresh = new Set();
      if (cur.seen) ids.forEach((id) => { if (!cur.seen.has(id)) fresh.add(id); });
      return {
        items,
        sig,
        seen: items.length ? new Set(ids) : cur.seen,
        fresh,
        first: cur.items.length === 0 && items.length > 0,
      };
    });
  };

  /* ---------- polling ---------- */
  const stopPoll = () => {
    S.pollGen++;
    if (S.timer) {
      clearTimeout(S.timer);
      S.timer = null;
    }
  };

  const startPoll = () => {
    stopPoll();
    S.fail = 0;
    if (!S.auto) return;
    const gen = ++S.pollGen;
    // Cepat saat inbox kosong (nunggu OTP), pelan sedikit kalau sudah ada pesan
    const tick = async () => {
      if (gen !== S.pollGen) return;
      if (!document.hidden) await checkMail(true);
      if (gen !== S.pollGen || !S.auto) return;
      S.timer = setTimeout(tick, S.fail >= 3 ? 8000 : S.messages.length === 0 ? 2000 : 4000);
    };
    S.timer = setTimeout(tick, 1500);
  };

  const healSession = async () => {
    if (S.healing || !S.email) return;
    S.healing = true;
    try {
      const d = await gm({ f: 'get_email_address', lang: 'en' });
      if (d.sid_token) assignSid(d.sid_token);
      const r = await gm({ f: 'set_email_user', email_user: S.email.split('@')[0], lang: 'en' });
      if (r.sid_token) assignSid(r.sid_token);
      save();
    } catch (e) {
      console.error(e);
    } finally {
      S.healing = false;
    }
  };

  const checkMail = async (silent = false) => {
    if (!S.sid) return;
    const curSid = S.sid;
    if (!silent) setSpinning(true);
    try {
      const data = await gm({ f: 'check_email', seq: S.seq });
      if (curSid !== S.sid) return; // sesi sudah diganti (tombol Baru), abaikan hasil lama
      if (data && Array.isArray(data.list)) {
        S.fail = 0;
        const map = new Map(S.messages.map((m) => [String(m.mail_id), m]));
        for (const m of data.list) {
          if (m.mail_id === 0 || m.mail_id === '0') continue; // welcome placeholder
          map.set(String(m.mail_id), m);
        }
        const merged = Array.from(map.values()).sort(byNewest);
        if (typeof data.seq !== 'undefined') S.seq = data.seq;
        save();
        commitMessages(merged);
      } else {
        throw new Error('Sesi tidak valid');
      }
    } catch (e) {
      if (curSid === S.sid && !e.blocked) {
        S.fail += 1;
        // sesi Guerrilla habis / balasan kosong: pasang ulang sesi & alamat yang sama
        if (!e.rate && S.fail >= 2 && S.fail % 2 === 0) healSession();
        // gagal berulang saat auto-refresh: beri tahu pengguna
        if (silent && S.fail === 3) toast(e.message || t('failInbox'), 'err');
      }
      if (!silent) toast(t('failInbox'), 'err');
      console.error(e);
    } finally {
      setSpinning(false);
    }
  };

  /* ---------- buat / ganti alamat ---------- */
  const createEmail = async () => {
    setEmailView({ kind: 'preparing', addr: '' });
    try {
      const data = await gm({ f: 'get_email_address', lang: 'en' });
      if (!data.email_addr || !data.sid_token) throw new Error('Invalid response');
      assignSid(data.sid_token);
      S.seq = 0;
      commitMessages([]);
      setEmailUI(data.email_addr);
      save();
      startPoll();
      toast(t('emailReady'), 'ok');
    } catch (e) {
      setEmailView({ kind: 'failCreate', addr: '' });
      toast(e.message || t('failConnect'), 'err');
      console.error(e);
    }
  };

  const setCustom = async (user) => {
    if (!S.sid) await createEmail();
    try {
      const data = await gm({ f: 'set_email_user', email_user: user, lang: 'en' });
      const addr = data.email_addr || `${user}@${(S.email || '').split('@')[1] || 'guerrillamailblock.com'}`;
      if (data.sid_token) assignSid(data.sid_token);
      S.seq = 0;
      commitMessages([]);
      setEmailUI(addr);
      save();
      startPoll();
      toast(t('usernameSet'), 'ok');
    } catch (e) {
      toast(e.message || t('failUser'), 'err');
      console.error(e);
    }
  };

  const restore = async () => {
    if (!loadSession()) return false;
    try {
      const data = await gm({ f: 'get_email_address', lang: 'en' });
      if (data.sid_token) assignSid(data.sid_token);
      // pasang lagi alamat kita bila sesi berputar
      if (S.email) {
        const user = S.email.split('@')[0];
        try { await gm({ f: 'set_email_user', email_user: user, lang: 'en' }); } catch { /* abaikan */ }
      }
      setEmailUI(S.email);
      await checkMail(true);
      startPoll();
      return true;
    } catch {
      store.del(KEY);
      assignSid(null);
      return false;
    }
  };

  /* ---------- pesan terbuka (sheet) ---------- */
  const openMsg = async (id) => {
    currentIdRef.current = id;
    setSheet({ hidden: false, open: false, from: t('loading'), subject: '', date: '', body: { type: 'loading' } });
    requestAnimationFrame(() => {
      if (currentIdRef.current === id) setSheet((s) => ({ ...s, open: true }));
    });

    try {
      const data = await gm({ f: 'fetch_email', email_id: id });
      if (currentIdRef.current !== id) return; // user sudah tutup / buka pesan lain
      const body = String(data.mail_body || data.mail_excerpt || t('emptyBody'));
      setSheet((s) => ({
        ...s,
        from: data.mail_from || '',
        subject: data.mail_subject || t('noSubject'),
        date: fmtTime(data.mail_timestamp),
        body: /<[a-z][\s\S]*>/i.test(body) ? { type: 'html', html: body } : { type: 'text', text: body },
      }));
    } catch (e) {
      if (currentIdRef.current !== id) return;
      setSheet((s) => ({ ...s, body: { type: 'error', message: e.message } }));
    }
  };

  const closeSheet = () => {
    setSheet((s) => ({ ...s, open: false }));
    currentIdRef.current = null;
    setTimeout(() => {
      if (currentIdRef.current !== null) return; // sudah buka pesan lain
      setSheet((s) => ({ ...s, hidden: true, body: null }));
    }, 220);
  };

  const deleteMsg = async () => {
    const delId = currentIdRef.current;
    if (!delId) return;
    const removeLocal = () => commitMessages(S.messages.filter((m) => String(m.mail_id) !== String(delId)));
    try {
      await gm({ f: 'del_email', 'email_ids[]': delId });
      removeLocal();
      closeSheet();
      toast(t('deleted'), 'ok');
    } catch {
      // tetap dihapus dari daftar walau API gagal
      removeLocal();
      closeSheet();
      toast(t('deletedLocal'), 'ok');
    }
  };

  /* ---------- aksi tombol ---------- */
  const onCopy = async () => {
    if (!S.email) return;
    try {
      await navigator.clipboard.writeText(S.email);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = S.email;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* abaikan */ }
      ta.remove();
    }
    setCopied(true);
    // alamat tersorot sebentar seperti teks terpilih
    const box = boxRef.current;
    if (box) {
      restart(box, 'flash');
      setTimeout(() => box.classList.remove('flash'), 850);
    }
    toast(t('copiedToast'), 'ok');
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1500);
  };

  const onNew = async () => {
    // ikon berputar sekali
    const nb = newBtnRef.current;
    if (nb) {
      restart(nb, 'turn');
      setTimeout(() => nb.classList.remove('turn'), 650);
    }
    stopPoll();
    store.del(KEY);
    assignSid(null);
    S.messages = [];
    S.seq = 0;
    await createEmail();
  };

  const onCustom = async () => {
    if (customBusy) return;
    let user = customVal.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (user.length < 3) {
      toast(t('minUser'), 'err');
      return;
    }
    if (user.length > 20) user = user.slice(0, 20);
    setCustomBusy(true);
    try {
      await setCustom(user);
      setCustomVal('');
    } finally {
      setCustomBusy(false);
    }
  };

  /* Username: huruf yang tidak boleh langsung dibuang dan kolom bergetar, jadi jelas apa yang diterima */
  const onCustomInput = (e) => {
    const raw = e.target.value;
    const clean = raw.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (clean !== raw && !reduceMotion()) {
      const f = e.target.closest('.field') || e.target;
      restart(f, 'shake');
      setTimeout(() => f.classList.remove('shake'), 480);
    }
    setCustomVal(clean);
  };

  const onAuto = (e) => {
    const on = e.target.checked;
    S.auto = on;
    setAuto(on);
    if (on) startPoll();
    else stopPoll();
  };

  /* ---------- efek ---------- */

  // Boot: cek bot/VPN dulu, lalu captcha, lalu pulihkan sesi atau buat alamat baru
  useEffect(() => {
    if (booted.current) return undefined;
    booted.current = true;
    (async () => {
      try {
        if (navigator.webdriver) return showBlock('bot');
        await fetchJson('/api/verify'); // cek bot / VPN lebih dulu, sebelum captcha
        await ensureCaptcha();
        const ok = await restore();
        if (!ok) await createEmail();
      } catch (e) {
        if (e.blocked) return;
        setEmailView({ kind: 'failConnect', addr: '' });
        toast(e.message || 'Error', 'err');
        console.error(e);
      }
    })();
    return () => stopPoll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Live stream (SSE): email masuk langsung muncul tanpa menunggu polling
  useEffect(() => {
    if (!sid) { setLive(false); return undefined; }
    const tk = getTok();
    const es = new EventSource('/api/stream?sid=' + encodeURIComponent(sid) + '&seq=' + S.seq + (tk ? '&t=' + encodeURIComponent(tk) : ''));
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.addEventListener('mail', (e) => {
      let d;
      try { d = JSON.parse(e.data); } catch { return; }
      if (!d || !Array.isArray(d.list)) return;
      const map = new Map(S.messages.map((m) => [String(m.mail_id), m]));
      d.list.forEach((m) => map.set(String(m.mail_id), m));
      const merged = Array.from(map.values()).sort(byNewest);
      if (d.seq) S.seq = d.seq;
      save();
      commitMessages(merged);
    });
    return () => { es.close(); setLive(false); };
  }, [sid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tab kembali terlihat → cek inbox sekarang juga
  useEffect(() => {
    const onVis = () => { if (!document.hidden && S.sid) checkMail(true); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Waktu relatif ("2 m") ikut diperbarui
  useEffect(() => {
    const id = setInterval(() => setMinuteTick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  // Bahasa → atribut <html lang> dan meta description
  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'id';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = lang === 'en' ? 'TempMail — fast & private temporary email' : 'TempMail — email sementara cepat & privat';
  }, [lang]);

  // Alamat baru ditulis huruf demi huruf
  useEffect(() => {
    const el = addrRef.current;
    if (!el || emailView.kind !== 'ready' || emailView.addr.indexOf('@') < 1 || reduceMotion()) return;
    el.style.setProperty('--n', Math.min(emailView.addr.length, 40));
    restart(el, 'type');
  }, [emailView.kind, emailView.addr]);

  // Jumlah pesan membal saat berubah; tab yang tidak dilihat menghitung email baru di judulnya
  const count = list.items.length;
  const lastN = useRef(0);
  const unread = useRef(0);
  const baseTitle = useRef('');
  useEffect(() => {
    baseTitle.current = document.title;
    const onVis = () => {
      if (!document.hidden && unread.current) { unread.current = 0; document.title = baseTitle.current; }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  useEffect(() => {
    const n = count;
    if (n === lastN.current) return;
    restart(countRef.current, 'bump');
    if (n > lastN.current && document.hidden) {
      unread.current += n - lastN.current;
      document.title = '(' + unread.current + ') ' + baseTitle.current;
    }
    lastN.current = n;
  }, [count]);

  // Esc menutup pesan
  useEffect(() => {
    if (!sheet.open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Menu header: garis bawah mengikuti bagian yang sedang dibaca
  useEffect(() => {
    const ids = ['cara', 'fitur', 'faq'];
    let tick = false;
    const spy = () => {
      let pick = 'top';
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 140) pick = id;
      }
      setCurrent(pick);
    };
    const onScroll = () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => { spy(); tick = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    spy();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Datang dari /#cara dst. (halaman lain) atau /#pengaturan (juga saat hash berubah di halaman ini)
  useEffect(() => {
    const handle = (initial) => {
      const h = window.location.hash;
      if (h === '#pengaturan') {
        window.history.replaceState(null, '', window.location.pathname);
        openD();
      } else if (initial && h.length > 1) {
        const el = document.getElementById(decodeURIComponent(h.slice(1)));
        if (el) el.scrollIntoView();
      }
    };
    handle(true);
    const onHash = () => handle(false);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- tampilan ---------- */
  const ready = emailView.kind === 'ready';
  const addr = emailView.addr;
  const at = addr.indexOf('@');
  const domainHint = ready && addr.includes('@') ? '@' + addr.split('@')[1] : '@…';
  const emailText = ready ? addr : t(emailView.kind);

  return (
    <>
      <div className="shell" id="top">
        <Header variant="index" current={current} />

        <main>
          <section className="container intro">
            <h1>{t('heroTitle')}</h1>
            <p className="lead">{t('heroDesc')}</p>
          </section>

          <section className="container" id="inbox">
            <div className="ws">
              <section className="addr-pane" aria-labelledby="addrLbl">
                <div className="pane-label"><span className="live-dot" /><span id="addrLbl">{t('activeAddress')}</span></div>
                <div className={'address-box' + (ready ? ' ready' : '')} id="emailBox" ref={boxRef}>
                  <code
                    id="emailAddress"
                    ref={addrRef}
                    onAnimationEnd={(e) => { if (e.animationName === 'type') e.currentTarget.classList.remove('type'); }}
                  >
                    {ready && at >= 1
                      ? (<><span className="u">{addr.slice(0, at)}</span><span className="d">{addr.slice(at)}</span></>)
                      : emailText}
                  </code>
                </div>
                <button type="button" className={'act primary' + (copied ? ' copied' : '')} id="btnCopy" disabled={!ready} onClick={onCopy}>
                  {copied ? <IconCheck key="ok" /> : <IconCopy key="cp" />}
                  <span id="copyLbl">{copied ? t('copied') : t('copy')}</span>
                </button>
                <div className="act-row">
                  <button type="button" className={'act' + (spinning ? ' spinning' : '')} id="btnRefresh" onClick={() => checkMail(false)}>
                    <IconRefresh />
                    <span>{t('check')}</span>
                  </button>
                  <button type="button" className="act" id="btnNew" ref={newBtnRef} onClick={onNew}>
                    <IconPlus />
                    <span>{t('new')}</span>
                  </button>
                </div>
                <details
                  className="cust"
                  id="custBox"
                  onToggle={(e) => {
                    if (e.currentTarget.open) setTimeout(() => customRef.current && customRef.current.focus({ preventScroll: true }), 120);
                  }}
                >
                  <summary>{t('customTitle')}</summary>
                  <div className="custom-row">
                    <div className="field">
                      <input
                        type="text"
                        id="customUser"
                        ref={customRef}
                        value={customVal}
                        onChange={onCustomInput}
                        onKeyDown={(e) => { if (e.key === 'Enter') onCustom(); }}
                        placeholder={t('username')}
                        maxLength={20}
                        autoComplete="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        aria-label="Username"
                      />
                      <span className="field-suffix" id="domainHint">{domainHint}</span>
                    </div>
                    <button type="button" className="btn-solid" id="btnCustom" disabled={customBusy} onClick={onCustom}>
                      {customBusy ? '…' : t('use')}
                    </button>
                  </div>
                  <p className="hint">{t('customHint')}</p>
                </details>
              </section>

              <section className="inbox-pane" aria-labelledby="inboxTtl">
                <div className="inbox-head">
                  <h2>
                    <span id="inboxTtl">{t('inbox')}</span>
                    <span className="count" id="msgCount" ref={countRef}>{count}</span>
                    <span id="liveB" className={live ? 'on' : undefined}><i />Live</span>
                  </h2>
                  <label className="toggle">
                    <input type="checkbox" id="autoRefresh" checked={auto} onChange={onAuto} />
                    <span className="toggle-ui" />
                    <span className="toggle-txt">{t('auto')}</span>
                  </label>
                </div>
                <div className="inbox-body" id="inboxList">
                  {count === 0 && (
                    <div className="empty" id="emptyState">
                      <IconInbox />
                      <p>{t('noMessages')}</p>
                      <span>{t('noMessagesHint')}</span>
                    </div>
                  )}
                  {list.items.map((m, i) => {
                    const id = String(m.mail_id);
                    const isNew = list.fresh.has(id);
                    return (
                      <MsgRow key={id} m={m} index={i} isNew={isNew} enter={list.first && !isNew} onOpen={openMsg} />
                    );
                  })}
                </div>
              </section>
            </div>
          </section>

          <section className="container sec" id="cara">
            <h2>{t('howTitle')}</h2>
            <ol className="steps">
              <li className="st"><span className="sn">1</span><h3>{t('s1_t')}</h3><p>{t('s1_d')}</p></li>
              <li className="st"><span className="sn">2</span><h3>{t('s2_t')}</h3><p>{t('s2_d')}</p></li>
              <li className="st"><span className="sn">3</span><h3>{t('s3_t')}</h3><p>{t('s3_d')}</p></li>
            </ol>
          </section>

          <section className="container sec" id="fitur">
            <h2>{t('featTitle')}</h2>
            <div className="fgrid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <article className="fc" key={n}><h3>{t(`f${n}_t`)}</h3><p>{t(`f${n}_d`)}</p></article>
              ))}
            </div>
          </section>

          <section className="container sec" id="faq">
            <h2>{t('faqTitle')}</h2>
            <div className="faq">
              {[1, 2, 3, 4].map((n) => (
                <details className="fq" key={n}><summary>{t(`q${n}_t`)}</summary><p>{t(`q${n}_d`)}</p></details>
              ))}
            </div>
          </section>

          <section className="container sec">
            <div className="cta-band">
              <div>
                <h2>{t('ctaBandTitle')}</h2>
                <p>{t('ctaBandDesc')}</p>
              </div>
              <a className="hb" href="/docs">{t('ctaApi')}</a>
            </div>
          </section>
        </main>

        <footer className="site-foot">
          <div className="container sf">
            <div>
              <a className="lg" href="#top"><LogoMark brand />TempMail</a>
              <p className="sf-d">{t('footDesc')}</p>
            </div>
            <nav aria-label="Tautan">
              <a href="#cara">{t('navHow')}</a>
              <a href="#fitur">{t('navFeatures')}</a>
              <a href="#faq">{t('navFaq')}</a>
              <a href="/docs">API</a>
            </nav>
          </div>
        </footer>
      </div>

      {/* Pesan terbuka */}
      <div
        className={'sheet-backdrop' + (sheet.open ? ' open' : '')}
        id="sheetBackdrop"
        hidden={sheet.hidden}
        onClick={(e) => { if (e.target === e.currentTarget) closeSheet(); }}
      >
        <div className="sheet" role="dialog" aria-modal="true">
          <div className="sheet-bar">
            <button type="button" className="icon-btn" id="btnCloseSheet" aria-label={t('close')} onClick={closeSheet}>
              <IconClose />
            </button>
          </div>
          <div className="sheet-meta">
            <div className="sheet-from" id="sheetFrom">{sheet.from}</div>
            <h3 className="sheet-subject" id="sheetSubject">{sheet.subject}</h3>
            <time className="sheet-date" id="sheetDate">{sheet.date}</time>
          </div>
          {sheet.body && sheet.body.type === 'html' ? (
            <EmailFrame html={sheet.body.html} />
          ) : (
            <div className="sheet-content" id="sheetBody">
              {sheet.body && sheet.body.type === 'loading' && <p style={{ color: 'var(--text-3)' }}>{t('loadingMsg')}</p>}
              {sheet.body && sheet.body.type === 'text' && <pre>{sheet.body.text}</pre>}
              {sheet.body && sheet.body.type === 'error' && <p style={{ color: 'var(--warn)' }}>{t('failLoad')}: {sheet.body.message}</p>}
            </div>
          )}
          <div className="sheet-foot">
            <button type="button" className="btn-ghost danger" id="btnDeleteMsg" onClick={deleteMsg}>
              <IconTrash />
              <span>{t('delete')}</span>
            </button>
          </div>
        </div>
      </div>

      <Gate />
      <BlockScreen />
      <Toast toast={toastState} />
    </>
  );
}
