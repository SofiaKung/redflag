
import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const ArchitectureDiagram = lazy(() => import('./src/components/ArchitectureDiagram'));

const isArchRoute = window.location.hash === '#/architecture';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isArchRoute ? (
      <Suspense fallback={<div className="flex items-center justify-center h-screen text-white bg-gray-950">Loading architecture...</div>}>
        <ArchitectureDiagram />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
