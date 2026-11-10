import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => { /* offline cache unavailable */ }); });
}
