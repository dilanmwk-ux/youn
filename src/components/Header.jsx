import { useEffect, useState } from 'react';
import { LogoMark, IconMenu } from './icons.jsx';
import { useDrawer } from '../lib/DrawerContext.jsx';
import { useLang } from '../lib/LangContext.jsx';
import { t } from '../lib/i18n.js';

/*
  variant="index": menu pakai anchor (#cara dst.), garis bawah mengikuti bagian yang dibaca (current).
  variant="page" : docs & login — menu mengarah ke beranda, teks selalu Bahasa Indonesia.
*/
export default function Header({ variant, current, path }) {
  const { open, openD } = useDrawer();
  useLang(); // render ulang saat bahasa berganti
  const [scrolled, setScrolled] = useState(false);

  /* Bayangan header setelah digulir */
  useEffect(() => {
    let tick = false;
    const onScroll = () => {
      if (tick) return;
      tick = true;
      requestAnimationFrame(() => { setScrolled(window.scrollY > 6); tick = false; });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isIndex = variant === 'index';
  const links = isIndex
    ? [['#top', t('navHome'), 'top'], ['#cara', t('navHow'), 'cara'], ['#fitur', t('navFeatures'), 'fitur'], ['#faq', t('navFaq'), 'faq'], ['/docs', 'API', null]]
    : [['/', 'Beranda'], ['/#cara', 'Cara pakai'], ['/#fitur', 'Fitur'], ['/#faq', 'FAQ'], ['/docs', 'API']];

  return (
    <header className={'site-head' + (scrolled ? ' scrolled' : '')}>
      <div className="container sh">
        <a className="lg" href="/">
          <LogoMark brand={isIndex} />
          {isIndex ? 'TempMail' : ' TempMail'}
        </a>
        <nav className="nvl" id="siteNav" aria-label="Menu utama">
          {links.map(([href, label, key]) => {
            let aria;
            if (isIndex) aria = key && current === key ? 'location' : undefined;
            else aria = href === path ? 'page' : undefined;
            return (
              <a key={href} href={href} aria-current={aria}>{label}</a>
            );
          })}
        </nav>
        <div className="sh-act">
          {isIndex ? (
            <button type="button" className="icon-btn" id="btnSettings" aria-label={t('settings')} aria-haspopup="dialog" onClick={openD}>
              <IconMenu />
            </button>
          ) : (
            <a
              className="icon-btn"
              href="/#pengaturan"
              aria-label="Menu"
              aria-expanded={open ? 'true' : 'false'}
              onClick={(e) => { e.preventDefault(); openD(); }}
            >
              <IconMenu />
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
