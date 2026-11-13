(function () {
  var d = document.documentElement;
  var mq = window.matchMedia && matchMedia('(prefers-color-scheme: dark)');
  var COLORS = { light: '#dde3db', dark: '#131917' };
  try { localStorage.removeItem('tm_theme'); } catch (e) {}
  function apply() {
    var t = mq && mq.matches ? 'dark' : 'light';
    d.setAttribute('data-theme', t);
    var m = document.querySelector('meta[name="theme-color"]');
    if (!m && document.head) { m = document.createElement('meta'); m.name = 'theme-color'; document.head.appendChild(m); }
    if (m) m.content = COLORS[t];
  }
  apply();
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply); }
})();
