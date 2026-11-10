import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header.jsx';
import { IconCaps } from '../components/icons.jsx';
import { restart } from '../lib/dom.js';

const SESSION_KEY = 'tm_adm';

function readToken() {
  try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}
function writeToken(v) {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, v);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* storage diblokir */ }
}

/* ---------- dashboard ---------- */
function Dashboard({ d, onRevoke, onLogout }) {
  const c = d.counters || {};
  const sum = (p) => Object.entries(c).filter(([k]) => k.startsWith(p)).reduce((a, [, v]) => a + v, 0);
  const up = Math.round((Date.now() - d.since) / 60000);
  const tiles = [
    ['Permintaan inbox', sum('gm:')],
    ['Live stream', c.stream || 0],
    ['Panggilan API v1', sum('v1:')],
    ['Kunci dibuat', Math.max(c.apikey || 0, d.keys.length)],
    ['Penyedia email', (d.upstream.ok ? 'OK ' : 'Down ') + d.upstream.ms + ' ms'],
    ['Instance aktif', up + ' mnt'],
  ];
  const rows = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  const k = d.config;
  const cfg = [
    ['Penyimpanan permanen (Upstash)', d.persistent],
    ['Captcha Turnstile', k.captcha],
    ['Shield anti-bot', k.shield],
    ['Blokir VPN/proxy', k.vpnBlock],
    ['API key (API_SECRET)', k.apiKeys],
  ];

  return (
    <div id="db">
      <div className="row sb"><h1>Ringkasan</h1><button className="bt g" id="out" onClick={onLogout}>Keluar</button></div>
      <div className="grid mt" id="tl">
        {tiles.map(([a, b]) => (
          <div className="cd" key={a}><div className="tg">{a}</div><div className="n">{b}</div></div>
        ))}
      </div>

      <h2>Aktivitas per jenis</h2>
      <div className="cd">
        <div id="ch" className="bars" role="img" aria-label="Grafik aktivitas">
          {rows.length ? rows.map((r) => (
            <div key={r[0]}>
              <div className="bar-top"><span>{r[0]}</span><b>{r[1]}</b></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: Math.max(1, (r[1] / mx) * 100) + '%' }} /></div>
            </div>
          )) : <p className="sm">Belum ada aktivitas</p>}
        </div>
      </div>

      <h2>API key</h2>
      <div className="cd" id="ks">
        {d.keys.length ? (
          <div className="tw">
            <table>
              <tbody>
                {d.keys.map((x) => {
                  const rv = d.revoked.includes(x.i);
                  return (
                    <tr key={x.i}>
                      <td><code>{x.i}</code></td>
                      <td>{x.n}</td>
                      <td>{new Date(x.t).toLocaleDateString('id-ID')}</td>
                      <td>{rv ? 'dicabut' : <button className="bt s" data-rv={x.i} onClick={() => onRevoke(x.i)}>Cabut</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : 'Belum ada kunci tercatat.'}
      </div>

      <h2>Konfigurasi</h2>
      <div className="cd" id="cf">
        {cfg.map(([a, b]) => (
          <div key={a}><span className={'dot ' + (b ? 'y' : 'x')} />{a} — {b ? 'aktif' : 'mati'}</div>
        ))}
        {d.kv && d.kv.ok
          ? <p className="sm">Redis terhubung. Kunci &amp; angka tersimpan permanen.</p>
          : <p className="sm err">Redis TIDAK tersambung: {(d.kv && d.kv.err) || 'env belum diisi'}. Selama ini merah, kunci &amp; angka tidak akan tercatat.</p>}
      </div>

      <h2>Kejadian terbaru</h2>
      <div className="cd ev" id="ev">
        {d.events.length
          ? d.events.map((e, i) => (
            <div key={i}>{new Date(e.t).toLocaleTimeString('id-ID')} · {e.k} {e.m}</div>
          ))
          : 'Belum ada.'}
      </div>
    </div>
  );
}

/* ---------- halaman ---------- */
export default function Login() {
  const [token, setToken] = useState(readToken);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [pw, setPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const pwRef = useRef(null);
  const cardRef = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  useEffect(() => {
    document.title = 'Login — TempMail';
    let meta = document.querySelector('meta[name="robots"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'robots';
      document.head.appendChild(meta);
    }
    const prev = meta.content;
    meta.content = 'noindex';
    return () => {
      if (created) meta.remove();
      else meta.content = prev;
    };
  }, []);

  /* keluar: bersihkan sesi lalu tampilkan form login */
  const logout = (msg) => {
    writeToken('');
    setToken('');
    setData(null);
    setErr(msg || '');
    setShowPw(false);
  };

  const load = async (tk) => {
    try {
      const r = await fetch('/api/admin', { headers: { Authorization: 'Bearer ' + tk } });
      if (r.status === 401 || r.status === 503) {
        const j = await r.json();
        if (tokenRef.current === tk) logout(j.error);
        return;
      }
      const j = await r.json();
      if (tokenRef.current === tk) setData(j);
    } catch { /* jaringan putus: coba lagi di putaran berikutnya */ }
  };

  /* ambil data sekarang, lalu tiap 10 detik selama tab terlihat */
  useEffect(() => {
    if (!token) return undefined;
    load(token);
    const id = setInterval(() => { if (!document.hidden) load(token); }, 10000);
    const onVis = () => { if (!document.hidden) load(token); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (m) => {
    setErr(m);
    restart(cardRef.current, 'shake');
    if (pwRef.current) pwRef.current.focus();
  };

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!pw) return fail('Masukkan password dulu');
    setBusy(true);
    try {
      const r = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      });
      const j = await r.json();
      if (!r.ok) return fail(j.error || 'Password salah');
      writeToken(j.token);
      setPw('');
      setToken(j.token);
    } catch {
      fail('Gagal terhubung. Periksa koneksi lalu coba lagi.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (i) => {
    try {
      await fetch('/api/admin?r=revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ i }),
      }).then((x) => x.json());
    } catch { /* abaikan, data dimuat ulang di bawah */ }
    load(token);
  };

  const capsChk = (e) => { if (e.getModifierState) setCaps(!!e.getModifierState('CapsLock')); };

  const loggedIn = !!token && !!data;

  return (
    <>
      <Header variant="page" path="/login" />
      <main className="page">
        <div id="lg" className="lgin" hidden={loggedIn}>
          <div className="cd login lgin-card" ref={cardRef}>
            <div className="lgin-ico" aria-hidden="true">
              <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="21" width="30" height="21" rx="6" />
                <path className="shackle" d="M16 21v-5.5a8 8 0 0 1 16 0V21" />
                <circle cx="24" cy="31" r="2.6" />
                <path d="M24 33.6V37" />
              </svg>
            </div>
            <h1>Masuk pengelola</h1>
            <p className="lgin-sub">Halaman ini khusus untuk pengelola TempMail.</p>
            <label htmlFor="pw">Password</label>
            <div className="pw-field">
              <input
                id="pw"
                ref={pwRef}
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Masukkan password"
                autoCapitalize="off"
                spellCheck={false}
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                onKeyDown={(e) => { capsChk(e); if (e.key === 'Enter') submit(); }}
                onKeyUp={capsChk}
                onBlur={() => setCaps(false)}
              />
              <button
                type="button"
                className="pw-eye"
                id="eye"
                aria-label={showPw ? 'Sembunyikan password' : 'Tampilkan password'}
                aria-pressed={showPw ? 'true' : 'false'}
                onClick={() => { setShowPw((v) => !v); if (pwRef.current) pwRef.current.focus(); }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
                  <circle cx="12" cy="12" r="2.8" />
                  <path className="slash" d="M4 4l16 16" />
                </svg>
              </button>
            </div>
            <p className="caps" id="caps" hidden={!caps}><IconCaps />Caps Lock aktif</p>
            <button className={'bt lgin-go' + (busy ? ' loading' : '')} id="go" disabled={busy} onClick={submit}>
              <span className="go-lbl">Masuk</span><span className="spin" aria-hidden="true" />
            </button>
            <p id="er" className="lgin-err" role="alert">{err}</p>
          </div>
        </div>

        {loggedIn && <Dashboard d={data} onRevoke={revoke} onLogout={() => logout('')} />}
      </main>
    </>
  );
}
