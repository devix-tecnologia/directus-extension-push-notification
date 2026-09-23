interface FileReader {
  readOne: (id: string) => Promise<unknown>;
}

interface IconPayload {
  icon?: unknown;
}

/**
 * Impede que uma notificação referencie um arquivo que quem a está criando não
 * pode ler. O Directus aceita a escrita de um M2O sem validar permissão de
 * leitura no alvo, e o endpoint de ícone serve o asset com a credencial do
 * serviço — sem esta checagem, quem pode criar notificação lê qualquer arquivo.
 *
 * A leitura é tentada com a accountability do próprio requisitante, então o erro
 * de permissão vem do Directus e sobe como 403.
 */
export async function assertIconReadable<TAccountability>(
  payload: IconPayload,
  readFileAs: (accountability: TAccountability) => FileReader,
  accountability: TAccountability,
): Promise<void> {
  const icon = payload.icon;

  if (typeof icon !== "string" || icon === "") return;

  await readFileAs(accountability).readOne(icon);
}
