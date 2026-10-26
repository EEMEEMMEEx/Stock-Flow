import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { pathToFileURL } from 'node:url'
import { VitePWA } from 'vite-plugin-pwa'
import dotenv from 'dotenv'

// Load .env into process.env for local serverless functions and dev middleware
dotenv.config()

function devApiPlugin() {
  const HANDLED_APIS = {
    '/api/r2-upload-url': './api/r2-upload-url.js',
    '/api/sync-to-caim': './api/sync-to-caim.js',
    '/api/caim-webhook': './api/caim-webhook.js',
  };

  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        const matchedRoute = Object.keys(HANDLED_APIS).find(
          route => url === route || url?.endsWith(route)
        );

        if (matchedRoute) {
          try {
            const origin = req.headers?.origin || '*';
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
            res.setHeader(
              'Access-Control-Allow-Headers',
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, X-Internal-Secret'
            );

            if (req.method === 'OPTIONS') {
              res.statusCode = 200;
              res.end();
              return;
            }

            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', async () => {
              try {
                try {
                  req.body = body ? JSON.parse(body) : (req.body || {});
                } catch {
                  req.body = req.body || {};
                }
                const mockRes = {
                  setHeader: (k, v) => res.setHeader(k, v),
                  status: (code) => {
                    res.statusCode = code;
                    return mockRes;
                  },
                  json: (data) => {
                    if (!res.headersSent) {
                      res.setHeader('Content-Type', 'application/json');
                    }
                    res.end(JSON.stringify(data));
                  },
                  end: (chunk) => res.end(chunk),
                };
                const filePath = path.resolve(process.cwd(), HANDLED_APIS[matchedRoute]);
                const fileUrl = pathToFileURL(filePath).href;
                const { default: apiHandler } = await import(`${fileUrl}?t=${Date.now()}`);
                await apiHandler(req, mockRes);
              } catch (err) {
                console.error('[Dev API Middleware Error]', err);
                if (!res.headersSent) {
                  res.statusCode = 500;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: false, message: err.message }));
                }
              }
            });
            return;
          } catch (err) {
            console.error('[Dev API Middleware Error]', err);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, message: err.message }));
            }
            return;
          }
        }
        next();
      });
    }
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [
      react(), 
      tailwindcss(),
      devApiPlugin(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallbackDenylist: [/^\/api/, /^\/rest\/v1/]
        },
        manifest: {
          name: 'Stock Flow System',
          short_name: 'StockFlow',
          description: 'Inventory & Stock Management System',
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
          icons: [
            {
              src: 'favicon.svg',
              sizes: '192x192 512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      modulePreload: false,
      chunkSizeWarningLimit: 1500,
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-pdf': ['@react-pdf/renderer'],
            'vendor-charts': ['recharts'],
            'vendor-ui': ['lucide-react', 'framer-motion'],
            'vendor-utils': ['xlsx', 'date-fns'],
            'vendor-supabase': ['@supabase/supabase-js']
          }
        }
      }
    },
    server: {
      host: true,            // accept connections from LAN / external network
      port: 5173,
      strictPort: true,      // fail instead of silently switching ports
      allowedHosts: true,
    }
  };
})
