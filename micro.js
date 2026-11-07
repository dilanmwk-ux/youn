/* Microinteraction TempMail. Murni tambahan: tidak mengubah fungsi inti,
   hanya mengamati DOM dan menambah kelas animasi (CSS ada di site.css). */
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
    var bd = seg.closest('.dr');
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

/* Drawer hamburger. Index memakai markup statis; docs & login dibuat di sini
   supaya menunya identik. Juga: tutup saat anchor diketuk, geser kanan untuk menutup. */
(function () {
  var sb = document.getElementById('settingsBackdrop');
  var onIndex = !!sb, trig = null;
  var I = function (p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };

  if (!sb) {
    trig = document.querySelector('.sh-act a.icon-btn[href="/#pengaturan"]');
    if (!trig) return;
    var cur = location.pathname.replace(/\/$/, '');
    var nav = [
      ['/', 'Beranda', '<path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h3.5v-5h3V20H17a1 1 0 0 0 1-1v-9"/>'],
      ['/#fitur', 'Fitur', '<rect x="4" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6"/>'],
      ['/#cara', 'Cara kerja', '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="18" r="2.2"/><path d="M8.2 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.8"/>'],
      ['/#faq', 'FAQ', '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1.9-1.1 1.7"/><path d="M12 17v.01"/>'],
      ['/docs', 'API', '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 6l-3 12"/>']
    ].map(function (n) {
      return '<a href="' + n[0] + '"' + (n[0] === cur ? ' aria-current="page"' : '') + '>' + I(n[2]) + '<span>' + n[1] + '</span></a>';
    }).join('');
    var pin = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M12 21s-7-5.2-7-11a7 7 0 1 1 14 0c0 5.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>';
    var fish = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" width="13" height="13" aria-hidden="true"><path d="M3 12c3-4.5 7-6 11-4.5 2 .7 4 2.3 6 4.5-2 2.2-4 3.8-6 4.5-4 1.5-8 0-11-4.5z"/><circle cx="16" cy="11" r=".6"/></svg>';
    sb = document.createElement('div');
    sb.className = 'dr'; sb.id = 'settingsBackdrop'; sb.hidden = true;
    sb.innerHTML =
      '<div class="dr-panel" role="dialog" aria-modal="true" aria-label="Menu">' +
      '<div class="dr-bar"><a class="dr-brand" href="/"><svg width="24" height="24" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="7" width="26" height="18" rx="2"/><path d="M3 10l13 9 13-9"/></svg>TempMail</a>' +
      '<button type="button" class="icon-btn" id="btnCloseSettings" aria-label="Tutup"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" width="18" height="18" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="dr-body"><nav class="dr-nav" aria-label="Menu utama">' + nav + '</nav>' +
      '<div class="dr-sec"><div class="dr-label">Akun</div><a class="dr-link" href="/login">' + I('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/>') + '<span>Login</span></a></div>' +
      '<div class="dr-sec"><div class="dr-label">Kontak</div>' +
      '<a class="dr-link" href="mailto:muhammadfajar4p@gmail.com">' + I('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3.5 7.5l8.5 6 8.5-6"/>') + '<span>Email</span></a>' +
      '<a class="dr-link" href="https://t.me/amurax" target="_blank" rel="noopener noreferrer">' + I('<path d="M21 4L3 11l6 2.2L11.5 20l3-4.2L19 19.5z"/><path d="M9 13.2L21 4"/>') + '<span>Telegram</span></a></div>' +
      '<div class="dr-dev"><img class="dr-avatar" src="/dev.jpg" width="44" height="44" alt=""><div><div class="dr-name">JarZz <span class="dr-role">Developer</span></div>' +
      '<div class="dr-meta"><span>' + pin + '<span>Indonesia</span></span><span>' + fish + '<span>Hobi: memancing</span></span></div></div></div>' +
      '</div></div>';
    document.body.appendChild(sb);
    var closeBtn = sb.querySelector('#btnCloseSettings');
    var openD = function () {
      sb.hidden = false;
      requestAnimationFrame(function () { sb.classList.add('open'); });
      trig.setAttribute('aria-expanded', 'true');
      setTimeout(function () { closeBtn.focus({ preventScroll: true }); }, 60);
    };
    var closeD = function () {
      sb.classList.remove('open'); trig.setAttribute('aria-expanded', 'false');
      setTimeout(function () { if (!sb.classList.contains('open')) sb.hidden = true; }, 320);
    };
    window.__drClose = closeD;
    trig.addEventListener('click', function (e) { e.preventDefault(); openD(); });
    closeBtn.addEventListener('click', closeD);
    sb.addEventListener('click', function (e) { if (e.target === sb) closeD(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sb.classList.contains('open')) closeD(); });
  }

  function close() {
    if (onIndex) { if (typeof closeSettings === 'function') closeSettings(); }
    else if (window.__drClose) window.__drClose();
  }
  sb.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('.dr-nav a[href^="#"]');
    if (a) close();
  });

  var sh = sb.querySelector('.dr-panel');
  if (!sh) return;
  var sx = 0, sy = 0, dx = 0, drag = false, lock = null;
  sh.addEventListener('touchstart', function (e) {
    var t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; drag = true; lock = null;
  }, { passive: true });
  sh.addEventListener('touchmove', function (e) {
    if (!drag) return;
    var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
    if (lock === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      lock = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.3) ? 'x' : 'y';
      if (lock === 'x') sh.style.transition = 'none';
    }
    if (lock !== 'x') return;
    dx = Math.max(0, mx);
    sh.style.transform = 'translateX(' + dx + 'px)';
  }, { passive: true });
  function end() {
    if (!drag) return;
    drag = false;
    if (lock === 'x') {
      sh.style.transition = ''; sh.style.transform = '';
      if (dx > 80) close();
    }
    lock = null;
  }
  sh.addEventListener('touchend', end);
  sh.addEventListener('touchcancel', end);
})();
