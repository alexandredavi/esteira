// A trava da migração no build (o migrate.mjs vai para o produto): nunca migrar sem pedido explícito.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { shouldMigrate } from "../templates/app/esteira/migrate.mjs";

function repo(withJournal = true) {
  const dir = mkdtempSync(join(tmpdir(), "esteira-migrate-"));
  if (withJournal) {
    mkdirSync(join(dir, "drizzle/meta"), { recursive: true });
    writeFileSync(join(dir, "drizzle/meta/_journal.json"), "{}");
  }
  return dir;
}

test("sem DATABASE_URL (dev, CI) nunca migra", () => {
  assert.equal(shouldMigrate({ ESTEIRA_MIGRATE: "1" }, repo()).run, false);
});

test("com DATABASE_URL mas sem ESTEIRA_MIGRATE=1 (ex.: preview sem branch do Neon) não migra", () => {
  const d = shouldMigrate({ DATABASE_URL: "postgres://x", VERCEL_ENV: "preview" }, repo());
  assert.equal(d.run, false);
  assert.match(d.reason, /preview/);
  assert.equal(shouldMigrate({ DATABASE_URL: "postgres://x", ESTEIRA_MIGRATE: "true" }, repo()).run, false, "só o valor 1 liga");
});

test("com os dois ligados migra; sem migrações em ./drizzle não", () => {
  assert.equal(shouldMigrate({ DATABASE_URL: "postgres://x", ESTEIRA_MIGRATE: "1", VERCEL_ENV: "production" }, repo()).run, true);
  assert.equal(shouldMigrate({ DATABASE_URL: "postgres://x", ESTEIRA_MIGRATE: "1" }, repo(false)).run, false);
});
