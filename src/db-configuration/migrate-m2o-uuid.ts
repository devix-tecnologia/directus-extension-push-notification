/**
 * As colunas m2o nasceram como char(36) apontando para chaves uuid. O Postgres
 * recusa a foreign key, a relação nunca entra em `directus_relations`, e o
 * alias o2m `user_notification.deliveries` fica sem relação: o Directus o
 * seleciona como coluna e todo `GET /items/user_notification` responde 500.
 *
 * Esta migração roda no boot, antes de criar as relações: converte para uuid
 * o que ainda estiver em char/varchar, e é idempotente.
 */

import type { Logger } from "./migrate-languages.js";

export interface RawKnex {
  raw: (
    sql: string,
    bindings?: unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

export interface ForeignKeyColumn {
  table: string;
  column: string;
}

export interface M2oMigrationResult {
  converted: string[];
  skipped: string[];
  failed: string[];
}

interface StateField {
  collection: string;
  field: string;
  schema?: {
    foreign_key_table?: string | null;
    foreign_key_column?: string | null;
  } | null;
}

/**
 * Colunas m2o que apontam para uma chave `id` (uuid). `languages_code` aponta
 * para `language.code`, que é texto, e fica de fora.
 */
export function uuidForeignKeyColumns(state: {
  fields?: StateField[];
}): ForeignKeyColumn[] {
  return (state.fields ?? [])
    .filter(
      (field) =>
        field.schema?.foreign_key_table &&
        field.schema.foreign_key_column === "id",
    )
    .map((field) => ({ table: field.collection, column: field.field }));
}

const TIPOS_TEXTO = new Set(["character", "character varying", "text"]);

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

export async function migrateM2oColumnsToUuid({
  knex,
  columns,
  logger,
}: {
  knex: RawKnex;
  columns: ForeignKeyColumn[];
  logger: Logger;
}): Promise<M2oMigrationResult> {
  const result: M2oMigrationResult = { converted: [], skipped: [], failed: [] };

  for (const { table, column } of columns) {
    const name = `${table}.${column}`;
    const { rows } = await knex.raw(
      "SELECT data_type FROM information_schema.columns WHERE table_name = ? AND column_name = ?",
      [table, column],
    );
    const dataType = rows[0]?.data_type;
    if (typeof dataType !== "string" || !TIPOS_TEXTO.has(dataType)) {
      result.skipped.push(name);
      continue;
    }

    try {
      // O Directus cria a coluna string com DEFAULT; o Postgres não converte o
      // default para uuid sozinho ("default for column cannot be cast
      // automatically"), e o estado declara default_value null.
      await knex.raw(
        `ALTER TABLE ${quote(table)} ALTER COLUMN ${quote(column)} DROP DEFAULT, ALTER COLUMN ${quote(column)} TYPE uuid USING NULLIF(${quote(column)}, '')::uuid`,
      );
      result.converted.push(name);
      logger.info(
        `[DB Configuration] Column ${name} converted from ${dataType} to uuid`,
      );
    } catch (error) {
      result.failed.push(name);
      logger.error(
        `[DB Configuration] Could not convert ${name} from ${dataType} to uuid: ${(error as Error)?.message}`,
      );
    }
  }

  return result;
}

/** Relação que não pôde ser criada derruba o boot: sem ela a coleção fica ilegível. */
export function relationFailuresMessage(failures: string[]): string {
  return [
    `[DB Configuration] ${failures.length} relation(s) could not be created:`,
    ...failures.map((failure) => `  - ${failure}`),
    "Without them Directus selects the o2m aliases as columns and GET /items/user_notification answers 500.",
  ].join("\n");
}
