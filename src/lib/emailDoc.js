import { proxyUrl } from './api.js';

const BLOCKED_TAGS = 'script,iframe,frame,frameset,object,embed,applet,form,input,button,select,textarea,link,meta,base,audio,video,source,track,math,noscript,template,portal,foreignObject,use,animate,set,animateTransform';

// mode: 'none' = tidak ada gambar remote | 'proxy' = lewat server (IP tersembunyi) | 'direct' = langsung (IP terlihat)
export function remoteImg(u, mode, ctr) {
  u = String(u || '').trim().replace(/^['"]|['"]$/g, '');
  if (/^data:image\//i.test(u)) return u;
  if (u.startsWith('//')) u = 'https:' + u;
  if (/^http:\/\//i.test(u)) u = 'https://' + u.slice(7);
  if (!/^https:\/\//i.test(u)) return null;
  ctr.n++;
  if (mode === 'proxy' || mode === 'auto') return location.origin + proxyUrl(u);
  if (mode === 'direct') return u.replace(/["'()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return null;
}

function cleanCss(css, mode, ctr) {
  return String(css)
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\(([^)]*)\)/gi, (m, u) => {
      const p = remoteImg(u, mode, ctr);
      return p ? 'url("' + p + '")' : 'none';
    })
    .replace(/expression\s*\(/gi, '(');
}

export function buildEmailDoc(html, mode) {
  const ctr = { n: 0 };
  // DOMParser = dokumen inert: script tidak jalan & resource tidak dimuat saat parsing
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll(BLOCKED_TAGS).forEach((n) => n.remove());

  doc.querySelectorAll('style').forEach((st) => { st.textContent = cleanCss(st.textContent, mode, ctr); });

  doc.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) {
      const n = a.name.toLowerCase();
      const v = a.value;
      if (n.startsWith('on') || n === 'srcdoc' || n === 'formaction' || n === 'ping') {
        el.removeAttribute(a.name);
      } else if (n === 'background') {
        const pb = remoteImg(v, mode, ctr);
        if (pb) el.setAttribute('background', pb); else el.removeAttribute('background');
      } else if (n === 'style') {
        el.setAttribute('style', cleanCss(v, mode, ctr));
      } else if (n === 'href' || n === 'xlink:href') {
        if (!/^\s*(https?:|mailto:|tel:|#)/i.test(v)) el.removeAttribute(a.name);
      }
    }
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank');
      el.setAttribute('rel', 'noopener noreferrer nofollow');
    }
    if (el.tagName === 'IMG') {
      let src = (el.getAttribute('src') || '').trim();
      if (!src) {
        const ss = (el.getAttribute('srcset') || '').trim().split(',')[0] || '';
        src = ss.trim().split(/\s+/)[0] || '';
      }
      el.removeAttribute('srcset');
      const px = remoteImg(src, mode, ctr);
      if (px) {
        el.setAttribute('src', px);
        const dr = remoteImg(src, 'direct', { n: 0 });
        if (dr && mode === 'auto') el.setAttribute('data-orig', dr);
      } else el.removeAttribute('src');
      // alt berupa nama file / URL (mis. pixel pelacak) disembunyikan
      const alt = el.getAttribute('alt') || '';
      if (alt && !/\s/.test(alt) && /[.=?\/]/.test(alt)) el.setAttribute('alt', '');
      el.setAttribute('referrerpolicy', 'no-referrer');
    }
  });

  const imgSrc = mode === 'none' ? 'data:' : "data: https: 'self'";
  const styles = [...doc.head.querySelectorAll('style')].map((x) => x.outerHTML).join('');
  const out = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + imgSrc + '; style-src \'unsafe-inline\'">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<base target="_blank">'
    + '<style>html{background:#fff}body{margin:0;padding:14px 16px;color:#111;font:14px/1.55 system-ui,sans-serif;overflow-wrap:anywhere}img{max-width:100%!important;height:auto!important}table{max-width:100%!important}a{color:#000;text-decoration:underline}</style>'
    + styles + '</head><body>' + doc.body.innerHTML + '</body></html>';
  return { html: out, imgs: ctr.n };
}

