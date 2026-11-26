// Banco local (PGlite) com as migrações aplicadas. Usado pelo dev local, pelos testes e pelo E2E.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./index";
import * as schema from "./schema";

const MIGRACOES = join(process.cwd(), "drizzle");

export async function criarDbLocal(dataDir = "memory://"): Promise<Db> {
  const db = drizzle(new PGlite(dataDir), { schema });
  if (existsSync(join(MIGRACOES, "meta", "_journal.json"))) {
    await migrate(db, { migrationsFolder: MIGRACOES });
  }
  return db as unknown as Db;
}
