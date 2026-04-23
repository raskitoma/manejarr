import 'dotenv/config';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const config = {
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',

  // Paths
  dataDir: resolve(__dirname, '..', 'data'),
  distDir: resolve(__dirname, '..', 'dist'),
  dbPath: resolve(__dirname, '..', 'data', 'manejarr.db'),

  // Security
  encryptionKey: process.env.ENCRYPTION_KEY || '',
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
};

export default config;
