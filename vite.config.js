import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'
import dotenv from 'dotenv'

// Load .env into process.env for local serverless functions and dev middleware
dotenv.config()

function devApiPlugin() {
  return {
    name: 'dev-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0];
        const isR2UploadUrl = url === '/api/r2-upload-url' || url?.endsWith('/api/r2-upload-url');
        const isSendEmail = url === '/api/send-email' || url?.endsWith('/api/send-email');
        if (isR2UploadUrl || isSendEmail) {
          try {
            const origin = req.headers?.origin || '*';
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
            res.setHeader(
              'Access-Control-Allow-Headers',
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
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
                req.body = body ? JSON.parse(body) : {};
              } catch {
                req.body = {};
              }
              const mockRes = {
                setHeader: (k, v) => res.setHeader(k, v),
                status: (code) => {
                  res.statusCode = code;
                  return {
                    json: (data) => {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(data));
                    },
                    end: () => res.end(),
                  };
                },
              };
              const { default: apiHandler } = isSendEmail
                ? await import('./api/send-email.js')
                : await import('./api/r2-upload-url.js');
              await apiHandler(req, mockRes);
            });
            return;
          } catch (err) {
            console.error('[Dev API Middleware Error]', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ success: false, message: err.message }));
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
