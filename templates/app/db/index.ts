// Acesso ao banco — instalado pela esteira (/esteira:dev). Um único ponto de entrada: getDb().
//
// - Com DATABASE_URL (Neon, em preview e produção): Postgres serverless via HTTP.
// - Sem DATABASE_URL (dev local, testes, CI): PGlite, um Postgres em processo. Em memória por padrão;
//   PGLITE_DIR=.esteira/pglite guarda os dados entre reinícios do `npm run dev`.
//   As migrações de ./drizzle são aplicadas na primeira conexão.
//
// Regras de negócio NÃO chamam getDb(): recebem o `db` por parâmetro (src/lib/domain/*), para os testes
// passarem um banco em memória (src/db/testing.ts).
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

const global = globalThis as unknown as { __esteiraDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  global.__esteiraDb ??= conectar();
  return global.__esteiraDb;
}

async function conectar(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { neon } = await import("@neondatabase/serverless");
    const { drizzle } = await import("drizzle-orm/neon-http");
    return drizzle(neon(url), { schema }) as unknown as Db;
  }
  const { criarDbLocal } = await import("./local");
  return criarDbLocal(process.env.PGLITE_DIR ?? "memory://");
}
