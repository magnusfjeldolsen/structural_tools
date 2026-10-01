import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
import { installAgentApi } from './agent/api.js'; // [C]

installAgentApi(); // [C]
import { initLibraries } from './state/library.js';

initLibraries();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
