import { exec } from "node:child_process";
import { promisify } from "node:util";
import { logger } from "./test-logger.js";

const execAsync = promisify(exec);

// Detectar qual comando do Docker Compose está disponível
let dockerComposeCommand: string | null = null;

async function getDockerComposeCommand(): Promise<string> {
  if (dockerComposeCommand) {
    return dockerComposeCommand;
  }

  try {
    await execAsync("docker compose version");
    dockerComposeCommand = "docker compose";
    logger.info("Using 'docker compose' command");
  } catch {
    try {
      await execAsync("docker-compose version");
      dockerComposeCommand = "docker-compose";
      logger.info("Using 'docker-compose' command");
    } catch {
      throw new Error(
        "Neither 'docker compose' nor 'docker-compose' command is available",
      );
    }
  }

  return dockerComposeCommand;
}

export async function setupTestEnvironment(testSuiteId: string): Promise<void> {
  logger.info(`Setting up test environment for suite: ${testSuiteId}`);

  try {
    // Build a extensão
    logger.info("Building extension...");
    await execAsync("pnpm build");

    // Iniciar o ambiente Docker
    logger.info("Starting Docker Compose...");
    const composeCmd = await getDockerComposeCommand();
    const { stdout, stderr } = await execAsync(
      `TEST_SUITE_ID=${testSuiteId} DIRECTUS_VERSION=${process.env.DIRECTUS_VERSION || "11.13.4"} ${composeCmd} -f docker-compose.test.yml up -d directus`,
    );

    if (stderr) logger.warn(`Docker Compose stderr: ${stderr}`);
    logger.info(`Docker Compose stdout: ${stdout}`);

    // Aguardar o Directus estar pronto
    await waitForDirectus(testSuiteId);

    // Obter token de acesso
    const token = await getAccessToken(testSuiteId);
    process.env.DIRECTUS_ACCESS_TOKEN = token;

    logger.info("✓ Test environment setup complete");
  } catch (error) {
    logger.error("Failed to setup test environment:", error);
    throw error;
  }
}

export async function teardownTestEnvironment(
  testSuiteId: string,
): Promise<void> {
  logger.info(`Tearing down test environment for suite: ${testSuiteId}`);

  try {
    const composeCmd = await getDockerComposeCommand();
    await execAsync(
      `TEST_SUITE_ID=${testSuiteId} ${composeCmd} -f docker-compose.test.yml down -v`,
    );
    logger.info("✓ Test environment teardown complete");
  } catch (error) {
    logger.error("Failed to teardown test environment:", error);
    throw error;
  }
}

async function waitForDirectus(
  testSuiteId: string,
  maxRetries = 120,
): Promise<void> {
  const containerName = `directus-push-notification-${testSuiteId}-${process.env.DIRECTUS_VERSION || "latest"}`;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const { stdout } = await execAsync(
        `docker exec ${containerName} wget --no-verbose --tries=1 --spider http://127.0.0.1:8055/server/health 2>&1`,
      );

      if (stdout.includes("200 OK")) {
        logger.info("✓ Directus is ready");
        return;
      }
    } catch {
      // Ignorar erro e tentar novamente
    }

    logger.info(`Waiting for Directus to be ready... (${i + 1}/${maxRetries})`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  throw new Error("Directus failed to start within expected time");
}

async function getAccessToken(testSuiteId: string): Promise<string> {
  const containerName = `directus-push-notification-${testSuiteId}-${process.env.DIRECTUS_VERSION || "latest"}`;

  const { stdout } = await execAsync(
    `docker exec ${containerName} wget -qO- --post-data='{"email":"admin@example.com","password":"admin123"}' --header='Content-Type:application/json' http://127.0.0.1:8055/auth/login`,
  );

  const response = JSON.parse(stdout);

  if (!response.data?.access_token) {
    throw new Error("Failed to get access token");
  }

  logger.info("✓ Access token obtained");
  return response.data.access_token;
}

export async function dockerHttpRequest(
  method: string,
  path: string,
  data?: Record<string, unknown>,
  headers?: Record<string, string>,
  testSuiteId?: string,
): Promise<Record<string, unknown>> {
  const containerName = `directus-push-notification-${testSuiteId || "main"}-${process.env.DIRECTUS_VERSION || "latest"}`;

  const curlHeaders = headers
    ? Object.entries(headers)
        .map(([key, value]) => `--header '${key}:${value}'`)
        .join(" ")
    : "";

  const dataParam = data ? `--data '${JSON.stringify(data)}'` : "";

  const { stdout } = await execAsync(
    `docker exec ${containerName} wget -qO- --method=${method} ${curlHeaders} ${dataParam} --header='Content-Type:application/json' http://127.0.0.1:8055${path}`,
  );

  return JSON.parse(stdout);
}
