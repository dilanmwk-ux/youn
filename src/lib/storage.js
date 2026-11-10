export const KEY = 'tm_sess_v2';
export const LANG_KEY = 'tm_lang';
export const TOKEN_KEY = 'tm_tok_v1';

export const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage diblokir */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* storage diblokir */ } },
};
