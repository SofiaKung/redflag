import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/screenshot': {
            target: `https://production-sfo.browserless.io`,
            changeOrigin: true,
            rewrite: (_path: string) => `/screenshot?token=${encodeURIComponent(env.BROWSERLESS_TOKEN || '')}`,
          },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.WHOIS_API_KEY': JSON.stringify(env.WHOIS_API_KEY),
        'process.env.BROWSERLESS_TOKEN': JSON.stringify(env.BROWSERLESS_TOKEN),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
