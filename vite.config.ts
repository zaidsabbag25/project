import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
const legacy: Record<string, string> = {
  '/home-bage.html': '/',
  '/shop-page.html': '/shop',
  '/product.html': '/shop',
  '/cart.html': '/cart',
  '/contact-us.html': '/contact',
  '/blog.html': '/blog',
  '/article.html': '/blog/a-room-to-unwind',
  '/my-acount.html': '/account',
  '/nav-cart.html': '/cart',
  '/sign-in.html': '/sign-in',
  '/sigm-up.html': '/sign-up',
};
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_TARGET || 'http://127.0.0.1:3001';
  return {
    plugins: [
      react(),
      {
        name: 'legacy-html-redirects',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const path = (req.url || '').split('?')[0];
            if (legacy[path]) {
              res.writeHead(302, { Location: legacy[path] });
              res.end();
              return;
            }
            next();
          });
        },
        configurePreviewServer(server) {
          server.middlewares.use((req, res, next) => {
            const path = (req.url || '').split('?')[0];
            if (legacy[path]) {
              res.writeHead(302, { Location: legacy[path] });
              res.end();
              return;
            }
            next();
          });
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': apiTarget,
        '/images/uploads': apiTarget,
      },
    },
    preview: { host: '127.0.0.1', port: 4173 },
  };
});
