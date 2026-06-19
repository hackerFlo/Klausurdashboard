import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import "@fontsource/source-sans-3/400.css";
import "@fontsource/source-sans-3/700.css";
import "@fontsource/source-sans-3/400-italic.css";
import "@fontsource/source-sans-3/700-italic.css";
import "@fontsource/roboto/700.css";
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
