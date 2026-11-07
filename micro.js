(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) {} }
  function watch(el, opts, fn) { if (el) new MutationObserver(fn).observe(el, opts); }

  /* Getar tipis di HP saat tombol utama ditekan, dan catat tombol terakhir (untuk efek bergetar) */
  var lastBtn = null, lastAt = 0;
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button,.hb,.bt,.act');
    if (!b) return;
    lastBtn = b; lastAt = Date.now();
    if (b.matches('.act,.btn-solid,.bt') || b.closest('.toggle')) buzz(8);
  }, true);

  /* Tombol Baru: ikon berputar sekali */
  var btnNew = $('#btnNew');
  if (btnNew) btnNew.addEventListener('click', function () {
    btnNew.classList.remove('turn'); void btnNew.offsetWidth; btnNew.classList.add('turn');
    setTimeout(function () { btnNew.classList.remove('turn'); }, 650);
  });

  /* Salin: ikon jadi centang tergambar + cincin di kotak alamat */
  var btnCopy = $('#btnCopy');
  if (btnCopy) {
    var ico = $('svg', btnCopy), icoOrig = ico ? ico.innerHTML : '';
    var CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>';
    watch(btnCopy, { attributes: true, attributeFilter: ['class'] }, function () {
      if (!ico) return;
      var on = btnCopy.classList.contains('copied');
      if (on && !ico.classList.contains('tick-ico')) {
        ico.innerHTML = CHECK; ico.classList.add('tick-ico');
        var box = $('#emailBox'); if (box) restart(box, 'flash');
      } else if (!on && ico.classList.contains('tick-ico')) {
        ico.classList.remove('tick-ico'); ico.innerHTML = icoOrig;
      }
    });
  }

  /* Alamat berganti: teks muncul seperti diketik */
  var addr = $('#emailAddress');
  if (addr && !reduce) {
    var lastAddr = addr.textContent;
    watch(addr, { childList: true, characterData: true, subtree: true }, function () {
      var v = addr.textContent;
      if (v === lastAddr) return;
      lastAddr = v;
      if (v.indexOf('@') < 0) return; // "Menyiapkan…" tidak diketik
      addr.style.setProperty('--n', Math.min(v.length, 40));
      restart(addr, 'type');
    });
    addr.addEventListener('animationend', function (e) { if (e.animationName === 'type') addr.classList.remove('type'); });
  }

  /* Jumlah pesan: membal saat angka berubah */
  var cnt = $('#msgCount');
  if (cnt) {
    var lastCnt = cnt.textContent;
    watch(cnt, { childList: true, characterData: true, subtree: true }, function () {
      if (cnt.textContent === lastCnt) return;
      lastCnt = cnt.textContent; restart(cnt, 'bump');
    });
  }

  /* Pesan pertama / daftar baru dari kosong: baris masuk berurutan */
  var list = $('#inboxList');
  if (list) {
    var prev = 0;
    watch(list, { childList: true }, function () {
      var rows = $$('.msg', list);
      if (prev === 0 && rows.length) {
        rows.forEach(function (r, i) {
          if (r.classList.contains('new')) return;
          r.style.setProperty('--i', Math.min(i, 8)); r.classList.add('enter');
        });
      }
      prev = rows.length;
    });
  }

  /* Toast: garis sisa waktu; error → tombol terakhir yang ditekan bergetar */
  var toastEl = $('#toast');
  if (toastEl) watch(toastEl, { childList: true }, function () {
    restart(toastEl, 'tick');
    if (toastEl.classList.contains('err') && lastBtn && Date.now() - lastAt < 900 && !reduce) {
      var t = lastBtn.closest('.custom-row') || lastBtn;
      restart(t, 'shake');
      setTimeout(function () { t.classList.remove('shake'); }, 480);
      buzz([18, 40, 18]);
    }
  });

  /* Segmented bahasa: pil emas meluncur */
  $$('.seg').forEach(function (seg) {
    var pill = document.createElement('span');
    pill.className = 'seg-pill'; pill.setAttribute('aria-hidden', 'true');
    seg.insertBefore(pill, seg.firstChild);
    function place() {
      var a = $('button.active', seg);
      if (!a || !a.offsetWidth) return false;
      pill.style.width = a.offsetWidth + 'px';
      pill.style.height = a.offsetHeight + 'px';
      pill.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
      seg.classList.add('has-pill');
      return true;
    }
    function sync() {
      var first = !pill.classList.contains('on');
      if (place() && first) requestAnimationFrame(function () { requestAnimationFrame(function () { pill.classList.add('on'); }); });
    }
    $$('button', seg).forEach(function (b) { watch(b, { attributes: true, attributeFilter: ['class'] }, sync); });
    var bd = seg.closest('.sheet-backdrop');
    if (bd) watch(bd, { attributes: true, attributeFilter: ['hidden', 'class'] }, function () { setTimeout(sync, 30); });
    window.addEventListener('resize', function () { pill.classList.remove('on'); sync(); });
    sync();
  });

  /* Header: bayangan setelah digulir */
  var head = $('.site-head');
  if (head) {
    var tick = false;
    window.addEventListener('scroll', function () {
      if (tick) return; tick = true;
      requestAnimationFrame(function () { head.classList.toggle('scrolled', window.scrollY > 6); tick = false; });
    }, { passive: true });
  }

  /* docs/login: tombol yang teksnya berubah jadi "Tersalin" ikut berubah warna lalu kembali */
  $$('.bt').forEach(function (b) {
    var orig = b.textContent;
    watch(b, { childList: true, characterData: true, subtree: true }, function () {
      var v = b.textContent;
      if (!/^(tersalin|copied)/i.test(v) || b.classList.contains('copied')) return;
      b.classList.add('copied');
      setTimeout(function () { b.classList.remove('copied'); b.textContent = orig; }, 1600);
    });
  });
})();
