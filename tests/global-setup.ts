/**
 * Playwright Global Setup
 * Inicia o ambiente Docker antes de todos os testes E2E
 */

import { setupTestEnvironment } from './setup';

export default async function globalSetup() {
  const testSuiteId = process.env.TEST_SUITE_ID || 'e2e-main';
  const directusVersion = process.env.DIRECTUS_VERSION || '11.15.1';
  
  console.log('\n🚀 Starting Directus container for E2E tests...\n');
  console.log(`   Suite ID: ${testSuiteId}`);
  console.log(`   Directus Version: ${directusVersion}\n`);
  
  // Garantir que DIRECTUS_VERSION está definido
  process.env.DIRECTUS_VERSION = directusVersion;
  
  await setupTestEnvironment(testSuiteId);
  
  console.log('\n✅ Directus container is ready!\n');
  
  // Salvar o testSuiteId para o teardown
  process.env.TEST_SUITE_ID = testSuiteId;
}
