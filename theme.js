(function () {
  var d = document.documentElement;
  try { localStorage.removeItem('tm_theme'); } catch (e) {}
  d.setAttribute('data-theme', 'light');
  var m = document.querySelector('meta[name="theme-color"]');
  if (!m && document.head) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
  if (m) m.content = '#0e1747';
})();
