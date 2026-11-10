import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { BUILD_ID } from './build';

createRoot(document.getElementById('root')!).render(<App />);

(window as unknown as { __planforgeBuild: string }).__planforgeBuild = BUILD_ID;

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !navigator.webdriver) {
  // a new build replaces the running one as soon as it is installed, then reloads the page once
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      reg.update().catch(() => { /* offline */ });
      setInterval(() => reg.update().catch(() => { /* offline */ }), 60 * 60 * 1000);
    }).catch(() => { /* offline cache unavailable */ });
  });
}
