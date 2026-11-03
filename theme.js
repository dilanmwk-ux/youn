/* Tema bersama: dibaca sebelum render supaya tidak berkedip, dipakai semua halaman. */
(function () {
  var d = document.documentElement, t = null;
  try { t = localStorage.getItem('tm_theme'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') {
    t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  d.setAttribute('data-theme', t);

  function syncMeta() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    m.content = d.getAttribute('data-theme') === 'dark' ? '#12110d' : '#f3efe6';
  }
  syncMeta();
  new MutationObserver(syncMeta).observe(d, { attributes: true, attributeFilter: ['data-theme'] });

  /* Tombol tema di halaman selain beranda (beranda punya handler sendiri) */
  document.addEventListener('click', function (e) {
    if (!e.target.closest('[data-theme-toggle]')) return;
    var n = d.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    d.setAttribute('data-theme', n);
    try { localStorage.setItem('tm_theme', n); } catch (err) {}
  });
  addEventListener('storage', function (e) {
    if (e.key === 'tm_theme' && (e.newValue === 'light' || e.newValue === 'dark')) d.setAttribute('data-theme', e.newValue);
  });
})();
