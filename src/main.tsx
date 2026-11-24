import { createRoot } from 'react-dom/client';
import './styles/atomm.css';
import './styles/app.css';
import { IS_ATOMM } from './lib/atomm';
import { initLocale } from './lib/i18n';

// the language is settled before anything is drawn, so the app never flashes English first
initLocale(IS_ATOMM).then(async () => {
  const { default: App } = await import('./App');
  createRoot(document.getElementById('root')!).render(<App />);
});
