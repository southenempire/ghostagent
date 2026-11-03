import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Serves the agent API (agent/api.js) from the dev server, so keys stay in Node and never reach the browser
const ghostAgentApi = () => ({
  name: 'ghostagent-api',
  async configureServer(server) {
    const { apiMiddleware } = await import('./agent/api.js');
    server.middlewares.use('/api', (req, res, next) => {
      req.url = `/api${req.url}`;
      apiMiddleware(req, res, next);
    });
  },
});

export default defineConfig({
  plugins: [react(), ghostAgentApi()],
  server: {
    port: 3000,
    host: '127.0.0.1',
  },
});
