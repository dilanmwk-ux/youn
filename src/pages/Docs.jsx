import { useEffect, useRef, useState } from 'react';
import Header from '../components/Header.jsx';

/* Contoh respons — teks apa adanya dari dokumentasi lama */
const RES_KEY = `{
  "key": "tm_eyJpIjoiYTFiMmMzZDQiLCJuIjoiYXBwIiwidCI6MTc2MTkwMDAwMDAwMH0.Xk3m9QwP2LrT8vYbN1aZcg",
  "name": "app",
  "saved": true
}`;

const RES_NEW = `{
  "email_addr": "x7k2m9qa@guerrillamailblock.com",
  "email_timestamp": 1761900000,
  "alias": "x7k2m9qa",
  "site": "guerrillamail.com",
  "site_id": 10,
  "sid_token": "k2m9q7x8a1b3c4d5e6f7g8h9i0",
  "auth": { "success": true, "error_codes": [] }
}`;

const RES_SET = `{
  "email_addr": "budi@guerrillamailblock.com",
  "email_timestamp": 1761900120,
  "alias": "budi",
  "site": "guerrillamail.com",
  "site_id": 10,
  "sid_token": "k2m9q7x8a1b3c4d5e6f7g8h9i0",
  "auth": { "success": true, "error_codes": [] }
}`;

const RES_INBOX = `{
  "list": [
    {
      "mail_id": "412345678",
      "mail_from": "no-reply@contoh.com",
      "mail_subject": "Kode verifikasi kamu: 482913",
      "mail_excerpt": "Gunakan kode ini untuk masuk. Berlaku 10 menit…",
      "mail_timestamp": "1761900300",
      "mail_read": "0",
      "mail_date": "09:05:00",
      "att": "0",
      "mail_size": "2841"
    }
  ],
  "count": "1",
  "email": "budi@guerrillamailblock.com",
  "alias": "budi",
  "ts": 1761900120,
  "sid_token": "k2m9q7x8a1b3c4d5e6f7g8h9i0",
  "auth": { "success": true, "error_codes": [] }
}`;

const RES_READ = `{
  "mail_id": "412345678",
  "mail_from": "no-reply@contoh.com",
  "mail_recipient": "budi@guerrillamailblock.com",
  "mail_subject": "Kode verifikasi kamu: 482913",
  "mail_excerpt": "Gunakan kode ini untuk masuk. Berlaku 10 menit…",
  "mail_body": "<p>Gunakan kode <b>482913</b> untuk masuk.</p>",
  "mail_timestamp": "1761900300",
  "mail_date": "09:05:00",
  "mail_read": "1",
  "content_type": "html",
  "att": "0",
  "mail_size": "2841",
  "sid_token": "k2m9q7x8a1b3c4d5e6f7g8h9i0",
  "auth": { "success": true, "error_codes": [] }
}`;

const RES_DEL = `{
  "auth": { "success": true, "error_codes": [] },
  "deleted_ids": ["412345678"]
}`;

const ERRORS = [
  [400, '{ "error": "a harus salah satu dari: new, set, inbox, read, del" }', <>Parameter <code>a</code> salah atau kosong</>],
  [401, '{ "error": "API key tidak valid" }', <>Header <code>x-api-key</code> kosong atau salah</>],
  [401, '{ "error": "API key sudah dicabut" }', 'Key dicabut lewat admin'],
  [405, '{ "error": "Gunakan POST" }', 'Membuat key harus dengan POST'],
  [429, '{ "error": "Batas 60 permintaan/menit" }', 'Melewati batas per key'],
  [429, '{ "error": "Maksimal 5 kunci per jam" }', 'Terlalu sering membuat key'],
  [502, '{ "error": "Upstream gagal" }', 'Penyedia email tidak merespons'],
  [503, '{ "error": "API_SECRET belum diisi di server" }', 'Server belum dikonfigurasi'],
];

export default function Docs() {
  const [name, setName] = useState('');
  const [kyText, setKyText] = useState('');
  const [kyShown, setKyShown] = useState(false);
  const [caShown, setCaShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const keyRef = useRef('');
  const copyTimer = useRef(0);

  useEffect(() => {
    document.title = 'TempMail API — dokumentasi';
    return () => clearTimeout(copyTimer.current);
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const curl =
    'curl -H "x-api-key: tm_..." \\\n  "' + origin + '/api/v1?a=new"\n\n' +
    'curl -H "x-api-key: tm_..." \\\n  "' + origin + '/api/v1?a=inbox&sid=SID&seq=0"';

  const makeKey = async () => {
    try {
      const r = await fetch('/api/v1?a=key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      keyRef.current = j.key || '';
      setKyShown(true);
      setCaShown(!!j.key);
      setCopied(false);
      setKyText(
        (j.key || j.error) +
        (j.key && !j.saved ? '\n\n(Catatan: kunci berfungsi, tapi belum tercatat di admin karena penyimpanan Redis belum tersambung)' : '')
      );
    } catch {
      keyRef.current = '';
      setKyShown(true);
      setCaShown(false);
      setKyText('Gagal terhubung');
    }
  };

  const copyKey = async () => {
    const text = keyRef.current || kyText;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* abaikan */ }
      ta.remove();
    }
    setCopied(true);
    clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <Header variant="page" path="/docs" />
      <main className="page">
        <h1>API TempMail</h1>
        <p>Buat kotak masuk sementara dari skrip, bot, atau tes otomatis. Format REST + JSON, tanpa SDK. Kunci dibuat di halaman ini, tanpa daftar akun.</p>
        <nav className="toc" aria-label="Isi halaman">
          <a href="#kunci">Buat API key</a>
          <a href="#alur">Alur</a>
          <a href="#auth">Autentikasi</a>
          <a href="#endpoint">Endpoint</a>
          <a href="#contoh">Contoh respons</a>
          <a href="#galat">Galat</a>
          <a href="#stream">Live stream</a>
        </nav>

        <div className="cd docs-key" id="kunci">
          <b>Buat API key</b>
          <div className="row mt-s">
            <input
              id="nm"
              className="grow"
              placeholder="nama aplikasi (opsional)"
              maxLength={24}
              aria-label="Nama aplikasi"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="bt" id="mk" onClick={makeKey}>Buat kunci</button>
          </div>
          <pre id="ky" style={kyShown ? { display: 'block' } : undefined}>{kyText}</pre>
          <div className="row" id="ca" style={caShown ? { display: 'flex' } : undefined}>
            <button className={'bt g' + (copied ? ' copied' : '')} id="cp" onClick={copyKey}>{copied ? 'Tersalin' : 'Salin'}</button>
            <span className="sm">Simpan sekarang. Kunci tidak ditampilkan ulang.</span>
          </div>
        </div>

        <h2 id="alur">Alur</h2>
        <div className="tw">
          <svg className="flow" viewBox="0 0 640 70" role="img" aria-label="Alur: buat alamat, kirim email, ambil inbox, baca">
            <g fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="14" width="130" height="42" rx="6" />
              <rect x="170" y="14" width="130" height="42" rx="6" />
              <rect x="340" y="14" width="130" height="42" rx="6" />
              <rect x="508" y="14" width="130" height="42" rx="6" />
              <path d="M134 35h34M302 35h36M472 35h34M162 29l6 6-6 6M332 29l6 6-6 6M500 29l6 6-6 6" />
            </g>
            <g fontFamily="Geist Mono, ui-monospace, monospace" fontSize="13" fontWeight="700" fill="currentColor" textAnchor="middle">
              <text x="67" y="40">a=new</text>
              <text x="235" y="40">kirim email</text>
              <text x="405" y="40">a=inbox</text>
              <text x="573" y="40">a=read</text>
            </g>
          </svg>
        </div>

        <h2 id="auth">Autentikasi</h2>
        <p>Kirim header <code>x-api-key</code> di setiap permintaan. Batas 60 permintaan per menit per kunci.</p>

        <h2 id="endpoint">Endpoint</h2>
        <div className="tw">
          <table>
            <tbody>
              <tr><th>Aksi</th><th>Parameter</th><th>Fungsi</th></tr>
              <tr><td><code className="ok">GET ?a=new</code></td><td>—</td><td>Alamat baru + <code>sid_token</code></td></tr>
              <tr><td><code className="ok">GET ?a=set</code></td><td>sid, user</td><td>Ganti nama pengguna alamat</td></tr>
              <tr><td><code className="ok">GET ?a=inbox</code></td><td>sid, seq</td><td>Daftar email baru sejak seq</td></tr>
              <tr><td><code className="ok">GET ?a=read</code></td><td>sid, id</td><td>Isi email lengkap</td></tr>
              <tr><td><code className="ok">GET ?a=del</code></td><td>sid, id</td><td>Hapus email</td></tr>
            </tbody>
          </table>
        </div>
        <p>Basis: <code>/api/v1</code>. Semua respons berformat JSON (<code>Content-Type: application/json</code>).</p>

        <h2 id="contoh">Contoh respons JSON</h2>
        <p>Isi respons diteruskan apa adanya dari penyedia email (Guerrilla Mail), jadi nilainya berbeda tiap permintaan dan bisa ada field tambahan. Nilai di bawah hanya contoh.</p>

        <h3>POST ?a=key — buat API key</h3>
        <pre>{RES_KEY}</pre>
        <p className="sm">Simpan key sekarang. <code>saved: false</code> artinya key tetap berfungsi, tapi belum tercatat di admin karena Redis belum tersambung.</p>

        <h3>GET ?a=new — alamat baru</h3>
        <pre>{RES_NEW}</pre>
        <p className="sm">Simpan <code>sid_token</code>; dipakai di semua aksi berikutnya.</p>

        <h3>GET ?a=set&amp;sid=SID&amp;user=budi — ganti nama pengguna</h3>
        <pre>{RES_SET}</pre>

        <h3>GET ?a=inbox&amp;sid=SID&amp;seq=0 — daftar email</h3>
        <pre>{RES_INBOX}</pre>
        <p className="sm">Panggilan pertama biasanya berisi email sambutan dari penyedia. Untuk polling berikutnya, isi <code>seq</code> dengan <code>mail_id</code> terbesar yang sudah kamu terima. Kalau belum ada email baru, <code>list</code> kosong atau hanya berisi email sambutan.</p>

        <h3>GET ?a=read&amp;sid=SID&amp;id=412345678 — isi email lengkap</h3>
        <pre>{RES_READ}</pre>
        <p className="sm"><code>mail_body</code> berisi HTML mentah dari pengirim. Bersihkan dulu sebelum ditampilkan di aplikasimu.</p>

        <h3>GET ?a=del&amp;sid=SID&amp;id=412345678 — hapus email</h3>
        <pre>{RES_DEL}</pre>

        <h2 id="galat">Respons galat</h2>
        <p>Setiap galat berbentuk <code>{'{ "error": "pesan" }'}</code> dengan kode status HTTP yang sesuai.</p>
        <div className="tw">
          <table>
            <tbody>
              <tr><th>Status</th><th>Respons JSON</th><th>Penyebab</th></tr>
              {ERRORS.map(([status, json, cause], i) => (
                <tr key={i}><td>{status}</td><td><code>{json}</code></td><td>{cause}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 id="curl">Contoh perintah</h2>
        <pre id="ex">{curl}</pre>

        <h2 id="stream">Live stream</h2>
        <p>Aplikasi web memakai Server-Sent Events: <code>/api/stream?sid=…&amp;seq=…</code> mengirim event <code>mail</code> begitu email masuk, tanpa polling dari browser.</p>
      </main>
    </>
  );
}
