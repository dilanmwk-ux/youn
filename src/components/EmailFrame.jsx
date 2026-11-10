import { useEffect, useRef } from 'react';
import { buildEmailDoc } from '../lib/emailDoc.js';

/*
  Isi email HTML ditampilkan di iframe ter-sandbox (tanpa allow-scripts):
  skrip dari pengirim tidak pernah berjalan. Iframe dibuat lewat DOM langsung
  supaya urutan atribut sandbox → srcdoc persis seperti versi HTML.
*/
export default function EmailFrame({ html }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const { html: doc } = buildEmailDoc(html, 'auto');
    const fr = document.createElement('iframe');
    // allow-same-origin hanya supaya aplikasi bisa memuat ulang gambar yang gagal.
    fr.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    fr.setAttribute('referrerpolicy', 'no-referrer');
    fr.setAttribute('title', 'Isi email');

    fr.addEventListener('load', () => {
      let d;
      try { d = fr.contentDocument; } catch { return; }
      if (!d) return;
      d.querySelectorAll('img').forEach((im) => {
        const giveUp = () => {
          // gagal total: ganti ikon rusak dengan teks alt (kalau ada)
          const alt = (im.getAttribute('alt') || '').trim();
          const sp = d.createElement('span');
          sp.textContent = alt;
          sp.style.cssText = 'color:inherit;font-weight:600';
          im.replaceWith(sp);
        };
        const retry = () => {
          const orig = im.getAttribute('data-orig');
          if (!orig || im.getAttribute('data-tried')) { giveUp(); return; }
          im.setAttribute('data-tried', '1');
          im.addEventListener('error', giveUp, { once: true });
          im.src = orig;
        };
        if (im.getAttribute('src') && im.complete && im.naturalWidth === 0) retry();
        else im.addEventListener('error', retry, { once: true });
      });
    });

    fr.srcdoc = doc;
    box.replaceChildren(fr);
    return () => box.replaceChildren();
  }, [html]);

  return <div className="sheet-content frame" id="sheetBody" ref={boxRef} />;
}
