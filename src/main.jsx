import { createRoot } from 'react-dom/client';
import './site.css';
import App from './App.jsx';

/* Sengaja tanpa <StrictMode>: aplikasi ini memulai sesi email & polling saat
   dibuka, dan StrictMode (mode dev) akan menjalankannya dua kali. */
createRoot(document.getElementById('root')).render(<App />);
