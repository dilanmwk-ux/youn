/* Tema mengikuti pengaturan perangkat (terang/gelap). Dipakai semua halaman. */
(function () {
  var d = document.documentElement;
  var mq = matchMedia('(prefers-color-scheme: dark)');
  try { localStorage.removeItem('tm_theme'); } catch (e) {}

  function apply() {
    d.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    if (m) m.content = mq.matches ? '#000000' : '#ffffff';
  }
  apply();
  if (mq.addEventListener) mq.addEventListener('change', apply);
  else if (mq.addListener) mq.addListener(apply);
})();
