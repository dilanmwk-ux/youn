import { useEffect, useRef } from 'react';
import {
  LogoMark, IconClose, IconHome, IconSteps, IconGrid, IconFaq, IconCode,
  IconLogin, IconMail, IconTelegram, FlagId, FlagEn,
} from './icons.jsx';
import { useDrawer } from '../lib/DrawerContext.jsx';
import { useLang } from '../lib/LangContext.jsx';
import { I18N, t } from '../lib/i18n.js';

/* Pilihan bahasa: pil meluncur ke pilihan yang aktif */
function LangSeg({ lang, setLang, drawerOpen }) {
  const segRef = useRef(null);
  const pillRef = useRef(null);

  useEffect(() => {
    const seg = segRef.current;
    const pill = pillRef.current;
    if (!seg || !pill) return undefined;
    let timer = 0;
    let raf = 0;

    const place = () => {
      const a = seg.querySelector('button.active');
      if (!a || !a.offsetWidth) return false;
      pill.style.width = a.offsetWidth + 'px';
      pill.style.height = a.offsetHeight + 'px';
      pill.style.transform = 'translate(' + a.offsetLeft + 'px,' + a.offsetTop + 'px)';
      seg.classList.add('has-pill');
      return true;
    };
    const sync = () => {
      const first = !pill.classList.contains('on');
      if (place() && first) {
        raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => pill.classList.add('on')); });
      }
    };
    const onResize = () => { pill.classList.remove('on'); sync(); };

    timer = setTimeout(sync, 30);
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    };
  }, [lang, drawerOpen]);

  return (
    <div className="lang-opts seg" ref={segRef}>
      <span className="seg-pill" ref={pillRef} aria-hidden="true" />
      <button type="button" className={'lang-opt' + (lang === 'id' ? ' active' : '')} data-lang="id" id="langId" onClick={() => setLang('id')}>
        <span className="flag" aria-hidden="true"><FlagId /></span>
        <span>Indonesia</span>
      </button>
      <button type="button" className={'lang-opt' + (lang === 'en' ? ' active' : '')} data-lang="en" id="langEn" onClick={() => setLang('en')}>
        <span className="flag" aria-hidden="true"><FlagEn /></span>
        <span>English</span>
      </button>
    </div>
  );
}

export default function Drawer({ variant, path }) {
  const { hidden, open, closeD } = useDrawer();
  const { lang, setLang } = useLang();
  const panelRef = useRef(null);
  const closeBtnRef = useRef(null);
  const isIndex = variant === 'index';
  const tt = isIndex ? t : (k) => I18N.id[k]; // docs & login selalu Bahasa Indonesia

  /* Esc menutup menu */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeD(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeD]);

  /* Di docs & login, fokus pindah ke tombol tutup saat menu terbuka */
  useEffect(() => {
    if (isIndex || !open) return undefined;
    const id = setTimeout(() => closeBtnRef.current && closeBtnRef.current.focus({ preventScroll: true }), 60);
    return () => clearTimeout(id);
  }, [open, isIndex]);

  /* Geser ke kanan untuk menutup */
  const touch = useRef({ sx: 0, sy: 0, dx: 0, drag: false, lock: null });
  const onTouchStart = (e) => {
    const p = e.touches[0];
    touch.current = { sx: p.clientX, sy: p.clientY, dx: 0, drag: true, lock: null };
  };
  const onTouchMove = (e) => {
    const s = touch.current;
    const sh = panelRef.current;
    if (!s.drag || !sh) return;
    const p = e.touches[0];
    const mx = p.clientX - s.sx;
    const my = p.clientY - s.sy;
    if (s.lock === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      s.lock = (mx > 0 && Math.abs(mx) > Math.abs(my) * 1.3) ? 'x' : 'y';
      if (s.lock === 'x') sh.style.transition = 'none';
    }
    if (s.lock !== 'x') return;
    s.dx = Math.max(0, mx);
    sh.style.transform = 'translateX(' + s.dx + 'px)';
  };
  const onTouchEnd = () => {
    const s = touch.current;
    const sh = panelRef.current;
    if (!s.drag) return;
    s.drag = false;
    if (s.lock === 'x' && sh) {
      sh.style.transition = '';
      sh.style.transform = '';
      if (s.dx > 80) closeD();
    }
    s.lock = null;
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) { closeD(); return; }
    // ketuk anchor di dalam beranda (#cara dst.) → menu menutup
    const a = e.target.closest && e.target.closest('.dr-nav a[href^="#"]');
    if (a) closeD();
  };

  const nav = isIndex
    ? [['#top', tt('navHome'), IconHome], ['#cara', tt('navHow'), IconSteps], ['#fitur', tt('navFeatures'), IconGrid], ['#faq', tt('navFaq'), IconFaq], ['/docs', 'API', IconCode]]
    : [['/', 'Beranda', IconHome], ['/#cara', 'Cara pakai', IconSteps], ['/#fitur', 'Fitur', IconGrid], ['/#faq', 'FAQ', IconFaq], ['/docs', 'API', IconCode]];

  return (
    <div className={'dr' + (open ? ' open' : '')} id="settingsBackdrop" hidden={hidden} onClick={onBackdropClick}>
      <div
        className="dr-panel"
        role="dialog"
        aria-modal="true"
        aria-label={isIndex ? tt('settings') : 'Menu'}
        ref={panelRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="dr-bar">
          <a className="dr-brand" href="/"><LogoMark size={24} />TempMail</a>
          <button type="button" className="icon-btn" id="btnCloseSettings" aria-label={tt('close')} ref={closeBtnRef} onClick={closeD}>
            <IconClose />
          </button>
        </div>
        <div className="dr-body">
          <nav className="dr-nav" aria-label="Menu utama">
            {nav.map(([href, label, Icon]) => (
              <a key={href} href={href} aria-current={!isIndex && href === path ? 'page' : undefined}>
                <Icon /><span>{label}</span>
              </a>
            ))}
          </nav>
          {isIndex && (
            <div className="dr-sec">
              <div className="dr-label">{tt('language')}</div>
              <LangSeg lang={lang} setLang={setLang} drawerOpen={open} />
            </div>
          )}
          <div className="dr-sec">
            <div className="dr-label">{tt('account')}</div>
            <a className="dr-link" href="/login"><IconLogin /><span>{tt('login')}</span></a>
          </div>
          <div className="dr-sec">
            <div className="dr-label">{tt('contact')}</div>
            <a className="dr-link" href="mailto:muhammadfajar4p@gmail.com"><IconMail /><span>{tt('emailLabel')}</span></a>
            <a className="dr-link" href="https://t.me/amurax" target="_blank" rel="noopener noreferrer"><IconTelegram /><span>Telegram</span></a>
          </div>
          <div className="dr-dev">
            <img className="dr-avatar" src="/dev.jpg" width="42" height="42" alt="" />
            <div>
              <div className="dr-name">JarZz <span className="dr-role">{tt('developer')}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
