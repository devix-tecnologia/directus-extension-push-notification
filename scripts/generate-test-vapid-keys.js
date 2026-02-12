#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate VAPID keys for testing
 * This script generates temporary VAPID keys and exports them as environment variables
 * 
 * Usage:
 *   node scripts/generate-test-vapid-keys.js
 *   
 * Or add to package.json scripts:
 *   "generate:vapid": "node scripts/generate-test-vapid-keys.js"
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

console.log('🔑 Generating VAPID keys for testing...\n');

try {
  // Generate VAPID keys using web-push
  const output = execSync('npx web-push generate-vapid-keys', {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit']
  });

  // Extract public and private keys from output
  const publicKeyMatch = output.match(/Public Key:\s*(\S+)/);
  const privateKeyMatch = output.match(/Private Key:\s*(\S+)/);

  if (!publicKeyMatch || !privateKeyMatch) {
    throw new Error('Failed to parse VAPID keys from output');
  }

  const publicKey = publicKeyMatch[1];
  const privateKey = privateKeyMatch[1];

  // Create .env content
  const envContent = `# Auto-generated VAPID keys for testing
# Generated at: ${new Date().toISOString()}
# ⚠️ DO NOT use these keys in production!

VAPID_PUBLIC_KEY=${publicKey}
VAPID_PRIVATE_KEY=${privateKey}
`;

  // Write to .env.test file
  const envPath = join(process.cwd(), '.env.test');
  writeFileSync(envPath, envContent);

  console.log('✅ VAPID keys generated successfully!\n');
  console.log(`   VAPID_PUBLIC_KEY=${publicKey.substring(0, 20)}...`);
  console.log(`   VAPID_PRIVATE_KEY=${privateKey.substring(0, 20)}...`);
  console.log(`\n📝 Keys saved to: .env.test`);
  console.log('\n📋 To use with docker-compose:');
  console.log('   docker-compose --env-file .env.test -f docker-compose.test.yml up\n');

  // Also output for CI/CD environments (GitHub Actions, etc.)
  if (process.env.CI || process.env.GITHUB_ACTIONS) {
    console.log('🔄 CI/CD environment detected');
    console.log(`::set-output name=vapid_public_key::${publicKey}`);
    console.log('::add-mask::' + privateKey);
  }

  process.exit(0);
} catch (error) {
  console.error('❌ Error generating VAPID keys:', error.message);
  process.exit(1);
}
