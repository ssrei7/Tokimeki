import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import { applyTheme, readThemeMode } from './ui/theme/preferences';

applyTheme(readThemeMode(window.localStorage), window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
