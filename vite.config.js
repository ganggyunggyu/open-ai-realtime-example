import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  root: join(__dirname, 'client'),
  build: {
    outDir: join(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  plugins: [react()],
  server: {
    allowedHosts: [
      '.railway.app',
      '.up.railway.app',
      'localhost',
    ],
  },
};
