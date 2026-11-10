# TempMail (React + Vite)

Versi React dari `youn-main`. Tampilan, teks, API (`/api/*`), dan semua fitur sama seperti versi HTML.

## Struktur
- `src/pages/Home.jsx` — beranda: alamat, inbox, polling, live stream (SSE), pesan, username kustom
- `src/pages/Docs.jsx` — dokumentasi API + pembuat API key
- `src/pages/Login.jsx` — dashboard pengelola
- `src/components/` — Header, Drawer (menu samping), Gate (captcha), Toast, EmailFrame
- `src/lib/` — api (fetch/captcha), i18n (ID/EN), emailDoc (sanitasi email), dom (microinteraction)
- `api/` — fungsi serverless Vercel, **tidak diubah**
- `public/` — `theme.js`, `dev.jpg`

## Jalankan
```
npm install
npm run build      # hasil di dist/
vercel dev         # lokal, termasuk /api/*
```
Deploy ke Vercel: push seperti biasa. Vercel mendeteksi Vite otomatis (`vercel.json` sudah diatur,
termasuk rewrite `/docs` dan `/login`).
