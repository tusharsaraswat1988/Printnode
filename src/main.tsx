import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global fetch interceptor to support Bearer Token fallback in iframe / cookie-less environments
const originalFetch = window.fetch;
const customFetch = async function (input: RequestInfo | URL, init?: RequestInit) {
  const token = localStorage.getItem("print_auth_token");
  let url = "";
  if (typeof input === "string") {
    url = input;
  } else if (input instanceof URL) {
    url = input.toString();
  } else if (input && typeof input === "object" && "url" in input) {
    url = (input as any).url;
  }

  // Inject token if target is an internal /api/ endpoint
  if (token && (url.startsWith("/api") || url.includes("/api/"))) {
    init = init || {};
    const headers = new Headers(init.headers || {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    init.headers = headers;
  }
  return originalFetch(input, init);
};

try {
  Object.defineProperty(window, 'fetch', {
    value: customFetch,
    configurable: true,
    writable: true,
    enumerable: true
  });
} catch (e) {
  console.warn("Could not override window.fetch using Object.defineProperty, trying direct assignment:", e);
  try {
    (window as any).fetch = customFetch;
  } catch (err) {
    console.error("Critical: Global fetch interceptor failed to initialize:", err);
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
