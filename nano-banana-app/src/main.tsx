import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

function bootstrapAuthTokenFromURL() {
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('auth_token') || params.get('token') || '').trim();
  if (!token) {
    return;
  }

  localStorage.setItem('auth_token', token);
  localStorage.setItem('user_manager_token', token);
  sessionStorage.setItem('auth_token', token);
  sessionStorage.setItem('user_manager_token', token);
}

bootstrapAuthTokenFromURL();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
