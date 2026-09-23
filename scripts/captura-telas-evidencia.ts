/**
 * Captura as telas do Directus nas coleções da extensão, para evidência de task.
 *
 * Gera o par antes/depois pela convenção do geohub: as imagens ficam em
 * `TASKS/assets/`, com o momento no NOME e não em subpasta, para o par aparecer
 * lado a lado ao abrir a pasta:
 *
 *   TASKS/assets/task-<task>-<tela>-<momento>.png
 *
 * O "antes" não é imagem antiga renomeada: é uma captura nova, feita contra um
 * Directus rodando a extensão construída na revisão anterior à task. A única
 * diferença entre as duas capturas deve ser a extensão.
 *
 * Uso (com o Directus do docker-compose.test.yml no ar):
 *
 *   DIRECTUS_URL=http://localhost:PORTA EVIDENCE_TASK=010 EVIDENCE_MOMENT=antes \
 *     node scripts/captura-telas-evidencia.ts
 *
 * `CHROME_CHANNEL=chrome` usa o Chrome instalado no sistema, para máquinas em
 * que o Chromium do Playwright não foi baixado.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const DIRECTUS_URL = process.env.DIRECTUS_URL ?? "http://localhost:8055";
const EMAIL = process.env.DIRECTUS_ADMIN_EMAIL ?? "admin@example.com";
const SENHA = process.env.DIRECTUS_ADMIN_PASSWORD ?? "test-password-not-a-leak";
const TASK = process.env.EVIDENCE_TASK;
const MOMENTO = process.env.EVIDENCE_MOMENT;
const SAIDA = process.env.EVIDENCE_DIR ?? "TASKS/assets";
const VIEWPORT = { width: 1600, height: 900 };

if (!TASK || !MOMENTO) {
  throw new Error(
    "Defina EVIDENCE_TASK (ex.: 010) e EVIDENCE_MOMENT (antes|depois).",
  );
}

interface Sessao {
  token: string;
}

async function api<T>(
  sessao: Sessao | null,
  caminho: string,
  init: RequestInit = {},
): Promise<T> {
  const resposta = await fetch(`${DIRECTUS_URL}${caminho}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(sessao ? { Authorization: `Bearer ${sessao.token}` } : {}),
      ...init.headers,
    },
  });
  if (!resposta.ok) {
    throw new Error(
      `${init.method ?? "GET"} ${caminho}: ${resposta.status} ${await resposta.text()}`,
    );
  }

  return ((await resposta.json()) as { data: T }).data;
}

async function entrarPelaApi(): Promise<Sessao> {
  const { access_token } = await api<{ access_token: string }>(
    null,
    "/auth/login",
    {
      method: "POST",
      body: JSON.stringify({ email: EMAIL, password: SENHA }),
    },
  );
  return { token: access_token };
}

/** A coleção de idiomas se chama `languages` antes da task-010 e `language` depois. */
async function colecaoDeIdiomas(sessao: Sessao): Promise<string> {
  const colecoes = await api<{ collection: string }[]>(sessao, "/collections");
  const nomes = colecoes.map((c) => c.collection);
  const encontrada = ["language", "languages"].find((nome) =>
    nomes.includes(nome),
  );
  if (!encontrada)
    throw new Error(`Nenhuma coleção de idiomas entre: ${nomes.join(", ")}`);
  return encontrada;
}

/**
 * Uma notificação com duas traduções, para a interface de traduções ter o que
 * mostrar. `in_app` para o hook da extensão não disparar push de verdade.
 */
async function criarNotificacaoDeExemplo(sessao: Sessao): Promise<string> {
  const eu = await api<{ id: string }>(sessao, "/users/me");
  const criada = await api<{ id: string }>(sessao, "/items/user_notification", {
    method: "POST",
    body: JSON.stringify({
      title: "Viatura 21 chegou ao destino",
      body: "A viatura 21 registrou chegada ao ponto de apoio.",
      user: eu.id,
      channel: "in_app",
      priority: "normal",
      translations: [
        {
          languages_code: "pt-BR",
          title: "Viatura 21 chegou ao destino",
          body: "A viatura 21 registrou chegada ao ponto de apoio.",
        },
        {
          languages_code: "en-US",
          title: "Vehicle 21 reached its destination",
          body: "Vehicle 21 checked in at the support point.",
        },
      ],
    }),
  });
  return criada.id;
}

async function entrarPelaTela(pagina: Page): Promise<void> {
  await pagina.goto(`${DIRECTUS_URL}/admin/login`);
  await pagina.locator('input[type="email"]').fill(EMAIL);
  await pagina.locator('input[type="password"]').fill(SENHA);
  await pagina.locator('button[type="submit"]').click();
  await pagina.waitForURL((url) => !url.pathname.includes("/login"), {
    timeout: 60_000,
  });
}

async function capturar(
  pagina: Page,
  tela: string,
  caminho: string,
  esperarPor: string,
): Promise<void> {
  await pagina.goto(`${DIRECTUS_URL}${caminho}`);
  await pagina
    .locator(esperarPor)
    .first()
    .waitFor({ state: "visible", timeout: 60_000 });
  await pagina.waitForLoadState("networkidle");
  // o app anima a entrada dos painéis; sem folga, a captura pega o meio da transição
  await pagina.waitForTimeout(1_500);
  const arquivo = join(SAIDA, `task-${TASK}-${tela}-${MOMENTO}.png`);
  await pagina.screenshot({ path: arquivo, fullPage: true });
  process.stdout.write(`[evidencia] ${arquivo}\n`);
}

/**
 * O campo de traduções fica abaixo da dobra, e a tela de item do Directus rola
 * dentro de um painel próprio — o `fullPage` não o alcança. Fecha o diálogo de
 * erro, se houver (é o que a versão com defeito mostra ao abrir o item), e rola
 * até o rótulo do campo.
 */
async function capturarCampoDeTraducoes(pagina: Page): Promise<void> {
  const dispensar = pagina.getByRole("button", { name: /dismiss|dispensar/i });
  if (await dispensar.isVisible().catch(() => false)) await dispensar.click();

  await pagina
    .getByText("Translations", { exact: true })
    .first()
    .scrollIntoViewIfNeeded();
  await pagina.waitForLoadState("networkidle");
  await pagina.waitForTimeout(1_500);
  const arquivo = join(SAIDA, `task-${TASK}-campo-de-traducoes-${MOMENTO}.png`);
  await pagina.screenshot({ path: arquivo });
  process.stdout.write(`[evidencia] ${arquivo}\n`);
}

async function main(): Promise<void> {
  mkdirSync(SAIDA, { recursive: true });
  const sessao = await entrarPelaApi();
  const idiomas = await colecaoDeIdiomas(sessao);
  const notificacao = await criarNotificacaoDeExemplo(sessao);
  process.stdout.write(
    `[evidencia] coleção de idiomas: ${idiomas}; notificação ${notificacao}` +
      "\n",
  );

  const navegador = await chromium.launch({
    channel: process.env.CHROME_CHANNEL || undefined,
  });
  try {
    const pagina = await navegador.newPage({
      viewport: VIEWPORT,
      locale: "pt-BR",
    });
    await entrarPelaTela(pagina);

    await capturar(
      pagina,
      "modelo-de-dados",
      "/admin/settings/data-model",
      ".v-list, .v-table",
    );
    // a listagem de conteúdo mostra só o nome de exibição ("Languages") nas duas
    // versões; o nome técnico da coleção aparece é no Data Model
    await capturar(
      pagina,
      "colecao-de-idiomas",
      `/admin/settings/data-model/${idiomas}`,
      ".v-form, .fields",
    );
    await capturar(
      pagina,
      "notificacao-aberta",
      `/admin/content/user_notification/${notificacao}`,
      ".v-form",
    );
    await capturarCampoDeTraducoes(pagina);
  } finally {
    await navegador.close();
  }
}

await main();
