import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { applyCustomCss, applyTheme, readCustomCss, readThemeMode } from './ui/theme/preferences';

applyTheme(readThemeMode(window.localStorage), window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
applyCustomCss(readCustomCss(window.localStorage));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
