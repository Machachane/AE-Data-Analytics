import { createRoot } from 'react-dom/client';

import App from './App';
import { ErrorBoundary } from '@/components/error-boundary';
import { setBaseUrl } from '@workspace/api-client-react';
import { deploymentConfig } from '@/lib/deployment-config';

import './index.css';

const root = createRoot(document.getElementById('root')!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
});
try {
  const config = deploymentConfig(import.meta.env.MODE, import.meta.env.VITE_API_ORIGIN, import.meta.env.BASE_URL);
  setBaseUrl(config.apiOrigin);
  root.render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
} catch (error) {
  root.render(
    <main role="alert" style={{ padding: "2rem", color: "#e5eef5", background: "#142c3d", minHeight: "100vh" }}>
      <h1>Deployment configuration required</h1>
      <p>{error instanceof Error ? error.message : "Check the backend connection settings and rebuild the site."}</p>
    </main>,
  );
}
