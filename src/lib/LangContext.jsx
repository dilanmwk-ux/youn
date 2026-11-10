import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { I18N, setCurrentLang } from './i18n.js';
import { LANG_KEY, store } from './storage.js';

const Ctx = createContext({ lang: 'id', setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    let l = store.get(LANG_KEY) || 'id';
    if (!I18N[l]) l = 'id';
    setCurrentLang(l);
    return l;
  });

  const setLang = useCallback((l) => {
    if (!I18N[l]) return;
    setCurrentLang(l);
    store.set(LANG_KEY, l);
    setLangState(l);
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLang = () => useContext(Ctx);
