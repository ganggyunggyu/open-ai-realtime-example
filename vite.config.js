import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import { createLogger } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logger = createLogger();
const originalWarning = logger.warn;

logger.warn = (msg, options) => {
  if (msg.includes('Complex selectors')) return;
  if (msg.includes('.well-known')) return;
  if (msg.includes('Pre-transform error')) return;
  originalWarning(msg, options);
};

export default {
  root: join(__dirname, 'client'),
  build: {
    outDir: join(__dirname, 'dist/client'),
    emptyOutDir: true,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'CSS_SELECTOR_WARNING') return;
        warn(warning);
      },
    },
  },
  plugins: [react()],
  customLogger: logger,
  server: {
    allowedHosts: [
      '.railway.app',
      '.up.railway.app',
      'localhost',
    ],
    fs: {
      strict: false,
      allow: ['.'],
    },
    hmr: {
      overlay: false,
    },
  },
};
