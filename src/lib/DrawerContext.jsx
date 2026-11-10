import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const Ctx = createContext(null);

/* Status menu samping: hidden = belum ada di layar, open = sudah meluncur masuk. */
export function DrawerProvider({ children }) {
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const timer = useRef(0);

  const openD = useCallback(() => {
    clearTimeout(timer.current);
    openRef.current = true;
    setHidden(false);
    // dua frame supaya transisi geser benar-benar berjalan setelah elemen tampil
    requestAnimationFrame(() => requestAnimationFrame(() => { if (openRef.current) setOpen(true); }));
  }, []);

  const closeD = useCallback(() => {
    openRef.current = false;
    setOpen(false);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (!openRef.current) setHidden(true); }, 320);
  }, []);

  const value = useMemo(() => ({ hidden, open, openD, closeD }), [hidden, open, openD, closeD]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useDrawer = () => useContext(Ctx);
