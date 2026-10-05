import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { getClientScript } from "../../src/push-client-script/client-script.js";

const VAPID =
  "BOrqY0lN6r1sVJbSZqPm0Mf8C3kD9xQ2nT7wH5yL4aE1uI0oP3jK6gF8dS2aZ9xC";
const PUBLIC_URL = "https://directus.example.com";

describe("nenhuma saída no console do navegador do usuário", () => {
  it("o script de cliente gerado por padrão não chama console", () => {
    expect(getClientScript(VAPID, PUBLIC_URL)).not.toMatch(/\bconsole\s*[.[]/);
  });

  it("o script de cliente com debug desligado explicitamente não chama console", () => {
    expect(getClientScript(VAPID, PUBLIC_URL, { debug: false })).not.toMatch(
      /\bconsole\s*[.[]/,
    );
  });

  it("o service worker publicado não chama console", () => {
    const sw = readFileSync(
      new URL("../../service-worker.js", import.meta.url),
      "utf8",
    );
    expect(sw).not.toMatch(/\bconsole\s*[.[]/);
  });
});

describe("diagnóstico por opt-in", () => {
  it("só com debug ligado o script de cliente escreve no console", () => {
    expect(getClientScript(VAPID, PUBLIC_URL, { debug: true })).toMatch(
      /\bconsole\.debug\(/,
    );
  });

  it("não expõe a chave VAPID no console nem com debug ligado", () => {
    const script = getClientScript(VAPID, PUBLIC_URL, { debug: true });
    expect(script).not.toMatch(/log\([^)]*VAPID_PUBLIC_KEY/);
  });
});

describe("script de cliente gerado", () => {
  it.each([false, true])("é JavaScript válido (debug=%s)", (debug) => {
    const script = getClientScript(VAPID, PUBLIC_URL, { debug });
    expect(() => new Function(script)).not.toThrow();
  });
});
