// Só existe em modo E2E (E2E=1, ligado pelo playwright.config.ts): zera o banco entre testes.
// Em qualquer outro ambiente responde 404.
import { getTableName, is, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

export async function POST() {
  if (process.env.E2E !== "1") return new Response("Not found", { status: 404 });
  const tabelas = (Object.values(schema) as unknown[])
    .filter((t): t is PgTable => is(t, PgTable))
    .map((t) => `"${getTableName(t)}"`);
  if (tabelas.length) {
    const db = await getDb();
    await db.execute(sql.raw(`TRUNCATE ${tabelas.join(", ")} RESTART IDENTITY CASCADE`));
  }
  return Response.json({ ok: true, tabelas: tabelas.length });
}
