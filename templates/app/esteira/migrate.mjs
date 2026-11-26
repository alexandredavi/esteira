#!/usr/bin/env node
// Aplica as migrações do Drizzle (./drizzle) no Neon, no começo do build da Vercel.
// Instalado por /esteira:deploy; o script "build" do package.json roda este arquivo antes do `next build`.
//
// Só migra quando os DOIS estão definidos no ambiente:
//   DATABASE_URL       — o banco daquele ambiente (a integração Neon da Vercel define)
//   ESTEIRA_MIGRATE=1  — ligado À MÃO, por ambiente, na Vercel:
//                        • Production: sempre.
//                        • Preview: SÓ se a integração Neon cria um branch do banco por preview.
//                          Senão o preview migraria o banco de produção.
// Sem isso (dev local, CI, build sem banco), apenas avisa e segue.
// As migrações são só aditivas (regra do /esteira:dev): um rollback do deploy não quebra o banco.

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function shouldMigrate(env, cwd = process.cwd()) {
  if (!env.DATABASE_URL) return { run: false, reason: "sem DATABASE_URL (dev local ou CI): migração pulada" };
  if (env.ESTEIRA_MIGRATE !== "1") {
    return { run: false, reason: `ESTEIRA_MIGRATE não está ligado neste ambiente${env.VERCEL_ENV ? ` (${env.VERCEL_ENV})` : ""}: migração pulada` };
  }
  if (!existsSync(join(cwd, "drizzle", "meta", "_journal.json"))) return { run: false, reason: "nenhuma migração em ./drizzle" };
  return { run: true, reason: `migrando${env.VERCEL_ENV ? ` (${env.VERCEL_ENV})` : ""}` };
}

async function main() {
  const decision = shouldMigrate(process.env);
  console.log(`[esteira] ${decision.reason}`);
  if (!decision.run) return;
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { migrate } = await import("drizzle-orm/neon-http/migrator");
  await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: join(process.cwd(), "drizzle") });
  console.log("[esteira] migrações aplicadas");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[esteira] migração falhou: ${err.message}`);
    process.exitCode = 1; // falha o build: nada de subir código novo com banco velho
  });
}
