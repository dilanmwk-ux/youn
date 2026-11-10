import { useEffect } from 'react';
import Home from './pages/Home.jsx';
import Docs from './pages/Docs.jsx';
import Login from './pages/Login.jsx';
import Drawer from './components/Drawer.jsx';
import { DrawerProvider } from './lib/DrawerContext.jsx';
import { LangProvider } from './lib/LangContext.jsx';
import { installClickTracker } from './lib/dom.js';

/* Tiga halaman, sama seperti versi HTML: /, /docs, /login */
function currentRoute() {
  const p = window.location.pathname.replace(/\/+$/, '') || '/';
  if (p === '/docs' || p === '/docs.html') return 'docs';
  if (p === '/login' || p === '/login.html') return 'login';
  return 'home';
}

export default function App() {
  const route = currentRoute();

  useEffect(() => installClickTracker(), []);

  return (
    <LangProvider>
      <DrawerProvider>
        {route === 'docs' && <Docs />}
        {route === 'login' && <Login />}
        {route === 'home' && <Home />}
        <Drawer variant={route === 'home' ? 'index' : 'page'} path={route === 'docs' ? '/docs' : route === 'login' ? '/login' : '/'} />
      </DrawerProvider>
    </LangProvider>
  );
}
