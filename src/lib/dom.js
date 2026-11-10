/* Pengganti micro.js: helper kecil untuk microinteraction. */
export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function restart(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

export function buzz(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch { /* tidak didukung */ }
}

/* Catat tombol terakhir yang ditekan (untuk efek bergetar saat galat) + getar tipis di HP */
let lastBtn = null;
let lastAt = 0;

export function installClickTracker() {
  const onClick = (e) => {
    const b = e.target.closest && e.target.closest('button,.hb,.bt,.act');
    if (!b) return;
    lastBtn = b;
    lastAt = Date.now();
    if (b.matches('.act,.btn-solid,.bt') || b.closest('.toggle')) buzz(8);
  };
  document.addEventListener('click', onClick, true);
  return () => document.removeEventListener('click', onClick, true);
}

export function shakeLastButton() {
  if (!lastBtn || Date.now() - lastAt >= 900 || reduceMotion()) return;
  const target = lastBtn.closest('.custom-row') || lastBtn;
  restart(target, 'shake');
  setTimeout(() => target.classList.remove('shake'), 480);
  buzz([18, 40, 18]);
}
