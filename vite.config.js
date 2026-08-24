import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    // Honour a harness/CI-assigned port; fall back to Vite's usual 5173.
    port: Number(process.env.PORT) || 5173
  },
  build: {
    rollupOptions: {
      output: {
        /* Split the big, stable third-party libraries out of the app chunk.
           Two wins: they stay cached across app updates instead of being
           invalidated by every code change, and the parse cost is spread
           across chunks the browser can compile in parallel rather than one
           2.5MB blocking file. Route-level code splitting lives in src/App.jsx. */
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
          if (id.includes('jspdf') || id.includes('html2canvas')) return 'vendor-pdf';
          if (id.includes('firebase') || id.includes('@firebase')) return 'vendor-firebase';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('scheduler')) return 'vendor-react';
          return 'vendor';
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: false
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'CricScorer Pro',
        short_name: 'CricScorer Pro',
        description: 'Elite Street Cricket Scoring App',
        theme_color: '#1e1b4b',
        icons: [
          {
            src: '/logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ]
});
