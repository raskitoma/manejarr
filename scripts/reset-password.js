#!/usr/bin/env node

/**
 * CLI utility to reset the Manejarr admin password.
 * Usage: node scripts/reset-password.js <new-password>
 *
 * Can be run inside the Docker container:
 *   docker exec manejarr node scripts/reset-password.js mynewpassword
 */

import bcrypt from 'bcrypt';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env');
const SALT_ROUNDS = 12;

async function main() {
  const newPassword = process.argv[2];

  if (!newPassword) {
    console.error('Usage: node scripts/reset-password.js <new-password>');
    process.exit(1);
  }

  if (newPassword.length < 4) {
    console.error('Error: Password must be at least 4 characters long.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  // Update .env file if it exists
  if (existsSync(envPath)) {
    let envContent = readFileSync(envPath, 'utf-8');

    if (envContent.includes('ADMIN_PASSWORD_HASH=')) {
      envContent = envContent.replace(
        /ADMIN_PASSWORD_HASH=.*/,
        `ADMIN_PASSWORD_HASH=${hash}`
      );
    } else {
      envContent += `\nADMIN_PASSWORD_HASH=${hash}\n`;
    }

    writeFileSync(envPath, envContent);
    console.log('✓ Password updated in .env file.');
  } else {
    console.log('No .env file found. Set this environment variable:');
  }

  console.log(`\nADMIN_PASSWORD_HASH=${hash}`);
  console.log('\n✓ Restart the container for changes to take effect.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
