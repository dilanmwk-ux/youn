import { useEffect, useRef } from 'react';
import { restart, shakeLastButton } from '../lib/dom.js';

/* Toast: garis sisa waktu; kalau galat, tombol yang baru ditekan bergetar */
export default function Toast({ toast }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!toast.id) return;
    restart(ref.current, 'tick');
    if (toast.type === 'err') shakeLastButton();
  }, [toast.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={'toast' + (toast.show ? ' show' : '') + (toast.type ? ' ' + toast.type : '')} id="toast" role="status" ref={ref}>
      {toast.msg}
    </div>
  );
}
