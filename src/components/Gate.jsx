import { useEffect, useRef, useSyncExternalStore } from 'react';
import { blockStore, gateStore, runPowFromUi, setCfBox } from '../lib/api.js';
import { useLang } from '../lib/LangContext.jsx';
import { t } from '../lib/i18n.js';

/* Layar verifikasi captcha (Cloudflare Turnstile / verifikasi alternatif) */
export function Gate() {
  useLang();
  const g = useSyncExternalStore(gateStore.subscribe, gateStore.getSnapshot);
  const cfRef = useRef(null);

  useEffect(() => {
    setCfBox(cfRef.current);
    return () => setCfBox(null);
  }, []);

  return (
    <div className="gate" id="gate" hidden={!g.visible}>
      <div className="gate-card">
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <rect x="2" y="6" width="28" height="20" rx="3" stroke="currentColor" strokeWidth="2" />
          <path d="M2 10l14 9 14-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2>{t('verifyTitle')}</h2>
        <p>{t('verifyDesc')}</p>
        <div id="cfBox" ref={cfRef} />
        <p className="gate-err" id="gateErr">{g.err}</p>
        <button type="button" className="btn-ghost" id="gatePow" hidden={!g.showPow} onClick={runPowFromUi}>Verifikasi alternatif</button>
        <button type="button" className="btn-ghost" id="gateRetry" hidden={!g.showRetry} onClick={() => window.location.reload()}>{t('retry')}</button>
      </div>
    </div>
  );
}

/* Layar "akses ditolak" (VPN / bot) */
export function BlockScreen() {
  useLang();
  const b = useSyncExternalStore(blockStore.subscribe, blockStore.getSnapshot);
  return (
    <div className="gate block-scr" id="blockScr" hidden={!b.visible}>
      <div className="gate-card">
        <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <path d="M16 3l11 4v8c0 7-4.6 11.6-11 14C9.6 26.6 5 22 5 15V7l11-4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
          <path d="M11 11l10 10M21 11L11 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <h2 id="blockTitle">{b.title}</h2>
        <p id="blockMsg">{b.msg}</p>
        <button type="button" className="btn-ghost" id="blockRetry" onClick={() => window.location.reload()}>{t('reload')}</button>
      </div>
    </div>
  );
}
